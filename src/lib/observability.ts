/**
 * Error reporting.
 *
 * The gap this fills is not "we have no Sentry account". It is that errors were
 * being thrown away before anything could report them: of 39 catch blocks under
 * src/app/api, 16 were written `} catch {`, discarding the error object outright,
 * and only 7 logged anything at all. Installing a monitoring SDK on top of that
 * would have reported almost nothing, because the failures never escaped the
 * route that caused them. So the first job is capture, and the second is getting
 * what we capture somewhere a human will see it.
 *
 * Deliberately provider-agnostic and dependency-free:
 *
 *   - Every report is written to stderr as a single-line JSON object. Every
 *     serious host — Vercel, Railway, Fly, Render, a plain container behind
 *     journald — collects stderr and can parse structured lines. That means
 *     reporting works on day one with no account, no key and no vendor lock-in.
 *   - If ERROR_WEBHOOK_URL is set, reports are also POSTed there, which turns
 *     logs into actual alerts (Slack and Discord incoming webhooks both accept
 *     the payload shape below).
 *   - If you later want Sentry, `captureException` goes in one place — the
 *     `deliver` function — and every call site already passes useful context.
 *
 * Three rules this module follows without exception.
 *
 * It never throws. It is called from inside catch blocks, where a second
 * exception would replace a handled 500 with an unhandled crash, and would hide
 * the original error in the process. Every path is wrapped.
 *
 * It never blocks the response. Webhook delivery is fire-and-forget; a slow
 * alerting endpoint must not add latency to checkout.
 *
 * It redacts before it emits. Error messages routinely contain connection
 * strings, tokens and signatures — a monitoring pipeline is one of the classic
 * ways secrets end up in a third-party system.
 */

/** Substrings that mark a context key as unsafe to emit in full. */
const SENSITIVE_KEY = /pass|secret|token|key|auth|cookie|signature|otp|card|cvv/i;

/**
 * Values that look like credentials, redacted out of free text.
 * Error messages are not structured, so this works on the string itself:
 * postgres URLs (with the password inline), Razorpay keys, bearer tokens, and
 * long hex strings, which in this codebase are session tokens and HMAC digests.
 */
const SENSITIVE_VALUE: [RegExp, string][] = [
  [/postgres(?:ql)?:\/\/[^\s"']+/gi, "postgres://[redacted]"],
  [/\brzp_(?:test|live)_[A-Za-z0-9]+/g, "rzp_[redacted]"],
  [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]"],
  [/\b[a-f0-9]{32,}\b/gi, "[redacted-hex]"],
];

function redactText(text: string): string {
  let out = text;
  for (const [pattern, replacement] of SENSITIVE_VALUE) out = out.replace(pattern, replacement);
  // A runaway message (a whole HTML error page, a giant query) would bloat every
  // log line and can itself contain data we don't want to ship.
  return out.length > 2000 ? out.slice(0, 2000) + "…[truncated]" : out;
}

/**
 * Context the caller attaches to a report: order id, route, event type. Anything
 * that helps answer "which request was this" without dumping the request body.
 */
export type ErrorContext = Record<string, unknown>;

function redactContext(context: ErrorContext): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (value === undefined) continue;
    if (SENSITIVE_KEY.test(key)) {
      // Keep the key — knowing a signature was present is useful — but never
      // the value, and not even its length for very short values.
      out[key] = "[redacted]";
      continue;
    }
    if (typeof value === "string") out[key] = redactText(value);
    else if (typeof value === "number" || typeof value === "boolean" || value === null) out[key] = value;
    // Anything else (nested objects, class instances, buffers) is summarised
    // rather than serialised, because we can't know what's inside it.
    else if (Array.isArray(value)) out[key] = `[array:${value.length}]`;
    else out[key] = `[${typeof value}]`;
  }
  return out;
}

/** What we can extract from something thrown, which in JS may not be an Error. */
function describe(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactText(error.message),
      stack: error.stack ? redactText(error.stack) : undefined,
    };
  }
  if (typeof error === "string") return { name: "thrown", message: redactText(error) };
  try {
    return { name: "thrown", message: redactText(JSON.stringify(error) ?? String(error)) };
  } catch {
    return { name: "thrown", message: "unserialisable value thrown" };
  }
}

/**
 * A stable grouping key, so a thousand instances of one bug read as one problem.
 * Built from the error name, its message with variable parts removed, and the
 * top frame of the stack — the same inputs an APM would fingerprint on.
 */
