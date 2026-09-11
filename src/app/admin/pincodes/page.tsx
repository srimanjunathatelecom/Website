import { db } from "@/db";
import { deliveryPincodes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import Link from "next/link";

import type { Metadata } from "next";

// Named so the tab is identifiable; the "· SMS Stores Admin" suffix comes
// from the title template in src/app/admin/layout.tsx.
export const metadata: Metadata = { title: "Delivery Zones" };

export const dynamic = "force-dynamic";

export default async function PincodeManagerPage() {
  const allPins = await db.select().from(deliveryPincodes).orderBy(deliveryPincodes.pincode);

  // Upsert rather than insert: re-submitting an existing pincode now edits its
  // delivery terms instead of failing on the unique constraint. These values are
  // the only source the product page uses for delivery messaging, so they must
  // be fully editable here.
  async function savePin(formData: FormData) {
    "use server";
    const pincode = String(formData.get("pincode") || "").trim();
    if (!/^[0-9]{6}$/.test(pincode)) return;

    const days = parseInt(String(formData.get("estimatedDays") ?? ""), 10);
    const charge = Number(formData.get("deliveryCharge") ?? 0);
    const freeAbove = Number(formData.get("freeDeliveryAbove") ?? 0);

    const values = {
      pincode,
      city: String(formData.get("city") || "").trim() || "Bengaluru",
      state: String(formData.get("state") || "").trim() || "Karnataka",
      estimatedDays: Number.isFinite(days) && days >= 0 ? days : 1,
      codAvailable: formData.get("codAvailable") === "on",
      isDeliverable: formData.get("isDeliverable") === "on",
      deliveryCharge: (Number.isFinite(charge) && charge >= 0 ? charge : 0).toFixed(2),
      freeDeliveryAbove: (Number.isFinite(freeAbove) && freeAbove >= 0 ? freeAbove : 0).toFixed(2),
    };

    await db
      .insert(deliveryPincodes)
      .values(values)
      .onConflictDoUpdate({ target: deliveryPincodes.pincode, set: values });

    revalidatePath("/admin/pincodes");
  }

  async function removePin(formData: FormData) {
    "use server";
    const id = parseInt(formData.get("id") as string);
    await db.delete(deliveryPincodes).where(eq(deliveryPincodes.id, id));
    revalidatePath("/admin/pincodes");
  }

  return (
    <div className="admin-scope min-h-screen flex flex-col">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-[var(--adm-line)] bg-[var(--adm-paper)]/85 px-4 py-3 backdrop-blur sm:px-8">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-[var(--adm-ink)] font-mono-adm text-xs font-bold text-[var(--adm-paper)]">SMS</div>
          <div>
            <p className="adm-eyebrow">Console / 09.5</p>
            <p className="font-display-adm truncate text-[17px] leading-tight">Delivery Zones</p>
          </div>
        </div>
        <Link href="/admin" className="adm-btn !py-1.5 !text-[12px]">Back to Dashboard</Link>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <div className="mb-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="adm-eyebrow">09.5 / Storefront</p>
              <h1 className="mt-2 font-display-adm text-[28px] leading-tight sm:text-[36px]">Manage Pincodes.</h1>
            </div>
          </div>
          <hr className="adm-rule mt-4" />
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          <div className="adm-card p-6 h-fit">
            <h2 className="mb-4 font-display-adm text-lg">Add New Pincode</h2>
            <form action={savePin} className="space-y-4">
              <label className="block">
                <span className="adm-eyebrow">Pincode (6 digits)</span>
                <input name="pincode" required pattern="[0-9]{6}" maxLength={6} className="adm-input mt-1.5 font-mono-adm" placeholder="560001" />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="adm-eyebrow">City</span>
                  <input name="city" defaultValue="Bengaluru" className="adm-input mt-1.5" />
                </label>
                <label className="block">
                  <span className="adm-eyebrow">State</span>
                  <input name="state" defaultValue="Karnataka" className="adm-input mt-1.5" />
                </label>
              </div>

              <label className="block">
                <span className="adm-eyebrow">Delivery Time (Days)</span>
                <input name="estimatedDays" type="number" required min={0} defaultValue={1} className="adm-input mt-1.5 font-mono-adm" placeholder="0 = Same Day" />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="adm-eyebrow">Delivery charge (₹)</span>
                  <input name="deliveryCharge" type="number" min={0} step="1" defaultValue={0} className="adm-input mt-1.5 font-mono-adm" />
                </label>
                <label className="block">
                  <span className="adm-eyebrow">Free above order (₹)</span>
                  <input name="freeDeliveryAbove" type="number" min={0} step="1" defaultValue={0} className="adm-input mt-1.5 font-mono-adm" />
                </label>
              </div>
              <p className="font-mono-adm text-[10px] text-[var(--adm-muted)] -mt-1">
                Charge 0 shows &quot;Free delivery&quot; on the product page. Free-above 0 means no threshold.
              </p>

              <label className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-[12px] font-semibold border-[var(--adm-line-strong)] bg-[#fffdf7] text-[var(--adm-muted)] mt-2`}>
                <input type="checkbox" name="codAvailable" defaultChecked className="hidden" />
                <span className="grid h-3 w-3 place-items-center rounded-sm border border-current bg-current"></span>
                Allow Cash on Delivery
              </label>

              <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-md border border-[var(--adm-line-strong)] bg-[#fffdf7] px-3 py-1.5 text-[12px] font-semibold text-[var(--adm-muted)]">
                <input type="checkbox" name="isDeliverable" defaultChecked className="hidden" />
                <span className="grid h-3 w-3 place-items-center rounded-sm border border-current bg-current"></span>
                We deliver to this pincode
              </label>

              <button type="submit" className="adm-btn adm-btn--primary w-full justify-center mt-2">Save Pincode</button>
              <p className="font-mono-adm text-[10px] text-[var(--adm-muted)]">Saving an existing pincode updates it.</p>
            </form>
          </div>

          <div className="md:col-span-2 overflow-hidden rounded-[14px] border border-[var(--adm-line)] bg-[#fffdf7]">
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-[var(--adm-line)] bg-[var(--adm-paper-2)]/60 text-[10px] uppercase tracking-[0.18em] text-[var(--adm-muted)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Pincode</th>
                  <th className="py-3 font-semibold">City</th>
                  <th className="py-3 font-semibold">Delivery Time</th>
                  <th className="py-3 font-semibold">Charge</th>
                  <th className="py-3 text-center font-semibold">COD</th>
                  <th className="py-3 text-center font-semibold">Serviceable</th>
                  <th className="px-4 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {allPins.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center font-mono-adm text-[12px] text-[var(--adm-muted)]">No custom pincodes added yet.</td></tr>
                )}
                {allPins.map(pin => (
                  <tr key={pin.id} className="adm-row border-b border-[var(--adm-line)] last:border-0">
                    <td className="px-4 py-3 font-mono-adm font-bold text-[14px]">{pin.pincode}</td>
                    <td className="py-3">{pin.city}{pin.state ? `, ${pin.state}` : ""}</td>
                    <td className="py-3">
                      {pin.estimatedDays === 0 ? (
                        <span className="adm-pill adm-pill--good">Same Day</span>
                      ) : (
                        <span className="font-semibold">{pin.estimatedDays} Day{pin.estimatedDays > 1 ? 's' : ''}</span>
                      )}
                    </td>
                    <td className="py-3 font-mono-adm">
                      {Number(pin.deliveryCharge) > 0 ? `₹${Number(pin.deliveryCharge).toLocaleString("en-IN")}` : "Free"}
                      {Number(pin.freeDeliveryAbove) > 0 && (
                        <span className="block text-[10px] text-[var(--adm-muted)]">
                          free above ₹{Number(pin.freeDeliveryAbove).toLocaleString("en-IN")}
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-center">{pin.codAvailable ? <span className="text-[var(--adm-pine)] font-bold">Yes</span> : <span className="text-[var(--adm-rose)] font-bold">No</span>}</td>
                    <td className="py-3 text-center">
                      {pin.isDeliverable
                        ? <span className="font-bold text-[var(--adm-pine)]">Yes</span>
                        : <span className="font-bold text-[var(--adm-rose)]">No</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <form action={removePin}>
                        <input type="hidden" name="id" value={pin.id} />
                        <button type="submit" className="adm-btn !py-1 !text-[11px] !text-[var(--adm-rose)]">Delete</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}