"use client";

import { useEffect, useState } from "react";

export default function Countdown({ endTime }: { endTime: number }) {
  // Starts null so we don't render "Offer ended" for one frame before the
  // effect below sets the real value (avoids both the impure Date.now()
  // call during render and a misleading flash of the ended state).
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLeft(endTime - Date.now());
    const t = setInterval(() => setLeft(endTime - Date.now()), 1000);
    return () => clearInterval(t);
  }, [endTime]);

  if (left === null) return null;

  if (left <= 0) {
    return <span className="text-sm font-semibold text-rose-600">Offer ended</span>;
  }

  const total = Math.floor(left / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-medium text-slate-500">Ends in</span>
      {[h, m, s].map((v, idx) => (
        <span key={idx} className="grid min-w-7 place-items-center rounded bg-slate-900 px-1.5 py-0.5 text-sm font-bold text-white dark:bg-white dark:text-slate-900">
          {pad(v)}
        </span>
      ))}
    </div>
  );
}
