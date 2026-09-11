import { db } from "@/db";
import { claims, customers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";
import { createNotification, sendCustomerEmail } from "@/lib/notify";

export const dynamic = "force-dynamic";

// Mirrors the exact status set StatusSelect offers in AdminDashboard.tsx
// for claims — keeping this whitelist in sync with that UI. Without it,
// any string in the request body became the claim's status, which could
// silently break TrackClient.tsx's booking/claim status rendering.
const VALID_CLAIM_STATUSES = ["Pending", "Approved", "Rejected", "Resolved"];

export async function PUT(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  const b = await _req.json();
  const [ex] = await db.select().from(claims).where(eq(claims.id, id));
  if (!ex) return Response.json({ error: "Not found" }, { status: 404 });
  const newStatus = b.status || ex.status;
  if (newStatus !== ex.status && !VALID_CLAIM_STATUSES.includes(newStatus)) {
    return Response.json({ error: `"${newStatus}" is not a valid claim status.` }, { status: 400 });
  }
  await db.update(claims).set({ status: newStatus }).where(eq(claims.id, id));
  if (newStatus !== ex.status) {
    await createNotification(
      "claim",
      `Claim ${ex.claimNo} updated`,
      `Status changed to "${newStatus}". Product: ${ex.productName}. Customer: ${ex.customerName}.`,
      `/admin/claims`
    );
    // claims doesn't store an email column directly (unlike orders/
    // bookings) — looked up via customerId instead of adding a new column,
    // per instruction not to change the schema unless genuinely required.
    const [cust] = await db.select().from(customers).where(eq(customers.id, ex.customerId));
    if (cust?.email) {
      await sendCustomerEmail(
        cust.email,
        `Claim ${ex.claimNo} — ${newStatus}`,
        `Hi ${ex.customerName},\n\nYour warranty/defect claim status has been updated.\n\nClaim: ${ex.claimNo}\nProduct: ${ex.productName}\nStatus: ${newStatus}\n\n— SMS Stores`
      );
    }
  }
  return Response.json({ ok: true });
}
