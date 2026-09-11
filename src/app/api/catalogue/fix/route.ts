/**
 * POST /api/catalogue/fix — "Fix My Catalogue" / "Complete Catalogue".
 *
 * Body: { scope?: "all" | "incomplete" | { kind:"products", ids:[..] } |
 *         { kind:"category", ids:[..] } | { kind:"brand", brands:[..] },
 *         mode?: "fix" | "scan" }
 *
 * Starts ONE background job (never two at once — the second click gets the
 * running job back instead of a duplicate) and returns its id for polling.
 */

import { getCurrentAdmin } from "@/lib/auth";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rateLimit";
import { getActiveJob, startCatalogueJob } from "@/lib/catalogue/jobs";
import type { JobScope } from "@/lib/catalogue/health";
import { reportError } from "@/lib/observability";

export const dynamic = "force-dynamic";

function parseScope(raw: unknown): JobScope {
  if (raw === "incomplete") return { kind: "incomplete" };
  if (!raw || raw === "all") return { kind: "all" };
  const s = raw as { kind?: string; ids?: unknown[]; brands?: unknown[] };
  if (s.kind === "products" && Array.isArray(s.ids)) {
    return { kind: "products", ids: s.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 5000) };
  }
  if (s.kind === "category" && Array.isArray(s.ids)) {
    return { kind: "category", ids: s.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 200) };
  }
  if (s.kind === "brand" && Array.isArray(s.brands)) {
    return { kind: "brand", brands: s.brands.map(String).filter(Boolean).slice(0, 200) };
  }
  if (s.kind === "incomplete") return { kind: "incomplete" };
  return { kind: "all" };
}

export async function POST(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`catalogue-fix:${clientIp(req)}`, 20, 60_000);
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);

  try {
    const body = await req.json().catch(() => ({}));
    const scope = parseScope(body.scope);
    const mode = body.mode === "scan" ? "scan" : "fix";

    const active = await getActiveJob();
    if (active) {
      return Response.json({ jobId: active.id, alreadyRunning: true });
    }

    const { jobId } = await startCatalogueJob({
      type: mode,
      scope,
      admin: { id: admin.id, name: admin.name },
    });
    return Response.json({ jobId, alreadyRunning: false });
  } catch (e) {
    reportError(e, "catalogue/fix");
    return Response.json({ error: "Could not start the catalogue job." }, { status: 500 });
  }
}
