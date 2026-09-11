// Isomorphic product-image renderer. Produces premium, studio-style product
// shots as SVG data-URLs so the catalogue always looks like a real e-commerce
// store — never a broken or empty image. Also powers the "pick a starter
// image" grid in the admin Add-Product screen.
//
// Design language: soft studio backdrop, colour-tinted ambient glow, real
// contact shadows, metallic frames, glass glare sweeps and specular
// highlights. Every gradient ID is deterministic (derived from kind+palette)
// so server and client render byte-identical markup — Math.random() here
// caused hydration mismatches in the previous version.

export type RenderKind =
  | "phone"
  | "phone-alt"
  | "earbuds"
  | "charger"
  | "cable"
  | "case"
  | "speaker"
  | "laptop"
  | "mouse"
  | "ssd"
  | "backpack"
  | "headphones"
  | "stand";

export type Palette = [string, string]; // [primary, accent]

const PALETTES: Record<string, Palette> = {
  graphite: ["#1f2937", "#4b5563"],
  silver: ["#cbd5e1", "#94a3b8"],
  mint: ["#34d399", "#059669"],
  sky: ["#38bdf8", "#0284c7"],
  violet: ["#a78bfa", "#7c3aed"],
  rose: ["#fb7185", "#e11d48"],
  amber: ["#fbbf24", "#d97706"],
  ink: ["#0f172a", "#334155"],
  pearl: ["#f1f5f9", "#cbd5e1"],
  coral: ["#fb923c", "#ea580c"],
};

export function palette(name: keyof typeof PALETTES | string): Palette {
  return PALETTES[name] || PALETTES.graphite;
}

// Deterministic id prefix per render so <defs> never collide when several
// renders are inlined into one document, and never differ between SSR and CSR.
function idFor(kind: string, p: Palette, bg: string): string {
  let h = 0;
  const s = kind + p[0] + p[1] + bg;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return "r" + h.toString(36);
}

/* ---------------------------------------------------------------- shared */

const W = 600;
const H = 600;

// Soft studio backdrop with a colour-tinted glow behind the product and a
// blurred contact shadow on the floor.
function studio(id: string, p: Palette, bg: "white" | "dark"): string {
  if (bg === "dark") {
    return (
      `<defs>` +
      `<radialGradient id="${id}bg" cx="50%" cy="36%" r="80%">` +
      `<stop offset="0" stop-color="${p[0]}" stop-opacity="0.5"/>` +
      `<stop offset="55%" stop-color="#0b1220"/>` +
      `<stop offset="100%" stop-color="#04060c"/>` +
      `</radialGradient>` +
      `<radialGradient id="${id}glow" cx="50%" cy="50%" r="50%">` +
      `<stop offset="0" stop-color="${p[1]}" stop-opacity="0.35"/>` +
      `<stop offset="100%" stop-color="${p[1]}" stop-opacity="0"/>` +
      `</radialGradient>` +
      `</defs>` +
      `<rect width="${W}" height="${H}" fill="url(#${id}bg)"/>` +
      `<ellipse cx="300" cy="300" rx="240" ry="200" fill="url(#${id}glow)"/>`
    );
  }
  return (
    `<defs>` +
    `<radialGradient id="${id}bg" cx="50%" cy="30%" r="90%">` +
    `<stop offset="0" stop-color="#ffffff"/>` +
    `<stop offset="70%" stop-color="#f6f8fb"/>` +
    `<stop offset="100%" stop-color="#eaeef5"/>` +
    `</radialGradient>` +
    `<radialGradient id="${id}glow" cx="50%" cy="45%" r="55%">` +
    `<stop offset="0" stop-color="${p[0]}" stop-opacity="0.16"/>` +
    `<stop offset="100%" stop-color="${p[0]}" stop-opacity="0"/>` +
    `</radialGradient>` +
    `</defs>` +
    `<rect width="${W}" height="${H}" fill="url(#${id}bg)"/>` +
    `<ellipse cx="300" cy="290" rx="250" ry="210" fill="url(#${id}glow)"/>`
  );
}

