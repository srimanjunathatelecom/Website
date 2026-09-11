import AppShell from "@/components/AppShell";
import BackButton from "@/components/BackButton";
import PrintInvoiceButton from "@/components/PrintInvoiceButton";
import WhatsAppOrderShare from "@/components/WhatsAppOrderShare";
import CompletePaymentButton from "@/components/CompletePaymentButton";
import { getOrder, getSettings, getOutlets } from "@/lib/queries";
import { getCurrentAdmin, getCurrentCustomer } from "@/lib/auth";
import Link from "next/link";
import type { Metadata } from "next";

// An invoice is a personal financial document tied to one customer. Access is
// already checked below, so nothing leaks even if a crawler asks — but an
// indexed URL is still an invitation, and an order number showing up in a
// search result is a bad look regardless of what the page then returns.
export const metadata: Metadata = {
  title: "Invoice",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, settings, outlets, admin, customer] = await Promise.all([
    getOrder(Number(id)),
    getSettings(),
    getOutlets(),
    getCurrentAdmin(),
    getCurrentCustomer(),
  ]);

  if (!data) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-4 py-20 text-center">
          <BackButton />
          <p className="mt-4 text-lg font-semibold">Invoice not found</p>
        </div>
      </AppShell>
    );
  }

  if (!admin && !customer) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-4 py-20 text-center">
          <BackButton />
          <p className="mt-4 text-lg font-semibold">Please log in to view this invoice</p>
          <Link href="/login" className="mt-3 inline-block rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white">Login</Link>
        </div>
      </AppShell>
    );
  }
  if (!admin && customer && data.order.customerId !== customer.id) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-4 py-20 text-center">
          <BackButton />
          <p className="mt-4 text-lg font-semibold">You don&apos;t have access to this invoice</p>
        </div>
      </AppShell>
    );
  }

  const o = data.order;
  const outlet = outlets.find((x) => x.id === o.outletId) || outlets[0];
  const totalMrp = Number(o.totalMrp);
  const totalMop = Number(o.totalMop);
  const discount = Number(o.discount);
  const savings = totalMrp - totalMop;

  // An order whose online payment never completed is not a tax invoice. Issuing
  // one for money that was never received would be wrong on the shop's books and
  // misleading to the customer, who may reasonably read a "Tax Invoice" as proof
  // of purchase. It is shown as a pending order summary until the money lands.
  const awaitingPayment = o.status === "Awaiting Payment";
  const paidOnline = o.paymentStatus === "paid";

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 print:mx-0 print:max-w-none print:p-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 print:hidden">
          <BackButton />
          <div className="flex flex-wrap items-center gap-2">
            <WhatsAppOrderShare
              phone={settings?.whatsappNumber || ""}
              orderNo={o.orderNo}
              total={totalMop}
              awaitingPayment={awaitingPayment}
            />
            <PrintInvoiceButton />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm dark:border-slate-800 dark:bg-slate-900 print:rounded-none print:border-0 print:p-0 print:text-black print:dark:bg-white" id="invoice">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800 print:border-slate-400">
            <div>
              {/* font-display (Manrope), not font-serif: the bare Tailwind
                  serif stack renders as Times New Roman, which made the one
                  document customers keep and print look like a different,
                  older shop than the site it came from. The invoice header
                  now carries the same brand face as the storefront. */}
              <p className="font-display text-xl font-bold tracking-tight text-slate-900 dark:text-white print:text-black">{settings?.brandName}</p>
              <p className="text-xs text-slate-500">{settings?.legalName}</p>
              {outlet && <p className="mt-1 max-w-xs text-xs text-slate-500">{outlet.name}<br />{outlet.addressLine}<br />Phone: {outlet.contact}</p>}
            </div>
            <div className="text-right text-xs text-slate-600 dark:text-slate-300 print:text-black">
              <p>GSTIN: {settings?.gstin}</p>
              <p>PAN: {settings?.pan}</p>
              <p>State: {settings?.state} ({settings?.stateCode})</p>
              <p>Place of Supply: {settings?.placeOfSupply}</p>
            </div>
          </div>

          <p className="mt-4 text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 print:text-slate-600">
            {awaitingPayment ? "Order Summary \u00b7 Payment Pending" : "Tax Invoice"}
          </p>

          {awaitingPayment && (
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40 print:border-slate-400 print:bg-transparent">
              <p className="text-sm font-bold text-amber-900 dark:text-amber-100">This order hasn&apos;t been paid for yet</p>
              <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
                We&apos;ve held your items, but the online payment didn&apos;t finish. Your order will be confirmed and
                packed as soon as the payment goes through. If money has already left your account, this page will
                update on its own within a few minutes \u2014 you don&apos;t need to pay again.
              </p>
              <div className="mt-3">
                <CompletePaymentButton
                  orderId={o.id}
                  orderNo={o.orderNo}
                  amount={totalMop}
                  customerName={o.customerName}
                  customerEmail={o.customerEmail}
                  customerPhone={o.customerPhone}
                />
              </div>
            </div>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="font-bold text-slate-800">Bill To</p>
              <p className="font-medium">{o.customerName}</p>
              <p className="text-slate-500">{o.customerPhone}</p>
              <p className="text-slate-500">{o.customerEmail}</p>
              <p className="mt-1 max-w-xs">{o.addressLine}, {o.city} {o.pincode}</p>
            </div>
            <div className="sm:text-right">
              {/* tabular-nums on the order number: fixed-width digits make
                  SMS210826… read as a reference code, and two invoices held
                  side by side align digit-for-digit. */}
              <p><span className="text-slate-500">Invoice No: </span><span className="tabular-nums tracking-tight">{o.orderNo}</span></p>
              <p><span className="text-slate-500">Date: </span>{new Date(o.createdAt).toLocaleString("en-IN")}</p>
              <p><span className="text-slate-500">Payment: </span>{o.paymentMethod}</p>
              <p>
                <span className="text-slate-500">Payment status: </span>
                {awaitingPayment ? "Not received" : paidOnline ? "Received" : o.paymentMethod === "Cash on Delivery" ? "Due on delivery" : "\u2014"}
              </p>
              {o.paidAt && (
                <p><span className="text-slate-500">Paid on: </span>{new Date(o.paidAt).toLocaleString("en-IN")}</p>
              )}
              <p><span className="text-slate-500">Status: </span>{o.status}</p>
              {o.couponCode && <p><span className="text-slate-500">Coupon: </span>{o.couponCode}</p>}
            </div>
          </div>

          {/* tabular-nums across the line-item table and totals: every ₹
              amount gets fixed-width digits so the right-aligned columns
              actually line up — proportional ₹1,111 is narrower than ₹8,888
              and the totals column used to visibly wobble. */}
          <table className="mt-5 w-full border-collapse text-left tabular-nums">
            <thead>
              <tr className="border-b border-slate-300 text-xs uppercase text-slate-500 dark:border-slate-700">
                <th className="py-2">#</th><th>Item</th><th>Brand</th><th className="text-right">Qty</th><th className="text-right">MRP</th><th className="text-right">Rate</th><th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((it, i) => (
                <tr key={it.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-2">{i + 1}</td>
                  <td className="clamp-2 max-w-[180px]">{it.name}</td>
                  <td>{it.brand}</td>
                  <td className="text-right">{it.qty}</td>
                  <td className="text-right">₹{Number(it.mrp).toLocaleString("en-IN")}</td>
                  <td className="text-right">₹{Number(it.mop).toLocaleString("en-IN")}</td>
                  <td className="text-right">₹{(Number(it.mop) * it.qty).toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex justify-end">
            <div className="w-full max-w-xs space-y-1 tabular-nums">
              <div className="flex justify-between"><span className="text-slate-500">MRP Total</span><span>₹{totalMrp.toLocaleString("en-IN")}</span></div>
              {discount > 0 && <div className="flex justify-between text-emerald-600"><span>Coupon Discount</span><span>−₹{discount.toLocaleString("en-IN")}</span></div>}
              <div className="flex justify-between font-bold"><span>Amount Paid</span><span>₹{totalMop.toLocaleString("en-IN")}</span></div>
              <div className="flex justify-between text-emerald-600"><span>You Saved</span><span>₹{savings.toLocaleString("en-IN")}</span></div>
              <p className="pt-2 text-[11px] text-slate-500">All prices inclusive of GST. This is a computer-generated invoice.</p>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-slate-500">Thank you for shopping at {settings?.brandName} — We sell at MOP, not MRP.</p>
        </div>
      </div>
    </AppShell>
  );
}