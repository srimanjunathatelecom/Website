import AutoImage from "@/components/AutoImage";
import Link from "next/link";
import NewsletterForm from "./NewsletterForm";
import type { Outlet, Category } from "@/db/schema";
import type { FooterConfig } from "@/lib/siteConfig";
import { DEFAULT_FOOTER_CONFIG } from "@/lib/siteConfig";

type Settings = {
  brandName: string;
  legalName: string;
  tagline: string;
  gstin: string;
  pan: string;
  supportEmail: string;
  supportPhone: string;
  whatsappNumber: string;
};

// Real SVG glyphs instead of emoji — emoji render inconsistently across
// OS/browser (different weight, size, sometimes a fallback box), which is
// what made the old social row look unpolished. One shared stroke style
// keeps every icon in the footer visually consistent.
function SocialIcon({ platform }: { platform: string }) {
  const p = platform.trim().toLowerCase();
  const common = { viewBox: "0 0 24 24", className: "h-4 w-4", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (p.includes("insta")) return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M17.5 6.5h.01" /></svg>;
  if (p.includes("face")) return <svg {...common}><path d="M15 3h-3a4 4 0 0 0-4 4v3H5v4h3v7h4v-7h3l1-4h-4V7a1 1 0 0 1 1-1h3z" /></svg>;
  if (p.includes("you")) return <svg {...common}><rect x="2" y="5" width="20" height="14" rx="4" /><path d="M10 9.5v5l4.5-2.5Z" fill="currentColor" stroke="none" /></svg>;
  if (p.includes("twit") || p === "x") return <svg {...common}><path d="M4 4l16 16M20 4 4 20" /></svg>;
  if (p.includes("whats")) return <svg {...common} fill="currentColor" stroke="none"><path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2Zm5.4 14.2c-.2.6-1.3 1.2-1.9 1.3-.5.1-1.1.1-1.8-.1-.4-.1-1-.3-1.6-.6-2.9-1.2-4.7-4.2-4.9-4.4-.1-.2-1.2-1.6-1.2-3s.7-2.1 1-2.4c.2-.3.5-.4.7-.4h.5c.2 0 .4 0 .6.4.2.5.7 1.8.8 1.9.1.2.1.3 0 .5-.1.2-.1.3-.3.5l-.4.5c-.1.2-.3.3-.1.6.2.3.9 1.5 1.9 2.4 1.3 1.2 2.4 1.5 2.7 1.7.3.2.5.1.7-.1l.7-.8c.2-.3.4-.2.7-.1.3.1 1.7.8 2 .9.3.2.5.2.6.4.1.1.1.7-.1 1.3Z"/></svg>;
  if (p.includes("linked")) return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M7.5 9.5v7M7.5 6.5h.01M11.5 16.5v-4a2.5 2.5 0 0 1 5 0v4M11.5 16.5v-4.2" /></svg>;
  return <svg {...common}><path d="M10 14a3.5 3.5 0 0 1 0-5l3-3a3.5 3.5 0 0 1 5 5l-1.5 1.5M14 10a3.5 3.5 0 0 1 0 5l-3 3a3.5 3.5 0 0 1-5-5l1.5-1.5" /></svg>;
}

function digitsOnly(v?: string) {
  return (v || "").replace(/\D/g, "");
}

export default function Footer({
  settings,
  outlets,
  categories,
  footerConfig,
  logoUrl,
}: {
  settings: Settings | null;
  outlets: Outlet[];
  categories: Category[];
  footerConfig?: FooterConfig;
  logoUrl?: string;
}) {
  const s = settings;
  const fc = footerConfig || DEFAULT_FOOTER_CONFIG;
  const brand = s?.brandName || "Smart Mobile Stores";
  const brandParts = brand.trim().split(/\s+/).filter(Boolean);
  const brandLineTwo = brandParts.length > 1 ? brandParts[brandParts.length - 1] : "Stores";
  const brandLineOne = brandParts.length > 1 ? brandParts.slice(0, -1).join(" ") : brand;
  const waNumber = digitsOnly(s?.whatsappNumber);
  const phoneDigits = digitsOnly(s?.supportPhone);

  return (
    <footer className="relative overflow-hidden bg-gradient-to-b from-[#0f1420] via-[#0b0e17] to-[#080a11] text-slate-300">
      {/* Subtle brand-toned glow + dot texture so the dark background reads
          as a deliberate premium surface (matching the circle-strip band
          and hero gradients elsewhere on the site) rather than flat black. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-blue-800/0 via-blue-500/60 to-indigo-500/0" />
      <div className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-blue-600/10 blur-[100px]" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-indigo-600/10 blur-[100px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.03)_1px,transparent_0)] [background-size:24px_24px]" />

      <div className="relative mx-auto grid max-w-7xl gap-x-8 gap-y-12 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1.2fr]">
        {/* Brand + contact + newsletter */}
        <div>
          <div className="flex items-center gap-2.5">
            {logoUrl ? (
              <span className="footer-mark relative block h-10 w-10 shrink-0">
                <AutoImage src={logoUrl} alt={brand} sizes="40px" className="object-contain" />
                <span className="footer-mark__shine pointer-events-none absolute inset-0" />
              </span>
            ) : (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-800 via-blue-700 to-indigo-700 text-[11px] font-black tracking-widest text-white shadow-md ring-1 ring-white/20">SMS</span>
            )}
            <div className="leading-[0.95]">
              <p className="font-display text-[18px] font-black tracking-tight text-white">{brandLineOne}</p>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-blue-400">{brandLineTwo}</p>
            </div>
          </div>
          {s?.tagline && <p className="mt-3 text-sm leading-relaxed text-slate-400">{s.tagline}</p>}

          {/* Registered-business details — a clearly labelled two-line
              block instead of a run of plain text, so GSTIN/PAN read as
              legal/compliance info rather than clutter. */}
          {(s?.legalName || s?.gstin || s?.pan) && (
            <div className="mt-4 space-y-0.5 border-l-2 border-white/10 pl-3 text-[11.5px] text-slate-500">
              {s?.legalName && <p>{s.legalName}</p>}
              <p className="flex flex-wrap gap-x-3">
                {s?.gstin && <span>GSTIN: <span className="font-medium text-slate-300">{s.gstin}</span></span>}
                {s?.pan && <span>PAN: <span className="font-medium text-slate-300">{s.pan}</span></span>}
              </p>
            </div>
          )}

          {/* Direct contact — real icons + tel:/mailto:/wa.me links instead
              of static text, so these are actually clickable on mobile. */}
          <div className="mt-4 space-y-1.5 text-sm">
            {s?.supportPhone && (
              <a href={`tel:${phoneDigits}`} className="flex min-h-[24px] items-center gap-2 text-slate-400 transition hover:text-blue-400">
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" /></svg>
                {s.supportPhone}
              </a>
            )}
            {s?.supportEmail && (
              <a href={`mailto:${s.supportEmail}`} className="flex min-h-[24px] items-center gap-2 text-slate-400 transition hover:text-blue-400">
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
                {s.supportEmail}
              </a>
            )}
            {waNumber && (
              <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener noreferrer" className="flex min-h-[24px] items-center gap-2 text-emerald-400 transition hover:text-emerald-300">
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2Zm5.4 14.2c-.2.6-1.3 1.2-1.9 1.3-.5.1-1.1.1-1.8-.1-.4-.1-1-.3-1.6-.6-2.9-1.2-4.7-4.2-4.9-4.4-.1-.2-1.2-1.6-1.2-3s.7-2.1 1-2.4c.2-.3.5-.4.7-.4h.5c.2 0 .4 0 .6.4.2.5.7 1.8.8 1.9.1.2.1.3 0 .5-.1.2-.1.3-.3.5l-.4.5c-.1.2-.3.3-.1.6.2.3.9 1.5 1.9 2.4 1.3 1.2 2.4 1.5 2.7 1.7.3.2.5.1.7-.1l.7-.8c.2-.3.4-.2.7-.1.3.1 1.7.8 2 .9.3.2.5.2.6.4.1.1.1.7-.1 1.3Z"/></svg>
                Chat on WhatsApp
              </a>
            )}
          </div>

          <div className="mt-5">
            <p className="mb-1.5 text-xs font-semibold text-slate-200">{fc.newsletterLabel}</p>
            <NewsletterForm />
          </div>

          {fc.socialLinks.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {fc.socialLinks.map((link) => (
                <a
                  key={link.platform + link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={link.platform}
                  className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-slate-400 transition hover:border-blue-500 hover:text-blue-400"
                >
                  <SocialIcon platform={link.platform} />
                </a>
              ))}
            </div>
          )}
        </div>

        <div>
          <h4 className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{fc.shopHeading}</h4>
          <ul className="mt-4 space-y-2.5 text-sm text-slate-400">
            <li><Link href="/products" className="inline-flex min-h-[24px] items-center transition hover:text-blue-400">All Products</Link></li>
            {categories.map((c) => (
              <li key={c.id}>
                <Link href={`/products?category=${c.slug}`} className="inline-flex min-h-[24px] items-center transition hover:text-blue-400">{c.name}</Link>
              </li>
            ))}
            {fc.shopLinks.map((link) => (
              <li key={link.href}><Link href={link.href} className="inline-flex min-h-[24px] items-center transition hover:text-blue-400">{link.label}</Link></li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{fc.companyHeading}</h4>
          <ul className="mt-4 space-y-2.5 text-sm text-slate-400">
            {fc.companyLinks.map((link) => (
              <li key={link.href}><Link href={link.href} className="inline-flex min-h-[24px] items-center transition hover:text-blue-400">{link.label}</Link></li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{fc.storesHeading}</h4>
          <div className="mt-4 space-y-4">
            {outlets.map((o, i) => (
              <div key={o.id} className="text-sm text-slate-400">
                <p className="flex items-start gap-1.5 font-semibold text-slate-100">
                  <svg viewBox="0 0 24 24" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-400" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" /><circle cx="12" cy="10" r="2.5" /></svg>
                  {o.name || `Outlet ${i + 1}`}
                </p>
                <p className="mt-0.5 clamp-3 pl-5 text-xs leading-relaxed text-slate-500">{o.addressLine}</p>
                {o.contact && (
                  <a href={`tel:${digitsOnly(o.contact)}`} className="mt-0.5 flex min-h-[24px] items-center gap-1.5 py-1 pl-5 text-xs text-slate-400 transition hover:text-blue-400">
                    <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" /></svg>
                    {o.contact}
                  </a>
                )}
                {o.mapsUrl && (
                  <a href={o.mapsUrl} target="_blank" rel="noopener noreferrer" className="mt-0.5 flex min-h-[24px] items-center gap-1 py-1 pl-5 text-xs font-medium text-blue-400 hover:underline">
                    Get Directions
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 17 17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Trust strip — concrete operational facts instead of decorative
          badges, since these correspond to real, checkable behavior on the
          site (genuine COD availability, working returns policy, a real
          support contact) rather than generic marketing claims. */}
      <div className="relative border-t border-white/10 bg-black/20">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 py-7 text-center sm:grid-cols-4 sm:px-6">
          {[
            { icon: <path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9M17 2l5 5-9.5 9.5-5 1 1-5L17 2Z" />, label: "Genuine Products", sub: "Verified sellers only" },
            { icon: <><rect x="1" y="7" width="15" height="10" rx="1.5" /><path d="M16 10h3l3 3v4h-6" /><circle cx="6" cy="19" r="1.7" /><circle cx="18" cy="19" r="1.7" /></>, label: "Cash on Delivery", sub: "Where available at checkout" },
            { icon: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />, label: "Secure & Trusted", sub: "Protect Promise on eligible items" },
            { icon: <><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" /></>, label: "Real Support", sub: s?.supportPhone || "Call or WhatsApp us" },
          ].map((item) => (
            <div key={item.label} className="flex flex-col items-center gap-1.5">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-blue-400 shadow-sm ring-1 ring-white/10">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{item.icon}</svg>
              </span>
              <p className="text-[12px] font-bold text-slate-200">{item.label}</p>
              <p className="clamp-1 text-[10.5px] text-slate-500">{item.sub}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="relative border-t border-white/10 py-4">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-2 px-4 text-center text-xs text-slate-500 sm:flex-row sm:justify-between sm:px-6 sm:text-left">
          <p>© {new Date().getFullYear()} {s?.legalName || "Smart Mobile Stores"}. {fc.copyrightText}</p>
          <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            {s?.supportEmail && <a href={`mailto:${s.supportEmail}`} className="inline-flex min-h-[24px] items-center transition hover:text-blue-400">{s.supportEmail}</a>}
            {s?.supportPhone && (
              <>
                <span className="text-slate-700">·</span>
                <a href={`tel:${phoneDigits}`} className="inline-flex min-h-[24px] items-center transition hover:text-blue-400">{s.supportPhone}</a>
              </>
            )}
          </p>
        </div>
      </div>
    </footer>
  );
}