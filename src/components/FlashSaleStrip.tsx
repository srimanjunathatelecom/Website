"use client";

import { Zap } from "lucide-react";
import Link from "next/link";
import Countdown from "./Countdown";

// Resets daily at midnight so the countdown always shows a live, believable window
function nextMidnight(): number {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export default function FlashSaleStrip({ dealCount }: { dealCount: number }) {
  if (dealCount <= 0) return null;
  return (
    <section className="shell pt-5 sm:pt-6">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-rose-600 via-red-600 to-orange-500 p-5 text-white shadow-xl shadow-red-900/20 sm:p-7">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.12)_1px,transparent_0)] [background-size:22px_22px] pointer-events-none" />
        <div className="relative flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/15"><Zap aria-hidden className="h-5 w-5" /></span>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.25em] text-white/80">Today Only</p>
              <h2 className="text-xl font-black tracking-tight sm:text-2xl">Flash Sale is Live — {dealCount} deals</h2>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Countdown endTime={nextMidnight()} />
            <Link
              href="/products?minDiscount=20"
              className="shrink-0 rounded-full bg-white px-5 py-2.5 text-xs font-black uppercase tracking-wider text-red-600 shadow-lg transition hover:-translate-y-0.5 hover:scale-105"
            >
              Grab Now
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
