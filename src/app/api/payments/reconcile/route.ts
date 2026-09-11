import { createHash, timingSafeEqual } from "crypto";
import { getCurrentAdmin } from "@/lib/auth";
import { paymentsConfigured } from "@/lib/payments/config";
import { fetchGatewayOrderPayments, fetchPayment, PaymentGatewayError } from "@/lib/payments/razorpay";
import { applyGatewayPayment, findStalePayments, markFailed, notifyOrderPaid } from "@/lib/payments/service";

export const dynamic = "force-dynamic";

/**
 * Reconcile payments that never reached a terminal state.
 *
 * The safety net under the other two paths. A payment can get stuck when the
 * browser handshake never fires *and* the webhook was dropped, misconfigured,
 * or delivered while the app was mid-deploy. The result is the worst failure
 * mode a shop has: the gateway holds the customer's money and the shop
 * believes the order was abandoned.
 *
 * This asks the gateway what actually happened to every attempt still in
 * flight past a grace period, and applies the answer. Safe to run repeatedly —
 * every transition it can trigger is idempotent — so it is suitable for a
 * cron/scheduled job as well as an admin button.
 *
 * Two ways in, because it needs to work both unattended and on demand:
 *
 *   - An admin session, for the button in the dashboard.
 *   - A shared secret in the Authorization header, for a scheduled job. Without
 *     this the safety net only runs when someone remembers to press a button,
 *     which is exactly when nobody will: the failure it catches is silent.
 *
 * It is otherwise closed, because it reveals payment state across all customers
 * and makes outbound calls that count against the merchant's gateway rate limit.
 */
export async function POST(req: Request) {
  if (!(await isAuthorized(req))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!paymentsConfigured()) return Response.json({ error: "Online payment is not configured." }, { status: 503 });

  const url = new URL(req.url);
  const olderThanMinutes = clampInt(url.searchParams.get("olderThanMinutes"), 15, 1, 60 * 24 * 30);
  const limit = clampInt(url.searchParams.get("limit"), 50, 1, 200);
  // Attempts older than this are treated as definitively abandoned: the
  // gateway's own checkout sessions have long expired, so nothing further can
  // arrive, and holding their stock any longer just hides sellable inventory.
  const abandonAfterMinutes = clampInt(url.searchParams.get("abandonAfterMinutes"), 60 * 24, 60, 60 * 24 * 30);

  const stale = await findStalePayments({ olderThanMinutes, limit });

  const summary = { checked: 0, captured: 0, failed: 0, abandoned: 0, stillPending: 0, errors: 0 };
  const details: { paymentId: number; orderId: number; outcome: string }[] = [];

  for (const row of stale) {
    summary.checked += 1;
    try {
      // Prefer asking about the gateway order: it lists every attempt made
      // against that cart, including ones we never saw a payment id for
      // because the browser died before the handshake. Querying only by our
      // stored payment id would miss exactly the cases this endpoint exists
      // for.
      let outcome = "pending";

      if (row.gatewayOrderId) {
        const attempts = await fetchGatewayOrderPayments(row.gatewayOrderId);
        // If any attempt on this cart was captured, the cart is paid — even if
        // three earlier attempts failed.
        const winner =
          attempts.find((p) => p.status === "captured") ||
          attempts.find((p) => p.status === "refunded") ||
          attempts.find((p) => p.status === "failed");

        if (winner) {
          const applied = await applyGatewayPayment(row.id, winner, `reconcile:${winner.id}`);
          if (applied.status === "captured") {
            if (applied.transitioned) await notifyOrderPaid(applied.orderId);
            summary.captured += 1;
            outcome = "captured";
          } else if (applied.status === "failed") {
            summary.failed += 1;
            outcome = "failed";
          } else {
            outcome = applied.status;
          }
        }
      } else if (row.gatewayPaymentId) {
        const gw = await fetchPayment(row.gatewayPaymentId);
        const applied = await applyGatewayPayment(row.id, gw, `reconcile:${gw.id}`);
        if (applied.status === "captured" && applied.transitioned) await notifyOrderPaid(applied.orderId);
        outcome = applied.status;
        if (applied.status === "captured") summary.captured += 1;
        else if (applied.status === "failed") summary.failed += 1;
      }

      if (outcome === "pending" || outcome === "created" || outcome === "authorized") {
        // Nothing was ever paid against this cart and the window has closed.
        // Release the reservation so the stock goes back on sale.
        const ageMinutes = (Date.now() - new Date(row.createdAt).getTime()) / 60_000;
        if (ageMinutes >= abandonAfterMinutes) {
          await markFailed({
            paymentRowId: row.id,
            cancelled: true,
            errorCode: "abandoned",
            errorDescription: `No payment completed within ${Math.round(ageMinutes / 60)}h; reservation released.`,
            eventId: `reconcile:abandon:${row.id}`,
          });
          summary.abandoned += 1;
          outcome = "abandoned";
        } else {
          summary.stillPending += 1;
        }
      }

      details.push({ paymentId: row.id, orderId: row.orderId, outcome });
    } catch (e) {
      // One unreachable payment must not abort the sweep — the next run will
      // pick it up again, and the remaining rows still get reconciled now.
      summary.errors += 1;
      const note = e instanceof PaymentGatewayError ? e.message : "lookup failed";
      if (!(e instanceof PaymentGatewayError)) console.error("reconcile failed for payment", row.id, e);
      details.push({ paymentId: row.id, orderId: row.orderId, outcome: `error: ${note}` });
    }
  }

  return Response.json({ ok: true, summary, details });
}

/**
 * Allow either an admin session or a scheduler holding CRON_SECRET.
 *
 * The secret is compared with a timing-safe equality check over fixed-length
 * digests. A plain `===` on a secret leaks its length and, in principle, its
 * contents to an attacker who can measure response times.
 */
async function isAuthorized(req: Request): Promise<boolean> {
  const admin = await getCurrentAdmin();
  if (admin) return true;

  const secret = process.env.CRON_SECRET || "";
  // An unset secret must never mean "allow anyone".
  if (!secret) return false;

  const presented = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!presented) return false;

  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

/**
 * Read an integer query param with a default and hard bounds.
 *
 * Bounds rather than a bare Number(): an unbounded `limit` turns an admin
 * button into a way to fire thousands of outbound gateway calls and trip the
 * merchant's rate limit, which would break live checkout for real customers.
 */
function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}
