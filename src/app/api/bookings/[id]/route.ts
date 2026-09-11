import { db } from "@/db";
import { bookings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";
import { createNotification, sendCustomerEmail } from "@/lib/notify";

export const dynamic = "force-dynamic";

// Mirrors the exact status set StatusSelect offers in AdminDashboard.tsx
// for bookings.
const VALID_BOOKING_STATUSES = ["Booked", "In Progress", "Ready", "Delivered", "Cancelled"];

export async function PUT(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  const b = await _req.json();
  const [ex] = await db.select().from(bookings).where(eq(bookings.id, id));
  if (!ex) return Response.json({ error: "Not found" }, { status: 404 });
  const newStatus = b.status || ex.status;
  if (newStatus !== ex.status && !VALID_BOOKING_STATUSES.includes(newStatus)) {
    return Response.json({ error: `"${newStatus}" is not a valid booking status.` }, { status: 400 });
  }
  await db.update(bookings).set({ status: newStatus }).where(eq(bookings.id, id));
  if (newStatus !== ex.status) {
    await createNotification(
      "booking",
      `Booking ${ex.bookingNo} updated`,
      `Status changed to "${newStatus}". Customer: ${ex.customerName} (${ex.customerPhone}).`,
      `/admin/bookings`
    );
    await sendCustomerEmail(
      ex.customerEmail,
      `Booking ${ex.bookingNo} — ${newStatus}`,
      `Hi ${ex.customerName},\n\nYour service booking status has been updated.\n\nBooking: ${ex.bookingNo}\nService: ${ex.serviceName}\nStatus: ${newStatus}\n\n— SMS Stores`
    );
  }
  return Response.json({ ok: true });
}
