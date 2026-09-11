"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  deviceLabel,
  type RepairBrand,
  type RepairModel,
  type RepairService,
} from "@/lib/repair/types";

/**
 * Confirm step for a repair chosen through the visual flow.
 *
 * This posts to the existing POST /api/bookings with exactly the body it
 * already accepts — `{ serviceId, device, issue, outletId }` — and no part of
 * that endpoint, the bookings table, the owner notification or the rate limit
 * was changed to support this screen. `bookings.device` is free text, so the
 * device the customer picked visually arrives as "Samsung Galaxy S23" and
 * appears in Admin exactly as a typed one always has.
 *
 * It is a separate component from ServiceBooking rather than a reuse of it. That
 * form is still what /services needs: a service dropdown, a device the customer
 * types, and an outlet. Here the service and device are already known — they are
 * the two things the customer just spent three screens choosing — so re-showing
 * them as editable inputs would invite the flow to disagree with itself, and a
 * service dropdown is the exact control this redesign exists to replace. What is
 * genuinely still unknown is the fault description and the preferred outlet, so
 * those are the only two fields here.
 *
 * ServiceBooking is deliberately left untouched. Bending one component to serve
 * both screens would have meant editing the form that currently takes real
 * bookings, to no benefit.
 */
export default function RepairBookingPanel({
  brand,
  model,
  service,
  outlets,
  onCancel,
}: {
  brand: RepairBrand;
  model: RepairModel;
  service: RepairService;
  outlets: { id: number; name: string }[];
  onCancel: () => void;
}) {
  const router = useRouter();

  // The one string the whole visual flow exists to produce.
  const device = deviceLabel(brand.name, model.name);

  const [issue, setIssue] = useState("");
  const [outletId, setOutletId] = useState(outlets[0]?.id ?? 0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ no: string } | null>(null);
  const [err, setErr] = useState("");

  // POST /api/bookings requires an account. Asked here rather than discovered on
  // submit: a customer who has chosen a brand, a model and a repair and then
  // typed out what is wrong with their phone should not learn that an account is
  // needed only after pressing Confirm, which is what happened before. null
  // means not yet known, and the button says "Confirm booking" until we know
  // otherwise so a signed-in customer never sees a sign-in prompt flicker.
  const [guest, setGuest] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (live) setGuest(!d?.customer);
      })
      // A failed check leaves it unknown, and submit still handles 401. Better
      // than telling a signed-in customer to sign in because a request blipped.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  // Keeps the chosen repair through /login so they return to this panel rather
  // than to an empty list of repairs.
  const resumeUrl = `/repair/${brand.slug}/${model.slug}?service=${service.id}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId: service.id, device, issue, outletId }),
      });
      const d = await r.json().catch(() => ({}));

      if (r.status === 401) {
        // Same guard as the existing form, but returning here rather than to
        // /services — a customer sent back to the top of a different flow after
        // logging in has to choose their phone all over again.
        router.push(`/login?redirect=${encodeURIComponent(resumeUrl)}`);
        return;
      }
      if (r.ok) {
        setDone({ no: d.bookingNo });
      } else {
        // Surfaces the endpoint's own message, which includes the rate-limit
        // response when someone has booked ten repairs in an hour.
        setErr(d.error || "Could not submit booking. Please try again.");
      }
    } catch {
      setErr("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-[10px] border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-900 dark:bg-emerald-950">
        <p className="flex items-center justify-center gap-2 text-[17px] font-bold text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 aria-hidden className="h-5 w-5" /> Booking confirmed
        </p>
        <p className="mt-1 text-[14px] text-slate-700 dark:text-slate-200">
          Booking No: <b>{done.no}</b>
        </p>
        <p className="mt-1 text-[13px] text-slate-600 dark:text-slate-300">
          {service.name} — {device}
        </p>
        <p className="mx-auto mt-3 max-w-md text-[13px] text-slate-600 dark:text-slate-300">
          Our team will call you to confirm the details and the final price. No
          payment is needed to hold this booking.
        </p>
        {/* The booking number was a dead end before this: /track already accepts
            SVC numbers, but nothing here said so, so the one useful thing on this
            screen looked like a reference code to write down and forget. */}
        <Link
          href={`/track?no=${encodeURIComponent(done.no)}`}
          className="mt-4 inline-block rounded-lg bg-emerald-700 px-5 py-2.5 text-[14px] font-bold text-white transition-colors duration-150 hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
        >
          Track this repair
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      aria-label={`Confirm ${service.name} for ${device}`}
      className="rounded-[10px] border border-blue-200 bg-blue-50/50 p-4 sm:p-5 dark:border-blue-900 dark:bg-blue-950/30"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[15px] font-bold text-slate-900 dark:text-white">
          {service.name}
        </p>
        <p className="text-[13px] font-semibold text-slate-600 dark:text-slate-300">
          {device}
        </p>
      </div>

      {/* Whatever the owner set in Admin, shown as text and never as a number
          this component invented. */}
      {service.startPrice && (
        <p className="mt-1 text-[13px] font-semibold text-blue-700 dark:text-blue-300">
          {service.startPrice}
          {service.turnaround ? ` · ${service.turnaround}` : ""}
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor="repair-issue"
            className="text-[13px] font-semibold text-slate-700 dark:text-slate-200"
          >
            What is wrong with it?{" "}
            <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            id="repair-issue"
            value={issue}
            onChange={(e) => setIssue(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="e.g. screen cracked after a drop, touch still works"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] outline-none transition-colors duration-150 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 dark:border-slate-700 dark:bg-slate-900"
          />
        </div>

        <div>
          <label
            htmlFor="repair-outlet"
            className="text-[13px] font-semibold text-slate-700 dark:text-slate-200"
          >
            Preferred outlet
          </label>
          <select
            id="repair-outlet"
            value={outletId}
            onChange={(e) => setOutletId(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] outline-none transition-colors duration-150 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 dark:border-slate-700 dark:bg-slate-900"
          >
            {outlets.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-[14px] font-bold text-white transition-colors duration-150 hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {busy && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
              {busy
                ? "Booking…"
                : guest
                  ? "Sign in & confirm booking"
                  : "Confirm booking"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-[14px] font-semibold text-slate-700 transition-colors duration-150 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              Choose a different repair
            </button>
          </div>
        </div>
      </div>

      {err && (
        <p role="alert" className="mt-3 text-[13px] font-semibold text-red-600 dark:text-red-400">
          {err}
        </p>
      )}
      {guest && (
        <p className="mt-3 text-[12.5px] text-slate-600 dark:text-slate-300">
          You&rsquo;ll sign in on the next step so we can send you updates on
          this repair. This repair stays selected.
        </p>
      )}
      <p className="mt-3 text-[12px] text-slate-500 dark:text-slate-400">
        No payment now. We confirm the final price after inspecting the device.
      </p>
    </form>
  );
}
