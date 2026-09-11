"use client";

import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function ServiceBooking({
  services,
  outlets,
  syncServiceId = null,
}: {
  services: { id: number; name: string }[];
  outlets: { id: number; name: string }[];
  /**
   * Optional external selection (the service catalog's "Book" buttons on
   * /services). When it changes to a valid id the form adopts it, while
   * still letting the customer change the dropdown afterwards.
   */
  syncServiceId?: number | null;
}) {
  const router = useRouter();
  const [serviceId, setServiceId] = useState(services[0]?.id ?? 0);
  useEffect(() => {
    if (syncServiceId != null && services.some((s) => s.id === syncServiceId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setServiceId(syncServiceId);
    }
  }, [syncServiceId, services]);
  const [device, setDevice] = useState("");
  const [issue, setIssue] = useState("");
  const [outletId, setOutletId] = useState(outlets[0]?.id ?? 0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ no: string } | null>(null);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId, device, issue, outletId }),
      });
      const d = await r.json();
      if (r.status === 401) {
        router.push("/login?redirect=/services");
        return;
      }
      if (r.ok) {
        setDone({ no: d.bookingNo });
      } else {
        setErr(d.error || "Could not submit booking.");
      }
    } catch {
      setErr("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-900 dark:bg-emerald-950">
        <p className="flex items-center justify-center gap-2 text-lg font-bold text-emerald-700 dark:text-emerald-300"><CheckCircle2 aria-hidden className="h-5 w-5" /> Booking submitted!</p>
        <p className="mt-1 text-sm">Booking No: <b>{done.no}</b></p>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          Our team will call you after you submit your request to confirm details and pricing.
        </p>
        <button onClick={() => setDone(null)} className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium dark:border-slate-700">
          Book another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div>
        <label htmlFor="sb-service" className="text-sm font-semibold">Service needed</label>
        <select id="sb-service" value={serviceId} onChange={(e) => setServiceId(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800">
          {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="sb-device" className="text-sm font-semibold">Device (model / brand)</label>
        <input id="sb-device" value={device} onChange={(e) => setDevice(e.target.value)} placeholder="e.g. iPhone 12, HP Pavilion" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800" />
      </div>
      <div>
        <label htmlFor="sb-issue" className="text-sm font-semibold">Describe the issue</label>
        <textarea id="sb-issue" value={issue} onChange={(e) => setIssue(e.target.value)} required rows={3} placeholder="What's wrong with the device?" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800" />
      </div>
      <div>
        <label htmlFor="sb-outlet" className="text-sm font-semibold">Preferred outlet</label>
        <select id="sb-outlet" value={outletId} onChange={(e) => setOutletId(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800">
          {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>
      {err && <p className="text-sm text-rose-600">{err}</p>}
      <button disabled={busy} className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
        {busy ? "Submitting…" : "Book Service (No payment now)"}
      </button>
    </form>
  );
}