// Blurred contact shadow.
function shadow(id: string, cx: number, cy: number, rx: number, o = 0.22): string {
  return (
    `<defs><radialGradient id="${id}sh${cx}" cx="50%" cy="50%" r="50%">` +
    `<stop offset="0" stop-color="#0f172a" stop-opacity="${o}"/>` +
    `<stop offset="100%" stop-color="#0f172a" stop-opacity="0"/>` +
    `</radialGradient></defs>` +
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${rx * 0.16}" fill="url(#${id}sh${cx})"/>`
  );
}

// Diagonal glass glare sweep, clipped by the caller.
function glare(x: number, y: number, w: number, h: number): string {
  return (
    `<g opacity="0.14">` +
    `<polygon points="${x + w * 0.1},${y} ${x + w * 0.42},${y} ${x - w * 0.12},${y + h} ${x - w * 0.36},${y + h}" fill="#ffffff"/>` +
    `<polygon points="${x + w * 0.58},${y} ${x + w * 0.7},${y} ${x + w * 0.14},${y + h} ${x + w * 0.02},${y + h}" fill="#ffffff"/>` +
    `</g>`
  );
}

/* ---------------------------------------------------------------- devices */

// Front-facing phone: metallic frame, edge-to-edge wallpaper screen,
// punch-hole camera, glass glare.
function phoneFront(id: string, x: number, y: number, w: number, h: number, p: Palette): string {
  const r = w * 0.15;
  return (
    `<defs>` +
    `<linearGradient id="${id}pf" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${p[0]}"/>` +
    `<stop offset="0.55" stop-color="${p[1]}"/>` +
    `<stop offset="1" stop-color="#0b1220"/>` +
    `</linearGradient>` +
    `<linearGradient id="${id}pfm" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0" stop-color="#3f4a5c"/><stop offset="0.08" stop-color="#8494ab"/>` +
    `<stop offset="0.5" stop-color="#232c3b"/>` +
    `<stop offset="0.92" stop-color="#8494ab"/><stop offset="1" stop-color="#3f4a5c"/>` +
    `</linearGradient>` +
    `<clipPath id="${id}pfc"><rect x="${x + w * 0.045}" y="${y + w * 0.045}" width="${w * 0.91}" height="${h - w * 0.09}" rx="${r * 0.72}"/></clipPath>` +
    `</defs>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#${id}pfm)"/>` +
    `<rect x="${x + w * 0.02}" y="${y + w * 0.02}" width="${w * 0.96}" height="${h - w * 0.04}" rx="${r * 0.85}" fill="#0b1220"/>` +
    `<g clip-path="url(#${id}pfc)">` +
    `<rect x="${x + w * 0.045}" y="${y + w * 0.045}" width="${w * 0.91}" height="${h - w * 0.09}" fill="url(#${id}pf)"/>` +
    `<circle cx="${x + w * 0.28}" cy="${y + h * 0.72}" r="${w * 0.42}" fill="${p[1]}" opacity="0.5"/>` +
    `<circle cx="${x + w * 0.78}" cy="${y + h * 0.3}" r="${w * 0.34}" fill="#ffffff" opacity="0.14"/>` +
    glare(x + w * 0.2, y, w, h) +
    `</g>` +
    `<circle cx="${x + w * 0.5}" cy="${y + w * 0.14}" r="${w * 0.035}" fill="#04060c"/>` +
    `<circle cx="${x + w * 0.485}" cy="${y + w * 0.128}" r="${w * 0.01}" fill="#7dd3fc" opacity="0.9"/>`
  );
}

// Back view phone with camera island and lens details.
function phoneBack(id: string, x: number, y: number, w: number, h: number, p: Palette): string {
  const r = w * 0.15;
  const lens = (cx: number, cy: number, lr: number) =>
    `<circle cx="${cx}" cy="${cy}" r="${lr}" fill="url(#${id}lr)"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${lr * 0.66}" fill="#0a1020"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${lr * 0.4}" fill="url(#${id}li)"/>` +
    `<circle cx="${cx - lr * 0.22}" cy="${cy - lr * 0.24}" r="${lr * 0.12}" fill="#dbeafe" opacity="0.95"/>`;
  const ix = x + w * 0.1, iy = y + h * 0.045, iw = w * 0.42, ih = h * 0.3;
  return (
    `<defs>` +
    `<linearGradient id="${id}pb" x1="0" y1="0" x2="0.6" y2="1">` +
    `<stop offset="0" stop-color="${p[1]}"/>` +
    `<stop offset="1" stop-color="${p[0]}"/>` +
    `</linearGradient>` +
    `<linearGradient id="${id}pbs" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0" stop-color="#ffffff" stop-opacity="0.35"/>` +
    `<stop offset="0.25" stop-color="#ffffff" stop-opacity="0"/>` +
    `</linearGradient>` +
    `<radialGradient id="${id}lr" cx="35%" cy="30%" r="80%">` +
    `<stop offset="0" stop-color="#9fb0c7"/><stop offset="1" stop-color="#2b3648"/>` +
    `</radialGradient>` +
    `<radialGradient id="${id}li" cx="40%" cy="35%" r="80%">` +
    `<stop offset="0" stop-color="#3b6ea8"/><stop offset="1" stop-color="#0a1226"/>` +
    `</radialGradient>` +
    `</defs>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#${id}pb)"/>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#${id}pbs)"/>` +
    `<rect x="${x + w * 0.03}" y="${y + w * 0.03}" width="${w * 0.94}" height="${h - w * 0.06}" rx="${r * 0.8}" fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="1.5"/>` +
    `<rect x="${ix}" y="${iy + h * 0.02}" width="${iw}" height="${ih}" rx="${w * 0.09}" fill="#101828" opacity="0.92"/>` +
    lens(ix + iw * 0.5, iy + ih * 0.3, w * 0.085) +
    lens(ix + iw * 0.5, iy + ih * 0.74, w * 0.085) +
    `<circle cx="${ix + iw + w * 0.09}" cy="${iy + ih * 0.22}" r="${w * 0.028}" fill="#fde68a" opacity="0.9"/>`
  );
}

/* ---------------------------------------------------------------- render */

function render(kind: RenderKind, p: Palette, bg: "white" | "dark" = "white"): string {
  const id = idFor(kind, p, bg);
  let body = "";

  if (kind === "phone") {
    body =
      shadow(id, 300, 495, 150) +
      `<g transform="rotate(6 386 300)">` + phoneBack(id, 320, 128, 152, 336, p) + `</g>` +
      `<g transform="rotate(-4 214 300)">` + phoneFront(id, 138, 118, 156, 344, p) + `</g>`;
  } else if (kind === "phone-alt") {
    body =
      shadow(id, 300, 500, 130) +
      `<g transform="rotate(-7 300 300)">` + phoneFront(id, 222, 118, 158, 352, p) + `</g>`;
  } else if (kind === "earbuds") {
    body =
      `<defs>` +
      `<linearGradient id="${id}cs" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="#ffffff" stop-opacity="0.5"/><stop offset="0.4" stop-color="#ffffff" stop-opacity="0"/>` +
      `</linearGradient>` +
      `<radialGradient id="${id}bud" cx="35%" cy="30%" r="80%">` +
      `<stop offset="0" stop-color="${p[1]}"/><stop offset="1" stop-color="${p[0]}"/>` +
      `</radialGradient>` +
      `<linearGradient id="${id}cb" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="${p[1]}"/><stop offset="1" stop-color="${p[0]}"/>` +
      `</linearGradient>` +
      `</defs>` +
      shadow(id, 300, 465, 140) +
      `<rect x="200" y="240" width="200" height="150" rx="42" fill="url(#${id}cb)"/>` +
      `<rect x="200" y="240" width="200" height="70" rx="35" fill="url(#${id}cs)"/>` +
      `<line x1="212" y1="300" x2="388" y2="300" stroke="#0f172a" stroke-opacity="0.25" stroke-width="2"/>` +
      `<circle cx="300" cy="345" r="5" fill="#a7f3d0"/>` +
      `<g>` +
      `<circle cx="252" cy="196" r="30" fill="url(#${id}bud)"/>` +
      `<rect x="244" y="196" width="17" height="66" rx="9" fill="url(#${id}bud)"/>` +
      `<circle cx="243" cy="187" r="8" fill="#ffffff" opacity="0.5"/>` +
      `<circle cx="348" cy="196" r="30" fill="url(#${id}bud)"/>` +
      `<rect x="340" y="196" width="17" height="66" rx="9" fill="url(#${id}bud)"/>` +
      `<circle cx="339" cy="187" r="8" fill="#ffffff" opacity="0.5"/>` +
      `</g>`;
  } else if (kind === "charger") {
    body =
      `<defs>` +
      `<linearGradient id="${id}ch" x1="0" y1="0" x2="0.7" y2="1">` +
      `<stop offset="0" stop-color="${p[1]}"/><stop offset="1" stop-color="${p[0]}"/>` +
      `</linearGradient>` +
      `<linearGradient id="${id}chs" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="#ffffff" stop-opacity="0.45"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/>` +
      `</linearGradient>` +
      `</defs>` +
      shadow(id, 300, 452, 110) +
      `<rect x="256" y="146" width="16" height="44" rx="5" fill="#94a3b8"/>` +
      `<rect x="328" y="146" width="16" height="44" rx="5" fill="#94a3b8"/>` +
      `<rect x="232" y="182" width="136" height="180" rx="30" fill="url(#${id}ch)"/>` +
      `<rect x="232" y="182" width="136" height="90" rx="30" fill="url(#${id}chs)"/>` +
      `<rect x="276" y="306" width="48" height="16" rx="8" fill="#0b1220"/>` +
      `<rect x="282" y="311" width="36" height="6" rx="3" fill="#334155"/>` +
      `<text x="300" y="252" font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="#ffffff" fill-opacity="0.85" text-anchor="middle">65W</text>`;
  } else if (kind === "cable") {
    body =
      `<defs>` +
      `<linearGradient id="${id}cw" x1="0" y1="0" x2="1" y2="0">` +
      `<stop offset="0" stop-color="${p[0]}"/><stop offset="0.5" stop-color="${p[1]}"/><stop offset="1" stop-color="${p[0]}"/>` +
      `</linearGradient>` +
      `</defs>` +
      shadow(id, 300, 445, 160) +
      `<path d="M140 300 C 210 170, 390 430, 460 300" stroke="url(#${id}cw)" stroke-width="17" fill="none" stroke-linecap="round"/>` +
      `<path d="M140 300 C 210 170, 390 430, 460 300" stroke="#ffffff" stroke-opacity="0.35" stroke-width="4" fill="none" stroke-linecap="round" stroke-dasharray="3 9"/>` +
      `<rect x="96" y="282" width="52" height="36" rx="9" fill="#334155"/>` +
      `<rect x="88" y="290" width="12" height="20" rx="4" fill="#94a3b8"/>` +
      `<rect x="452" y="282" width="52" height="36" rx="9" fill="#334155"/>` +
      `<rect x="500" y="290" width="12" height="20" rx="4" fill="#94a3b8"/>` +
      `<rect x="96" y="282" width="52" height="14" rx="7" fill="#ffffff" opacity="0.16"/>` +
      `<rect x="452" y="282" width="52" height="14" rx="7" fill="#ffffff" opacity="0.16"/>`;
  } else if (kind === "case") {
    body =
      `<defs>` +
      `<linearGradient id="${id}ca" x1="0" y1="0" x2="0.6" y2="1">` +
      `<stop offset="0" stop-color="${p[1]}"/><stop offset="1" stop-color="${p[0]}"/>` +
      `</linearGradient>` +
      `</defs>` +
      shadow(id, 300, 490, 120) +
      `<rect x="212" y="120" width="176" height="344" rx="38" fill="url(#${id}ca)"/>` +
      `<rect x="222" y="130" width="156" height="324" rx="30" fill="#0f172a" opacity="0.18"/>` +
      `<rect x="240" y="146" width="76" height="102" rx="24" fill="#0b1220" opacity="0.55"/>` +
      `<circle cx="262" cy="172" r="15" fill="#1e293b"/><circle cx="262" cy="172" r="8" fill="#0a1020"/>` +
      `<circle cx="262" cy="216" r="15" fill="#1e293b"/><circle cx="262" cy="216" r="8" fill="#0a1020"/>` +
      `<circle cx="296" cy="172" r="7" fill="#fde68a" opacity="0.8"/>` +
      `<rect x="212" y="120" width="80" height="344" rx="38" fill="#ffffff" opacity="0.1"/>`;
  } else if (kind === "speaker") {
    body =
      `<defs>` +
      `<linearGradient id="${id}sp" x1="0" y1="0" x2="1" y2="0">` +
      `<stop offset="0" stop-color="${p[0]}"/><stop offset="0.35" stop-color="${p[1]}"/><stop offset="1" stop-color="${p[0]}"/>` +
      `</linearGradient>` +
      `<pattern id="${id}mesh" width="12" height="12" patternUnits="userSpaceOnUse">` +
      `<circle cx="6" cy="6" r="2" fill="#0b1220" fill-opacity="0.35"/>` +
      `</pattern>` +
      `</defs>` +
      shadow(id, 300, 452, 110) +
      `<rect x="226" y="164" width="148" height="252" rx="46" fill="url(#${id}sp)"/>` +
      `<rect x="226" y="164" width="148" height="252" rx="46" fill="url(#${id}mesh)"/>` +
      `<rect x="226" y="164" width="60" height="252" rx="30" fill="#ffffff" opacity="0.12"/>` +
      `<rect x="262" y="148" width="76" height="20" rx="10" fill="${p[0]}"/>` +
      `<circle cx="284" cy="158" r="4" fill="#e2e8f0"/><circle cx="316" cy="158" r="4" fill="#e2e8f0"/>` +
      `<circle cx="300" cy="392" r="6" fill="#a7f3d0"/>`;
  } else if (kind === "laptop") {
    body =
      `<defs>` +
      `<linearGradient id="${id}ls" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="${p[0]}"/><stop offset="0.6" stop-color="${p[1]}"/><stop offset="1" stop-color="#0b1220"/>` +
      `</linearGradient>` +
      `<linearGradient id="${id}lk" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="#d7dee9"/><stop offset="1" stop-color="#aab6c8"/>` +
      `</linearGradient>` +
      `<clipPath id="${id}lc"><rect x="170" y="178" width="260" height="164" rx="6"/></clipPath>` +
      `</defs>` +
      shadow(id, 300, 448, 200, 0.26) +
      `<rect x="156" y="164" width="288" height="192" rx="14" fill="#1c2534"/>` +
      `<g clip-path="url(#${id}lc)">` +
      `<rect x="170" y="178" width="260" height="164" fill="url(#${id}ls)"/>` +
      `<circle cx="240" cy="300" r="80" fill="${p[1]}" opacity="0.45"/>` +
      `<circle cx="380" cy="220" r="60" fill="#ffffff" opacity="0.14"/>` +
      glare(230, 178, 260, 164) +
      `</g>` +
      `<path d="M118 356 L482 356 L452 392 L148 392 Z" fill="url(#${id}lk)"/>` +
      `<g fill="#8ea0b8" opacity="0.7">` +
      Array.from({ length: 4 }, (_, row) =>
        Array.from({ length: 12 }, (_, col) => {
          const t = row / 4;
          const rowX = 158 + t * 12;
          const rowW = 284 - t * 24;
          const x = rowX + (col * rowW) / 12;
          return `<rect x="${x.toFixed(1)}" y="${360 + row * 7}" width="${(rowW / 12 - 3).toFixed(1)}" height="5" rx="1.5"/>`;
        }).join("")
      ).join("") +
      `</g>` +
      `<rect x="272" y="380" width="56" height="8" rx="3" fill="#93a5bc"/>`;
  } else if (kind === "mouse") {
    body =
      `<defs>` +
      `<radialGradient id="${id}mo" cx="38%" cy="26%" r="90%">` +
      `<stop offset="0" stop-color="${p[1]}"/><stop offset="1" stop-color="${p[0]}"/>` +
      `</radialGradient>` +
      `<linearGradient id="${id}mg" x1="0" y1="0" x2="1" y2="0">` +
      `<stop offset="0" stop-color="${p[1]}" stop-opacity="0"/><stop offset="0.5" stop-color="${p[1]}"/><stop offset="1" stop-color="${p[1]}" stop-opacity="0"/>` +
      `</linearGradient>` +
      `</defs>` +
      shadow(id, 300, 438, 100) +
      `<path d="M234 258 C234 178 366 178 366 258 L366 352 C366 420 234 420 234 352 Z" fill="url(#${id}mo)"/>` +
      `<path d="M234 258 C234 178 366 178 366 258 L366 286 L234 286 Z" fill="#ffffff" opacity="0.14"/>` +
      `<line x1="300" y1="196" x2="300" y2="284" stroke="#0b1220" stroke-opacity="0.3" stroke-width="2"/>` +
      `<rect x="293" y="214" width="14" height="34" rx="7" fill="#0b1220" opacity="0.75"/>` +
      `<rect x="296" y="219" width="8" height="12" rx="4" fill="#7dd3fc"/>` +
      `<path d="M240 408 C 270 424 330 424 360 408" stroke="url(#${id}mg)" stroke-width="7" fill="none" stroke-linecap="round"/>`;
  } else if (kind === "ssd") {
    body =
      `<defs>` +
      `<linearGradient id="${id}sd" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="${p[1]}"/><stop offset="1" stop-color="${p[0]}"/>` +
      `</linearGradient>` +
      `<linearGradient id="${id}sb" x1="0" y1="0" x2="1" y2="0">` +
      `<stop offset="0" stop-color="#ffffff" stop-opacity="0.32"/><stop offset="0.2" stop-color="#ffffff" stop-opacity="0"/>` +
      `<stop offset="0.8" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.2"/>` +
      `</linearGradient>` +
      `</defs>` +
      shadow(id, 300, 425, 130) +
      `<rect x="192" y="216" width="216" height="132" rx="20" fill="url(#${id}sd)"/>` +
      `<rect x="192" y="216" width="216" height="132" rx="20" fill="url(#${id}sb)"/>` +
      `<rect x="208" y="238" width="120" height="20" rx="6" fill="#ffffff" opacity="0.85"/>` +
      `<rect x="208" y="268" width="76" height="10" rx="3" fill="#ffffff" opacity="0.4"/>` +
      `<rect x="208" y="310" width="42" height="10" rx="3" fill="#0b1220" opacity="0.4"/>` +
      `<rect x="392" y="270" width="18" height="24" rx="4" fill="#0b1220"/>` +
      `<rect x="396" y="276" width="10" height="12" rx="2" fill="#475569"/>`;
  } else if (kind === "headphones") {
    const cup = (cx: number) =>
      `<ellipse cx="${cx}" cy="330" rx="46" ry="58" fill="url(#${id}hc)"/>` +
      `<ellipse cx="${cx}" cy="330" rx="30" ry="42" fill="#0b1220" opacity="0.55"/>` +
      `<ellipse cx="${cx - 12}" cy="306" rx="10" ry="14" fill="#ffffff" opacity="0.35"/>`;
    body =
      `<defs>` +
      `<radialGradient id="${id}hc" cx="35%" cy="28%" r="90%">` +
      `<stop offset="0" stop-color="${p[1]}"/><stop offset="1" stop-color="${p[0]}"/>` +
      `</radialGradient>` +
      `</defs>` +
      shadow(id, 300, 448, 130) +
      `<path d="M186 330 C186 168 414 168 414 330" stroke="${p[0]}" stroke-width="26" fill="none" stroke-linecap="round"/>` +
      `<path d="M186 330 C186 168 414 168 414 330" stroke="#ffffff" stroke-opacity="0.25" stroke-width="8" fill="none" stroke-linecap="round"/>` +
      `<rect x="172" y="268" width="28" height="52" rx="14" fill="${p[1]}"/>` +
      `<rect x="400" y="268" width="28" height="52" rx="14" fill="${p[1]}"/>` +
      cup(196) +
      cup(404);
  } else if (kind === "stand") {
    body =
      `<defs>` +
      `<linearGradient id="${id}st" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="#d7dee9"/><stop offset="0.5" stop-color="#98a7bc"/><stop offset="1" stop-color="#c3cddc"/>` +
      `</linearGradient>` +
      `<linearGradient id="${id}sl" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="${p[1]}"/><stop offset="1" stop-color="${p[0]}"/>` +
      `</linearGradient>` +
      `</defs>` +
      shadow(id, 300, 452, 160) +
      `<path d="M170 402 L330 402 L360 430 L200 430 Z" fill="url(#${id}st)"/>` +
      `<path d="M212 402 L302 236 L330 236 L240 402 Z" fill="url(#${id}st)"/>` +
      `<path d="M292 250 L448 250 L466 236 L310 236 Z" fill="url(#${id}st)"/>` +
      `<g transform="rotate(-14 380 200)">` +
      `<rect x="296" y="170" width="196" height="120" rx="10" fill="#1c2534"/>` +
      `<rect x="304" y="178" width="180" height="104" rx="6" fill="url(#${id}sl)"/>` +
      `<rect x="304" y="178" width="70" height="104" rx="6" fill="#ffffff" opacity="0.14"/>` +
      `</g>`;
  } else {
    // backpack
    body =
      `<defs>` +
      `<linearGradient id="${id}bp" x1="0" y1="0" x2="0.5" y2="1">` +
      `<stop offset="0" stop-color="${p[1]}"/><stop offset="1" stop-color="${p[0]}"/>` +
      `</linearGradient>` +
      `</defs>` +
      shadow(id, 300, 462, 120) +
      `<path d="M244 194 C244 146 356 146 356 194 L356 206 L244 206 Z" fill="${p[0]}"/>` +
      `<path d="M256 198 C256 160 344 160 344 198" stroke="${p[1]}" stroke-width="12" fill="none" stroke-linecap="round"/>` +
      `<path d="M206 226 C206 158 394 158 394 226 L394 404 C394 436 206 436 206 404 Z" fill="url(#${id}bp)"/>` +
      `<path d="M206 226 C206 158 394 158 394 226 L394 250 L206 250 Z" fill="#ffffff" opacity="0.12"/>` +
      `<rect x="244" y="272" width="112" height="96" rx="16" fill="#0f172a" opacity="0.25"/>` +
      `<line x1="300" y1="272" x2="300" y2="368" stroke="#0b1220" stroke-opacity="0.4" stroke-width="3" stroke-dasharray="5 6"/>` +
      `<circle cx="300" cy="380" r="7" fill="#e2e8f0" opacity="0.8"/>` +
      `<rect x="268" y="188" width="64" height="18" rx="9" fill="#0b1220" opacity="0.5"/>`;
  }

  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' viewBox='0 0 ${W} ${H}'>` +
    studio(id, p, bg) +
    body +
    `</svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

const KIND_BY_CAT: Record<string, RenderKind[]> = {
  mobiles: ["phone", "phone-alt"],
  "mobile-accessories": ["earbuds", "charger", "cable", "case", "speaker"],
  "laptop-accessories": ["mouse", "ssd", "charger", "backpack", "laptop"],
  "mobile-service": ["phone-alt"],
  "laptop-service": ["laptop"],
};
const PAL_LIST = ["violet", "mint", "sky", "ink", "coral", "graphite", "rose", "amber"];

// Dark glowing thumbnail used in the admin table — matches the reference
// console's product thumbnails regardless of the stored white-bg image.
export function renderThumb(categorySlug: string, seed: number): string {
  const kinds = KIND_BY_CAT[categorySlug] || ["phone"];
  const kind = kinds[seed % kinds.length];
  const p = palette(PAL_LIST[seed % PAL_LIST.length]);
  return render(kind, p, "dark");
}

export function renderProduct(kind: RenderKind, paletteName: string): string {
  return render(kind, palette(paletteName));
}

// Dark, cinematic variant for hero/banner compositions.
export function renderProductDark(kind: RenderKind, paletteName: string): string {
  return render(kind, palette(paletteName), "dark");
}

// Catalogue of starter images shown in the admin Add-Product picker.
// All generated as SVG data-URLs (never a static file path) so every
// starter thumbnail always renders, in dev and production alike.
export const STARTER_IMAGES: { url: string; label: string }[] = [
  { url: renderProduct("phone", "ink"), label: "Flagship phone" },
  { url: renderProduct("phone-alt", "graphite"), label: "Mid-range phone" },
  { url: renderProduct("earbuds", "sky"), label: "Earbuds" },
  { url: renderProduct("phone", "violet"), label: "Phone · violet" },
  { url: renderProduct("phone-alt", "mint"), label: "Phone · mint" },
  { url: renderProduct("phone-alt", "sky"), label: "Phone · sky" },
  { url: renderProduct("phone-alt", "coral"), label: "Phone · coral" },
  { url: renderProduct("phone-alt", "ink"), label: "Phone · ink" },
  { url: renderProduct("earbuds", "ink"), label: "Earbuds · ink" },
  { url: renderProduct("charger", "graphite"), label: "Charger" },
  { url: renderProduct("cable", "rose"), label: "Cable" },
  { url: renderProduct("case", "violet"), label: "Case" },
  { url: renderProduct("speaker", "rose"), label: "Speaker" },
  { url: renderProduct("laptop", "ink"), label: "Laptop" },
  { url: renderProduct("mouse", "sky"), label: "Mouse" },
  { url: renderProduct("ssd", "violet"), label: "SSD" },
  { url: renderProduct("backpack", "graphite"), label: "Backpack" },
];

// Infer the most accurate render kind from a product's name, falling back to
// the category rotation. Keeps seeded/demo products from wearing the wrong
// product shot (a mouse with an SSD image erodes trust instantly).
export function imageForProductName(categorySlug: string, name: string, i: number): string {
  const n = name.toLowerCase();
  const pals = ["violet", "mint", "sky", "ink", "coral", "graphite", "rose", "amber"];
  const pal = pals[i % pals.length];
  const rules: [RegExp, RenderKind][] = [
    [/cable/, "cable"],
    [/charger|adapter|power bank|gan/, "charger"],
    [/earbud|airdope|bud|tws/, "earbuds"],
    [/headphone|rockerz|over-ear|on-ear/, "headphones"],
    [/mouse/, "mouse"],
    [/ssd|nvme|hard drive|hdd|pendrive/, "ssd"],
    [/backpack/, "backpack"],
    [/sleeve|case|cover/, "case"],
    [/stand|dock/, "stand"],
    [/speaker|soundbar/, "speaker"],
    [/laptop|macbook|notebook/, "laptop"],
  ];
  for (const [re, kind] of rules) if (re.test(n)) return renderProduct(kind, pal);
  return defaultImageFor(categorySlug, i);
}

// Map a category slug + index to a sensible default render so freshly-seeded
// products always look like proper product shots.
export function defaultImageFor(categorySlug: string, i: number): string {
  const phonePals = ["violet", "mint", "sky", "ink", "coral", "graphite", "rose", "amber"];
  const accPals = ["ink", "rose", "violet", "graphite", "sky"];
  const lapPals = ["ink", "graphite", "sky", "violet"];
  const pick = (arr: string[]) => arr[i % arr.length];
  switch (categorySlug) {
    case "mobiles":
      return renderProduct(i % 2 ? "phone" : "phone-alt", pick(phonePals));
    case "mobile-accessories":
      return renderProduct((["earbuds", "charger", "cable", "case", "speaker"] as RenderKind[])[i % 5], pick(accPals));
    case "laptop-accessories":
      return renderProduct((["mouse", "ssd", "charger", "backpack", "laptop"] as RenderKind[])[i % 5], pick(lapPals));
    case "mobile-service":
    case "laptop-service":
      return renderProduct("phone-alt", pick(phonePals));
    default:
      return renderProduct("phone", pick(phonePals));
  }
}

// Night-time storefront illustration for outlet cards that have no real
// photo uploaded yet. A designed facade (awning, lit windows, display
// shelves, sign) instead of the old flat gradient-with-text placeholder.
// Deterministic output — safe for SSR and reseeding.
export function renderStorefront(signText: string, accent = "#3b82f6"): string {
  const sign = String(signText).slice(0, 26).replace(/[<>&'"]/g, "");
  const shelves = [0, 1, 2]
    .map((row) => {
      const y = 208 + row * 46;
      const phones = [0, 1, 2, 3, 4]
        .map((i) => {
          const x = 96 + i * 58;
          return `<rect x='${x}' y='${y}' width='26' height='34' rx='4' fill='#0b1220' stroke='${accent}55' stroke-width='1'/><rect x='${x + 4}' y='${y + 4}' width='18' height='26' rx='2' fill='${accent}33'/>`;
        })
        .join("");
      return `<rect x='84' y='${y + 38}' width='320' height='3' rx='1.5' fill='#1e293b'/>${phones}`;
    })
    .join("");
  const data = `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='450' viewBox='0 0 800 450'>
<defs>
<linearGradient id='sky' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#020617'/><stop offset='1' stop-color='#0f172a'/></linearGradient>
<linearGradient id='glow' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${accent}' stop-opacity='.35'/><stop offset='1' stop-color='${accent}' stop-opacity='0'/></linearGradient>
<linearGradient id='glass' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#122036'/><stop offset='1' stop-color='#0b1526'/></linearGradient>
<linearGradient id='walk' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#1e293b'/><stop offset='1' stop-color='#0f172a'/></linearGradient>
</defs>
<rect width='800' height='450' fill='url(#sky)'/>
<circle cx='690' cy='60' r='2' fill='#e2e8f0' opacity='.7'/><circle cx='620' cy='38' r='1.4' fill='#e2e8f0' opacity='.5'/><circle cx='740' cy='110' r='1.6' fill='#e2e8f0' opacity='.6'/><circle cx='60' cy='50' r='1.6' fill='#e2e8f0' opacity='.6'/><circle cx='130' cy='90' r='1.2' fill='#e2e8f0' opacity='.4'/>
<rect x='40' y='96' width='720' height='294' rx='10' fill='#111c2e' stroke='#1e293b'/>
<rect x='40' y='96' width='720' height='58' rx='10' fill='#0b1424'/>
<rect x='64' y='112' width='672' height='30' rx='15' fill='#0f1b30' stroke='${accent}66'/>
<text x='400' y='133' font-family='Segoe UI,Arial' font-size='19' font-weight='800' letter-spacing='4' fill='#f1f5f9' text-anchor='middle'>${sign}</text>
<g>
<path d='M52 154 h696 l-14 26 h-668 z' fill='${accent}'/>
<path d='M52 154 h696 l-14 26 h-668 z' fill='url(#glow)' opacity='.5'/>
${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => `<path d='M${64 + i * 56} 154 l28 0 -7 26 -28 0 z' fill='#0b1424' opacity='${i % 2 ? ".28" : "0"}'/>`).join("")}
</g>
<rect x='64' y='190' width='372' height='176' rx='8' fill='url(#glass)' stroke='#22304a'/>
<rect x='64' y='190' width='372' height='60' fill='url(#glow)' opacity='.7'/>
${shelves}
<rect x='456' y='190' width='140' height='200' rx='8' fill='#0d1830' stroke='#22304a'/>
<rect x='466' y='200' width='120' height='180' rx='6' fill='url(#glass)'/>
<rect x='522' y='282' width='34' height='7' rx='3.5' fill='${accent}'/>
<rect x='616' y='190' width='120' height='176' rx='8' fill='url(#glass)' stroke='#22304a'/>
<rect x='632' y='210' width='88' height='120' rx='6' fill='#0b1220' stroke='${accent}44'/>
<rect x='640' y='218' width='72' height='104' rx='4' fill='${accent}22'/>
<text x='676' y='276' font-family='Segoe UI,Arial' font-size='13' font-weight='700' fill='#e2e8f0' text-anchor='middle'>OFFERS</text>
<rect x='0' y='390' width='800' height='60' fill='url(#walk)'/>
<ellipse cx='250' cy='396' rx='210' ry='7' fill='${accent}' opacity='.14'/>
<ellipse cx='526' cy='398' rx='90' ry='5' fill='${accent}' opacity='.1'/>
</svg>`;
  return "data:image/svg+xml," + encodeURIComponent(data.replace(/\n/g, ""));
}