function fingerprint(described: { name: string; message: string; stack?: string }, scope: string): string {
  const generalisedMessage = described.message
    .replace(/\d+/g, "N") // ids, counts, amounts
    .replace(/["'`][^"'`]*["'`]/g, "S") // quoted values
    .slice(0, 120);
  const topFrame = described.stack?.split("\n")[1]?.trim().slice(0, 120) ?? "";
  return `${scope}|${described.name}|${generalisedMessage}|${topFrame}`;
}

/**
 * Alert suppression, so an error storm doesn't become an alert storm.
 *
 * In-memory on purpose, unlike the auth rate limiter which had to move to the
 * database. The tradeoffs are opposite: there, a per-instance counter meant an
 * attacker got one login budget per instance, which defeated the control. Here
 * the worst case of per-instance state is that a three-instance deployment sends
 * three alerts for the same bug instead of one — mildly noisy, and strictly
 * better than adding a database write to the failure path, which is exactly when
 * the database may be the thing that's broken.
 */
const alertWindowMs = 5 * 60 * 1000;
const alertsPerWindow = 3;
const recentAlerts = new Map<string, { count: number; resetAt: number }>();

function shouldAlert(key: string): boolean {
  const now = Date.now();
  const existing = recentAlerts.get(key);
  if (!existing || existing.resetAt <= now) {
    recentAlerts.set(key, { count: 1, resetAt: now + alertWindowMs });
    // Bounded so a high-cardinality fingerprint can't grow this without limit.
    if (recentAlerts.size > 500) {
      for (const [k, v] of recentAlerts) if (v.resetAt <= now) recentAlerts.delete(k);
    }
    return true;
  }
  existing.count += 1;
  return existing.count <= alertsPerWindow;
}

/** Severity, kept to the two cases that actually change what a human does. */
export type Severity = "error" | "warning";

export type Report = {
  severity: Severity;
  /** Where it happened: a route path, a job name, "webhook". */
  scope: string;
  name: string;
  message: string;
  stack?: string;
  fingerprint: string;
  context: Record<string, unknown>;
  timestamp: string;
  environment: string;
};

/** POSTs to ERROR_WEBHOOK_URL. Never awaited by a request handler. */
function postToWebhook(report: Report): void {
  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url) return;
  if (!shouldAlert(report.fingerprint)) return;

  // `text` first, because Slack and Discord webhooks require it and ignore the
  // rest; a generic collector gets the structured fields it wants.
  const payload = {
    text: `[${report.environment}] ${report.severity} in ${report.scope}: ${report.name}: ${report.message}`,
    ...report,
  };

  try {
    // AbortSignal.timeout keeps a hanging alerting endpoint from holding a
    // socket open indefinitely on a serverless instance.
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {
      // A failed alert must stay silent. Logging it here risks a loop where the
      // webhook failure reports itself and fails again.
    });
  } catch {
    // Ignored for the same reason.
  }
}

/**
 * Record a failure.
 *
 * @param error   whatever was caught
 * @param scope   where it happened — route path, job name
 * @param context identifying details; keys that look sensitive are redacted
 *
 * Returns the fingerprint, which callers may include in a user-facing error as a
 * reference without exposing anything about the failure itself.
 */
export function reportError(error: unknown, scope: string, context: ErrorContext = {}): string {
  try {
    const described = describe(error);
    const print = fingerprint(described, scope);
    const report: Report = {
      severity: "error",
      scope,
      name: described.name,
      message: described.message,
      stack: described.stack,
      fingerprint: print,
      context: redactContext(context),
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV ?? "unknown",
    };

    // One line, so log collectors that split on newlines keep the record intact.
    // If a vendor SDK is added later, this is the one place it hooks in.
    console.error(JSON.stringify({ observability: report }));
    postToWebhook(report);
    return print;
  } catch {
    // Last resort: the reporter itself failed. Say so plainly rather than
    // letting a monitoring bug silence the error it was meant to record.
    try {
      console.error(JSON.stringify({ observability: { severity: "error", scope, message: "reportError failed" } }));
    } catch {
      /* nothing further is safe to attempt */
    }
    return "unknown";
  }
}

/**
 * Record something suspicious that isn't a thrown error: a webhook for an
 * unknown order, a payment whose amount doesn't match. These need the same
 * routing as errors, since they're the ones that cost money when missed.
 */
export function reportWarning(message: string, scope: string, context: ErrorContext = {}): string {
  try {
    const print = fingerprint({ name: "warning", message: redactText(message) }, scope);
    const report: Report = {
      severity: "warning",
      scope,
      name: "warning",
      message: redactText(message),
      fingerprint: print,
      context: redactContext(context),
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV ?? "unknown",
    };
    console.warn(JSON.stringify({ observability: report }));
    postToWebhook(report);
    return print;
  } catch {
    return "unknown";
  }
}
