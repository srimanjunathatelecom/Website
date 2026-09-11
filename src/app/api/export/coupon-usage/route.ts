import { db } from "@/db";
import { orders, coupons } from "@/db/schema";
import { resolveAdmin } from "@/lib/resolveAdmin";

export const dynamic = "force-dynamic";

function csvEscape(v: any) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const admin = await resolveAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const allOrders = await db.select().from(orders);
  const allCoupons = await db.select().from(coupons);
  const couponMap = new Map(allCoupons.map((c) => [c.code, c]));

  const usage = new Map<string, { count: number; totalDiscount: number }>();
  for (const o of allOrders) {
    if (!o.couponCode) continue;
    const cur = usage.get(o.couponCode) || { count: 0, totalDiscount: 0 };
    cur.count += 1;
    cur.totalDiscount += Number(o.discount || 0);
    usage.set(o.couponCode, cur);
  }

  const header = ["Coupon Code", "Type", "Value", "Min Order", "Active", "Times Used", "Total Discount Given"];
  const lines = [header.map(csvEscape).join(",")];

  // Every coupon that has ever been created, even ones with zero redemptions,
  // so admins can see under-performing codes too — not just used ones.
  for (const c of allCoupons) {
    const u = usage.get(c.code) || { count: 0, totalDiscount: 0 };
    lines.push(
      [c.code, c.type, c.value, c.minOrder, c.active ? "Yes" : "No", u.count, u.totalDiscount.toFixed(2)]
        .map(csvEscape)
        .join(",")
    );
  }

  // Codes that were used but no longer exist in the coupons table (deleted after use)
  for (const [code, u] of usage) {
    if (!couponMap.has(code)) {
      lines.push(["(deleted) " + code, "", "", "", "", u.count, u.totalDiscount.toFixed(2)].map(csvEscape).join(","));
    }
  }

  const csv = lines.join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="sms-coupon-usage-${Date.now()}.csv"`,
    },
  });
}