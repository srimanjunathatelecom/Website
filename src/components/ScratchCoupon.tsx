"use client";

import { useEffect, useRef, useState } from "react";

export type CouponForDisplay = {
  id: number;
  code: string;
  type: string;
  value: string;
  minOrder: string;
};

// Foil colourways rotated across cards so a row of coupons reads as a set of
// distinct prizes rather than four identical grey rectangles.
const FOILS: [string, string, string][] = [
  ["#db2777", "#9333ea", "#f472b6"],
  ["#2563eb", "#4f46e5", "#60a5fa"],
  ["#d97706", "#dc2626", "#fbbf24"],
  ["#059669", "#0d9488", "#34d399"],
];

function drawFoil(ctx: CanvasRenderingContext2D, w: number, h: number, foil: [string, string, string]) {
  const [a, b, spark] = foil;
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, a);
  grad.addColorStop(1, b);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Diagonal sheen stripes.
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = "#ffffff";
  for (let x = -h; x < w + h; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 10, 0);
    ctx.lineTo(x + 10 - h, h);
    ctx.lineTo(x - h, h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Confetti sparkles — deterministic layout, no Math.random, so SSR/CSR
  // and re-mounts always paint the same cover.
  ctx.save();
  for (let i = 0; i < 26; i++) {
    const px = ((i * 97) % w + (i % 3) * 7) % w;
    const py = ((i * 53) % h + (i % 5) * 3) % h;
    const r = 1 + (i % 3);
    ctx.globalAlpha = 0.25 + (i % 4) * 0.12;
    ctx.fillStyle = i % 2 ? "#ffffff" : spark;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Gift mark + label.
  ctx.textAlign = "center";
  ctx.font = "26px serif";
  ctx.fillText("🎁", w / 2, h / 2 - 8);
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = "800 12px system-ui, sans-serif";
  ctx.fillText("SCRATCH & WIN", w / 2, h / 2 + 16);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "600 9px system-ui, sans-serif";
  ctx.fillText("drag to reveal your code", w / 2, h / 2 + 32);
}

function ScratchCard({ coupon, index }: { coupon: CouponForDisplay; index: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const scratching = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawFoil(ctx, canvas.width, canvas.height, FOILS[index % FOILS.length]);
  }, [index]);

  function checkRevealPercent() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = canvas;
    const pixels = ctx.getImageData(0, 0, width, height).data;
    let cleared = 0;
    for (let i = 3; i < pixels.length; i += 4 * 20) {
      if (pixels[i] === 0) cleared++;
    }
    const total = pixels.length / (4 * 20);
    if (cleared / total > 0.45) setRevealed(true);
  }

  function scratchAt(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * canvas.width;
    const y = ((clientY - rect.top) / rect.height) * canvas.height;
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.fill();
    checkRevealPercent();
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(coupon.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable (permissions/insecure context) — non-fatal.
    }
  }

  const discountLabel =
    coupon.type === "fixed" ? `₹${Math.round(Number(coupon.value))} OFF` : `${Math.round(Number(coupon.value))}% OFF`;

  return (
    <div className="relative h-32 w-full overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-slate-100 dark:bg-slate-900 dark:ring-slate-800">
      <div
        className={`absolute inset-0 flex flex-col items-center justify-center px-3 text-center transition-transform duration-500 ${
          revealed ? "scale-100" : "scale-90"
        }`}
      >
        <p className="text-xl font-black text-emerald-600">{discountLabel}</p>
        <button
          type="button"
          onClick={copyCode}
          className="mt-1 inline-flex min-h-7 items-center gap-1.5 rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-xs font-black tracking-wider text-slate-700 transition-colors hover:border-blue-400 hover:text-blue-700 dark:border-slate-600 dark:text-slate-200 dark:hover:text-blue-300"
          title="Copy code"
        >
          {copied ? "Copied ✓" : coupon.code}
        </button>
        {Number(coupon.minOrder) > 0 && (
          <p className="mt-1 text-[10px] text-slate-400">On orders above ₹{Math.round(Number(coupon.minOrder))}</p>
        )}
      </div>
      {!revealed && (
        <canvas
          ref={canvasRef}
          width={260}
          height={128}
          className="absolute inset-0 h-full w-full cursor-pointer touch-none"
          onMouseDown={() => (scratching.current = true)}
          onMouseUp={() => (scratching.current = false)}
          onMouseLeave={() => (scratching.current = false)}
          onMouseMove={(e) => scratching.current && scratchAt(e.clientX, e.clientY)}
          onTouchStart={() => (scratching.current = true)}
          onTouchEnd={() => (scratching.current = false)}
          onTouchMove={(e) => {
            scratching.current = true;
            const t = e.touches[0];
            if (t) scratchAt(t.clientX, t.clientY);
          }}
        />
      )}
    </div>
  );
}

export default function ScratchCoupon({ coupons }: { coupons: CouponForDisplay[] }) {
  if (coupons.length === 0) return null;
  return (
    <section className="shell band-tight">
      <div className="mb-4">
        <p className="text-[11px] font-black uppercase tracking-[0.3em] text-pink-600">Scratch &amp; Save</p>
        <h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Your Scratch Coupons</h2>
        <p className="mt-1 text-sm text-slate-500">Scratch a card to reveal a code, then apply it at checkout.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {coupons.map((c, i) => (
          <ScratchCard key={c.id} coupon={c} index={i} />
        ))}
      </div>
    </section>
  );
}
