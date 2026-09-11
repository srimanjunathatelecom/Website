import { db } from "@/db";
import { orders, orderItems } from "@/db/schema";
import { desc } from "drizzle-orm";
import { resolveAdmin } from "@/lib/resolveAdmin";

export const dynamic = "force-dynamic";

function csvEscape(v: any) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const admin = await resolveAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(1000);
  const items = await db.select().from(orderItems);
  const byOrder = new Map<number, any[]>();
  for (const it of items) {
    const arr = byOrder.get(it.orderId) || [];
    arr.push(it);
    byOrder.set(it.orderId, arr);
  }

  const header = ["Order No", "Date", "Customer", "Phone", "Email", "Address", "City", "Pincode", "Outlet", "Payment", "Status", "MRP", "Coupon Code", "Discount", "Paid", "Items"];
  const lines = [header.map(csvEscape).join(",")];
  for (const o of rows) {
    const its = byOrder.get(o.id) || [];
    const detail = its.map((i) => `${i.name} x${i.qty}`).join("; ");
    lines.push(
      [
        o.orderNo,
        new Date(o.createdAt).toISOString(),
        o.customerName,
        o.customerPhone,
        o.customerEmail,
        o.addressLine,
        o.city,
        o.pincode,
        o.outletId ?? "",
        o.paymentMethod,
        o.status,
        o.totalMrp,
        o.couponCode || "",
        o.discount,
        o.totalMop,
        detail,
      ]
        .map(csvEscape)
        .join(",")
    );
  }

  const csv = lines.join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="sms-orders-${Date.now()}.csv"`,
    },
  });
}