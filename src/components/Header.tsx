"use client";

import { User } from "lucide-react";
import Link from "next/link";
import AutoImage from "@/components/AutoImage";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ThemeToggle from "./ThemeToggle";
import SignalMark from "./SignalMark";
import { cartCount } from "@/lib/cart";
import { compareCount } from "@/lib/compare";
import { fetchSession } from "@/lib/session";
import type { HomePageConfig } from "@/lib/homepageConfig";
import type { NavItem } from "@/lib/siteConfig";

type Cat = { id: number; name: string; slug: string };

// Rotating ring classes so admin-added nav items still look intentional
// without needing a "color" field in the CMS form.
const NAV_TONES = [
  "from-orange-500/15 text-orange-600 ring-orange-200",
  "from-blue-500/15 text-blue-600 ring-blue-200",
  "from-teal-500/15 text-teal-600 ring-teal-200",
  "from-violet-500/15 text-violet-600 ring-violet-200",
  "from-amber-500/15 text-amber-600 ring-amber-200",
  "from-rose-500/15 text-rose-600 ring-rose-200",
  "from-indigo-500/15 text-indigo-600 ring-indigo-200",
  "from-emerald-500/15 text-emerald-600 ring-emerald-200",
];

export default function Header({ brand, categories, whatsapp, logoUrl, homeConfig, navItems }: { brand: string; categories: Cat[]; whatsapp: string; logoUrl?: string; homeConfig: HomePageConfig; navItems: NavItem[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sugg, setSugg] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [menu, setMenu] = useState(false);
  const [count, setCount] = useState(0);
  const [cmpCount, setCmpCount] = useState(0);
  const [me, setMe] = useState<any>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initial sync reads (localStorage-backed cart/compare, no SSR
    // equivalent) plus subscribing to future changes and fetching the
    // logged-in user once on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCount(cartCount());
    setCmpCount(compareCount());

    const onCartCh = () => setCount(cartCount());
    const onCmpCh = () => setCmpCount(compareCount());

    window.addEventListener("sms-cart-change", onCartCh);
    window.addEventListener("sms-compare-change", onCmpCh);
    
    fetchSession().then((d) => setMe(d)).catch(() => {});
    
    return () => {
      window.removeEventListener("sms-cart-change", onCartCh);
      window.removeEventListener("sms-compare-change", onCmpCh);
    }
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    // Debounced search-as-you-type: clearing suggestions when the query is
    // empty is a direct response to the q dependency changing, not a
    // render-time derivation worth hoisting out of the effect.
    if (!q.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSugg([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/products?search=${encodeURIComponent(q)}&limit=6`);
        const d = await r.json();
        setSugg(d.items || []); setOpen(true); setActiveIdx(-1);
      } catch { setSugg([]); }
      finally { setLoading(false); }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  function selectSuggestion(s: any) {
    setOpen(false);
    setQ("");
    router.push(`/products/${s.slug}`);
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || sugg.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % sugg.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i <= 0 ? sugg.length - 1 : i - 1));
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIdx(-1);
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      selectSuggestion(sugg[activeIdx]);
    }
  }

  function submit(e: React.FormEvent) { e.preventDefault(); const t = q.trim(); if (!t) return; router.push(`/products?search=${encodeURIComponent(t)}`); setOpen(false); }

  const catNav = navItems.map((n, i) => {
    const cat = categories.find((c) => n.href.includes(c.slug));
    const cls = NAV_TONES[i % NAV_TONES.length];
    return cat ? { ...n, label: cat.name, cls } : { ...n, cls };
  });
  const marqueeItems = [...homeConfig.marqueeItems, `Call ${whatsapp || "7996663356"}`];

  return (
    <header className="sticky top-0 z-40">
      <div className="relative bg-gradient-to-b from-white to-slate-50/80 text-slate-800 shadow-[0_1px_0_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(30,64,175,0.35)] overflow-hidden">
        {/* Personalised watermark texture — the store mark tiled faintly
            across the whole header bar, kept very low-opacity so it reads
            as "branded" texture rather than a pattern competing with the
            search bar and icons. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "url('/images/sms-logo-watermark.png')",
            backgroundRepeat: "repeat",
            backgroundSize: "84px 21px",
          }}
        />
        {/* Two soft brand-toned glows (blue + indigo) bookending the bar —
            adds depth without competing with the search bar or icons. */}
        <div className="pointer-events-none absolute -left-16 -top-24 h-64 w-64 rounded-full bg-blue-500/[0.07] blur-[90px]" />
        <div className="pointer-events-none absolute -right-20 -bottom-24 h-64 w-64 rounded-full bg-indigo-500/[0.06] blur-[90px]" />
        {/* Brand-coloured edge: royal blue into indigo, bookending the bar,
            with a soft glow beneath it for a bit of lift. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-blue-800/0 via-blue-700 to-indigo-600 shadow-[0_1px_10px_rgba(67,56,202,0.45)]" />

        {/* Mobile lays this out as two rows: brand + actions, then a
            full-width search bar underneath (flex-wrap + the search box's
            order-last/w-full below). Keeping all four on one row cost the
            cart icon ~37px of horizontal space it didn't have on a 375px
            phone, and the bar's overflow-hidden meant the icon was silently
            clipped rather than pushing the page wide - so it never showed up
            as an overflow bug, the cart button was just unreachable. */}
        <div className="relative mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-2.5 px-4 py-4 sm:flex-nowrap sm:gap-5 sm:px-6 lg:px-8">
          <button className="grid h-9 w-9 place-items-center rounded-full text-slate-600 transition hover:bg-blue-50 hover:text-blue-700 md:hidden" onClick={() => setMenu((v) => !v)} aria-label={menu ? "Close menu" : "Open menu"} aria-expanded={menu} aria-controls="mobile-nav-panel">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" /></svg>
          </button>

          <Link href="/" className="flex shrink-0 items-center gap-3">
            {/* Brand mark — logo has a transparent background, so it floats
                directly on the header instead of sitting in a boxed card.
                A quiet static glow sits behind it, with a one-time entrance
                and hover-only shine — see .brand-mark in globals.css. */}
            <span className="brand-mark relative grid h-11 w-[104px] shrink-0 place-items-center sm:h-14 sm:w-[132px]">
              <span className="brand-mark__ring absolute -inset-2.5 sm:-inset-3 rounded-2xl" />
              <span className="brand-mark__halo absolute -inset-3 sm:-inset-4 rounded-2xl bg-gradient-to-br from-blue-600/20 via-indigo-500/15 to-blue-400/20 blur-[14px]" />
              {logoUrl ? (
                <span className="relative block h-full w-full">
                  <AutoImage src={logoUrl} alt={brand} sizes="132px" className="object-contain drop-shadow-[0_3px_8px_rgba(30,27,75,0.22)]" priority />
                  <span className="brand-mark__shine pointer-events-none absolute inset-0" />
                </span>
              ) : (
                <SignalMark size={46} variant="compact" className="relative shrink-0" />
              )}
            </span>
            <span className="ml-2 hidden border-l border-slate-200 pl-3 leading-tight lg:block">
              <span className="block text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">{homeConfig.headerDeliveryLabel}</span>
              <span className="block bg-gradient-to-r from-blue-800 to-indigo-700 bg-clip-text text-[13.5px] font-black tracking-tight text-transparent">{whatsapp || "7996663356"}</span>
            </span>
          </Link>

          {/* min-w-0 is load-bearing: a flex item's default min-width:auto
             refuses to shrink past the input's intrinsic width (~175px), which
             is what pushed the action icons past the right edge. */}
          <div ref={boxRef} className="relative order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
            <form onSubmit={submit} className="relative" role="search">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onFocus={() => (sugg.length || loading) && setOpen(true)}
                onKeyDown={onSearchKeyDown}
                type="search"
                placeholder="Search for smartphones, laptops, repairs…"
                className="w-full rounded-full bg-slate-50/90 py-3 pl-11 pr-4 text-sm text-slate-800 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] outline-none ring-1 ring-slate-200 transition focus:bg-white focus:shadow-[0_4px_16px_-6px_rgba(30,64,175,0.35)] focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400"
                role="combobox"
                aria-expanded={open}
                aria-controls="header-search-listbox"
                aria-autocomplete="list"
                aria-activedescendant={activeIdx >= 0 ? `header-search-option-${activeIdx}` : undefined}
                aria-label="Search products"
              />
              <svg viewBox="0 0 24 24" className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" strokeLinecap="round" /></svg>
            </form>
            {open && (loading || sugg.length > 0 || q.trim()) && (
              <div
                id="header-search-listbox"
                role="listbox"
                aria-label="Search suggestions"
                className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-2xl bg-white text-slate-800 shadow-2xl ring-1 ring-slate-100"
              >
                {loading ? (
                  <div className="px-4 py-4 text-center text-sm text-slate-500">Searching…</div>
                ) : sugg.length > 0 ? (
                  sugg.map((s, i) => (
                    <Link
                      key={s.id}
                      id={`header-search-option-${i}`}
                      role="option"
                      aria-selected={activeIdx === i}
                      href={`/products/${s.slug}`}
                      onClick={() => setOpen(false)}
                      onMouseEnter={() => setActiveIdx(i)}
                      className={`flex items-center gap-3 px-3 py-2 ${activeIdx === i ? "bg-slate-50" : "hover:bg-slate-50"}`}
                    >
                      <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                        {s.primaryImage ? <AutoImage src={s.primaryImage} alt="" sizes="40px" className="object-contain" /> : null}
                      </span>
                      <span className="min-w-0 flex-1"><span className="clamp-1 block text-sm font-semibold">{s.name}</span><span className="text-xs text-slate-500">{s.brand}</span></span>
                      <span className="text-sm font-black text-emerald-600">₹{Number(s.mop).toLocaleString("en-IN")}</span>
                    </Link>
                  ))
                ) : (
                  <div className="px-4 py-4 text-center text-sm text-slate-500">No products found for &quot;{q}&quot;</div>
                )}
              </div>
            )}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:ml-0 sm:gap-2">
            <ThemeToggle />
            {/* Compare is the least-used of the four and is reachable from the
                mobile menu, so it steps aside on the narrowest phones to keep
                the cart button on screen. */}
            <Link href="/compare" aria-label="Compare" className="relative hidden h-9 w-9 place-items-center rounded-full text-slate-500 transition hover:bg-blue-50 hover:text-blue-700 min-[360px]:grid">
              <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3L4 7l4 4"/><path d="M4 7h16"/><path d="M16 21l4-4-4-4"/><path d="M20 17H4"/>
              </svg>
              {cmpCount > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-blue-700 px-1 text-[10px] font-black text-white">{cmpCount}</span>}
            </Link>
            <Link href="/wishlist" aria-label="Wishlist" className="grid h-9 w-9 place-items-center rounded-full text-slate-500 transition hover:bg-blue-50 hover:text-blue-700">
              <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" strokeLinejoin="round" /></svg>
            </Link>
            <Link href="/cart" aria-label="Cart" className="relative grid h-9 w-9 place-items-center rounded-full text-slate-500 transition hover:bg-blue-50 hover:text-blue-700">
              <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              {count > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-amber-600 px-1 text-[10px] font-black text-white">{count}</span>}
            </Link>
            <Link href={me?.customer ? "/account" : "/login"} className="ml-1 hidden items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-bold text-slate-700 transition hover:bg-slate-900/5 sm:flex">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-900/5"><User aria-hidden className="h-3.5 w-3.5" /></span>
              {me?.customer ? me.customer.name.split(" ")[0] : "Login / Signup"}
            </Link>
          </div>
        </div>
      </div>

      {/* .marquee-wrap carries gradient fades on both ends (see globals.css)
          so offers dissolve at the viewport edge instead of being sliced
          mid-letter. */}
      <div className="marquee-wrap overflow-hidden border-t border-white/10 bg-gradient-to-r from-blue-900 via-blue-700 to-indigo-800 py-2.5 text-[12.5px] font-bold tracking-wide text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:py-3">
        <div className="marquee-track">
          {Array.from({ length: 2 }).map((_, i) => (
            <span key={i} className="mx-8 inline-flex items-center gap-10 sm:gap-12">
              {marqueeItems.map((item, idx) => (
                <span key={`${i}-${idx}`} className="whitespace-nowrap">{item}</span>
              ))}
            </span>
          ))}
        </div>
      </div>

      {menu && (
        <div id="mobile-nav-panel" className="border-b border-slate-100 bg-white px-3 py-3 md:hidden dark:border-slate-800 dark:bg-slate-900">
          <div className="grid grid-cols-2 gap-2">
            {catNav.map((n) => (
              <Link key={n.label} href={n.href} onClick={() => setMenu(false)} className={`flex items-center gap-2 rounded-xl bg-gradient-to-b to-transparent px-3 py-2 text-sm font-bold ring-1 ring-inset ${n.cls}`}>
                <span>{n.icon}</span>{n.label}
              </Link>
            ))}
          </div>
          {/* Compare is hidden from the top bar under 360px, so it needs a
              home here or it becomes unreachable on the smallest phones. */}
          <Link href="/compare" onClick={() => setMenu(false)} className="mt-2 flex items-center justify-between rounded-xl px-3 py-2 text-sm font-bold text-slate-700 ring-1 ring-inset ring-slate-200 min-[360px]:hidden dark:text-slate-200 dark:ring-slate-700">
            <span>Compare products</span>
            {cmpCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-blue-700 px-1 text-[10px] font-black text-white">{cmpCount}</span>}
          </Link>
          <div className="mt-3 grid grid-cols-1 gap-2">
            <Link href={me?.customer ? "/account" : "/login"} onClick={() => setMenu(false)} className="rounded-xl bg-slate-900 py-2 text-center text-sm font-bold text-white dark:bg-white dark:text-slate-900">{me?.customer ? "My Account" : "Login / Signup"}</Link>
          </div>
        </div>
      )}
    </header>
  );
}