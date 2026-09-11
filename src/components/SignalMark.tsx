"use client";

/**
 * SignalMark — the store's signature emblem: an abstract, tech-forward
 * mark combining a rounded "device" tile, a storefront glyph, and signal
 * bars — evoking phones, connectivity and retail without being a literal
 * character or mascot.
 *
 * Redesigned for a calmer, premium feel: the mark is completely static at
 * rest. It plays one subtle entrance animation on mount (fade + slight
 * scale), and a gentle glow/lift only on hover — no infinite spinning,
 * pulsing, or flickering. Respects prefers-reduced-motion by disabling
 * even the entrance transition.
 *
 * Fully original inline SVG — no third-party IP.
 *
 * size: pixel height of the mark (width scales with it)
 * variant: "full" = larger hero placement, "compact" = smaller inline placement
 */
export default function SignalMark({
  size = 150,
  variant = "full",
  className = "",
}: {
  size?: number;
  variant?: "full" | "compact";
  className?: string;
}) {
  const s = size;

  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 160 160"
      className={`signal-mark ${className}`}
      role="img"
      aria-label="SMS Stores signal mark"
    >
      <defs>
        <linearGradient id="signalTile" x1="20" y1="20" x2="140" y2="140" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1e40af" />
          <stop offset="0.55" stopColor="#3b5bdb" />
          <stop offset="1" stopColor="#4f46e5" />
        </linearGradient>
        <linearGradient id="signalBolt" x1="60" y1="45" x2="100" y2="115" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fde68a" />
          <stop offset="1" stopColor="#d97706" />
        </linearGradient>
        <radialGradient id="signalGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#93c5fd" stopOpacity="0.45" />
          <stop offset="1" stopColor="#93c5fd" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* ambient glow behind the tile — static, brightens slightly on hover */}
      <circle cx="80" cy="80" r="68" fill="url(#signalGlow)" className="signal-glow" />

      {/* connectivity dots — fixed positions, no orbit motion */}
      <circle cx="80" cy="10" r="5.5" fill="#60a5fa" opacity="0.85" />
      <circle cx="150" cy="80" r="5" fill="#818cf8" opacity="0.85" />
      <circle cx="80" cy="150" r="5" fill="#fbbf24" opacity="0.85" />

      {/* device tile */}
      <rect x="24" y="24" width="112" height="112" rx="32" fill="url(#signalTile)" />
      <rect x="24" y="24" width="112" height="112" rx="32" fill="url(#signalGlow)" opacity="0.25" />

      {/* corner shine */}
      <path d="M40 32c14-6 28-8 44-6" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.3" />

      {/* signal bars, bottom-left of tile */}
      <g opacity="0.9">
        <rect x="40" y="100" width="8" height="16" rx="2.5" fill="#ffffff" opacity="0.55" />
        <rect x="52" y="92" width="8" height="24" rx="2.5" fill="#ffffff" opacity="0.75" />
        <rect x="64" y="82" width="8" height="34" rx="2.5" fill="#ffffff" />
      </g>

      {/* central storefront glyph — awning + doorway */}
      <g className="signal-bolt">
        <path d="M62 62h36l6 14a7 7 0 0 1-7 9 8 8 0 0 1-8-6 8 8 0 0 1-8 6 8 8 0 0 1-8-6 8 8 0 0 1-8 6 7 7 0 0 1-7-9z" fill="url(#signalBolt)" stroke="#0f1b3d" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M66 85v29h28V85" fill="none" stroke="url(#signalBolt)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="86" y="96" width="10" height="18" rx="2" fill="#0f1b3d" opacity="0.9" />
      </g>

      <style>{`
        .signal-mark {
          overflow: visible;
          animation: signalEnter 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
          transform-origin: 80px 80px;
          transition: transform 0.25s ease;
        }
        .signal-mark:hover { transform: scale(1.03); }
        .signal-glow { transition: opacity 0.3s ease; }
        .signal-mark:hover .signal-glow { opacity: 1; }
        @keyframes signalEnter {
          from { opacity: 0; transform: scale(0.92); }
          to   { opacity: 1; transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .signal-mark { animation: none; opacity: 1; }
          .signal-mark:hover { transform: none; }
        }
      `}</style>
    </svg>
  );
}