"use client";

import { AlertTriangle, ArrowDown, ArrowUp, Check as CheckIcon, Clapperboard, FolderOpen, Link2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  adminFetch,
  buildDownloadUrl,
  clearAdminSession,
  copyToClipboard,
} from "@/lib/adminAuth";
import dynamic from "next/dynamic";
import HomepageEditor from "@/components/admin/HomepageEditor";
import NavFooterSeoEditor from "@/components/admin/NavFooterSeoEditor";
import { ADMIN_NAV as NAV, sectionIndex } from "@/lib/adminNav";
import { imageRefError } from "@/lib/imageRef";
import { uploadMediaFile } from "@/lib/uploadMedia";
import { adminToast } from "@/lib/adminToast";
import AdminToast from "@/components/admin/AdminToast";
import {
  SectionHeader,
  useCountUp,
  StatCard,
  useApi,
  Empty,
  StatusDot,
  ExportTile,
  stamp,
  inr,
  StatusTable,
  StatusSelect,
  Field,
  Check,
  FilterPill,
} from "@/components/admin/shared";

// The five heaviest sections are code-split so the admin shell (and every
// other section) doesn't ship their editors and modals in one bundle. Each
// loads on first visit to its tab.
const sectionLoading = () => (
  <div className="py-16 text-center text-sm text-[var(--adm-mut)]">Loading…</div>
);
const Products = dynamic(() => import("@/components/admin/sections/ProductsSection"), { ssr: false, loading: sectionLoading });
const Orders = dynamic(() => import("@/components/admin/sections/OrdersSection"), { ssr: false, loading: sectionLoading });
const Services = dynamic(() => import("@/components/admin/sections/ServicesSection"), { ssr: false, loading: sectionLoading });
const Banners = dynamic(() => import("@/components/admin/sections/BannersSection"), { ssr: false, loading: sectionLoading });
const PromoOffers = dynamic(() => import("@/components/admin/sections/OffersSection"), { ssr: false, loading: sectionLoading });

type Section =
  | "overview" | "products" | "categories" | "brands" | "promo" | "orders" | "bookings" | "claims"
  | "customers" | "services" | "banners" | "video_banner" | "logo" | "homepage" | "navfooterseo" | "outlets" | "content"
  | "settings" | "exports" | "help" | "pincodes" | "variants" | "coupons" | "offers";


// Section keys that live inside this single-page dashboard (i.e. not the
// ones with their own real route like pincodes/variants). Used to validate
// the ?section= URL param so a stale or hand-typed value can't crash the
// view switch.
const IN_PAGE_SECTIONS = new Set<string>(
  NAV.flatMap((g) => g.items).filter((it) => !it.href).map((it) => it.key)
);

export default function AdminDashboard({ admin, onError }: { admin: any; onError?: (m: string) => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The active section is kept in the URL (?section=orders) so browser
  // Back/Forward, refresh, and direct/shared links land on the same
  // console screen the admin was looking at, instead of always resetting
  // to Overview.
  const sectionFromUrl = searchParams.get("section");
  const initialSection: Section =
    sectionFromUrl && IN_PAGE_SECTIONS.has(sectionFromUrl) ? (sectionFromUrl as Section) : "overview";

  const [section, setSectionState] = useState<Section>(initialSection);
  const [mobileNav, setMobileNav] = useState(false);
  const [clock, setClock] = useState(() => new Date());

  // Syncs section state when the URL changes from outside setSection below
  // (browser Back/Forward, a direct/shared ?section= link, refresh) —
  // otherwise the console would keep showing whatever section it last
  // rendered even after the URL moved on. Adjusted during render (React's
  // documented pattern for deriving state from a changed input) rather
  // than in an effect, so it applies before paint instead of one render
  // behind.
  const sectionParamKey = sectionFromUrl || "";
  const [syncedSectionParamKey, setSyncedSectionParamKey] = useState(sectionParamKey);
  if (syncedSectionParamKey !== sectionParamKey) {
    setSyncedSectionParamKey(sectionParamKey);
    setSectionState(initialSection);
  }

  // Navigating between admin sections pushes a new history entry (so Back
  // steps through the admin's own navigation, matching browser
  // expectations).
  const setSection = useCallback(
    (next: Section) => {
      setSectionState(next);
      const params = new URLSearchParams(searchParams.toString());
      if (next === "overview") params.delete("section");
      else params.set("section", next);
      const qs = params.toString();
      setSyncedSectionParamKey(next === "overview" ? "" : next);
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  function logout() {
    adminFetch("/api/admin/logout", { method: "POST" }).catch(() => {});
    clearAdminSession();
    window.location.replace("/admin/login");
  }

  const flatNav = NAV.flatMap((g) => g.items);
  const current = flatNav.find((n) => n.key === section)!;

  return (
    <div className="admin-scope min-h-screen">
      <AdminToast />
      <div className="flex min-h-screen">
        <aside className="adm-sidebar sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col lg:flex">
          <div className="flex items-center gap-3 border-b border-white/10 px-6 py-5">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-[var(--adm-paper)] font-mono-adm text-xs font-bold text-[var(--adm-ink)]">SMS</div>
            <div className="leading-tight">
              <p className="font-display-adm text-[15px]">Smart Mobile</p>
              <p className="adm-eyebrow !text-white/40">Admin Console</p>
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-5">
            {NAV.map((g) => (
              <div key={g.group} className="mb-5">
                <p className="adm-eyebrow !text-white/35 px-3 pb-2">{g.group}</p>
                <ul className="space-y-0.5">
                  {g.items.map((it) => (
                    <li key={it.key}>
                      {it.href ? (
                        <Link href={it.href} className="adm-nav-item flex w-full items-center gap-3 rounded-r-md py-2 pl-3 pr-3 text-left text-[13px]">
                          <span className="font-mono-adm text-[10px] text-white/30">{it.index}</span>
                          <span className="flex-1">{it.label}</span>
                        </Link>
                      ) : (
                        <button
                          data-active={section === it.key}
                          onClick={() => setSection(it.key as Section)}
                          className="adm-nav-item flex w-full items-center gap-3 rounded-r-md py-2 pl-3 pr-3 text-left text-[13px]"
                        >
                          <span className="font-mono-adm text-[10px] text-white/30">{it.index}</span>
                          <span className="flex-1">{it.label}</span>
                          {section === it.key && <span className="h-1.5 w-1.5 rounded-full bg-[var(--adm-pine-2)]" />}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
          <div className="border-t border-white/10 p-4">
            <Link href="/" className="mb-2 flex items-center gap-2 rounded-md px-3 py-2 text-[12px] text-white/60 transition hover:bg-white/5 hover:text-white">
              View storefront
            </Link>
            <div className="flex items-center gap-3 rounded-md bg-white/5 px-3 py-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-[var(--adm-pine)] font-mono-adm text-[11px] font-bold text-white">
                {(admin?.name || admin?.email || "A").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-[12px] font-semibold text-white">{admin?.name || admin?.email || "Admin"}</p>
                <p className="adm-eyebrow !text-white/40">{admin?.role || "admin"}</p>
              </div>
              <button onClick={logout} title="Sign out" className="text-white/50 transition hover:text-white text-xs">
                Log Out
              </button>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-[var(--adm-line)] bg-[var(--adm-paper)]/85 px-4 py-3 backdrop-blur sm:px-8">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={() => setMobileNav(true)} className="adm-btn !p-2 lg:hidden" aria-label="Menu">
                Menu
              </button>
              <div className="min-w-0">
                <p className="adm-eyebrow">Console / {current?.index}</p>
                <p className="font-display-adm truncate text-[17px] leading-tight">{current?.label}</p>
              </div>
            </div>
            <div className="hidden items-center gap-4 sm:flex">
              <div className="hidden items-center gap-2 rounded-md border border-[var(--adm-line)] bg-[#fffdf7] px-3 py-1.5 md:flex">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--adm-pine)]" />
                <span className="font-mono-adm text-[11px] text-[var(--adm-muted)]">
                  {clock.toLocaleTimeString("en-IN", { hour12: false })} IST
                </span>
              </div>
              <button onClick={logout} className="adm-btn !py-1.5 !text-[12px]">Sign out</button>
            </div>
          </header>

          <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-8 sm:py-8">
            {section === "overview"  && <Overview onGo={setSection} onError={onError} />}
            {section === "products"  && <Products />}
            {section === "categories" && <Categories />}
            {section === "brands"    && <Brands />}
            {section === "promo"     && <PromoCards />}
            {section === "orders"    && <Orders />}
            {section === "bookings"  && <Bookings />}
            {section === "claims"    && <Claims />}
            {section === "customers" && <Customers />}
            {section === "services"  && <Services />}
            {section === "banners"   && <Banners />}
            {section === "video_banner" && <VideoBannerAdmin />}
            {section === "logo"      && <LogoAdmin />}
            {section === "coupons"   && <Coupons />}
            {section === "offers"    && <PromoOffers />}
            {section === "homepage"  && <HomepageEditor />}
            {section === "navfooterseo" && <NavFooterSeoEditor />}
            {section === "outlets"   && <Outlets />}
            {section === "content"   && <Content />}
            {section === "exports"   && <Exports />}
            {section === "settings"  && <Settings />}
            {section === "help"      && <Help />}
          </main>

          <footer className="border-t border-[var(--adm-line)] px-4 py-4 sm:px-8">
            <div className="flex flex-wrap items-center justify-between gap-2 font-mono-adm text-[10px] uppercase tracking-wider text-[var(--adm-muted)]">
              <span>Smart Mobile Stores - Console v3</span>
              <span>GSTIN 29ARHPP2476R1ZR - PAN ARHPP2476R</span>
            </div>
          </footer>
        </div>
      </div>

      {mobileNav && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setMobileNav(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="adm-sidebar absolute left-0 top-0 h-full w-[260px] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <p className="font-display-adm text-[15px] text-white">Navigate</p>
              <button onClick={() => setMobileNav(false)} className="text-white/60 text-xs">Close</button>
            </div>
            <div className="px-3 py-4">
              {NAV.map((g) => (
                <div key={g.group} className="mb-4">
                  <p className="adm-eyebrow !text-white/35 px-3 pb-1">{g.group}</p>
                  {g.items.map((it) => (
                    it.href ? (
                      <Link
                        key={it.key}
                        href={it.href}
                        onClick={() => setMobileNav(false)}
                        className="adm-nav-item flex w-full items-center gap-3 rounded-r-md py-2 pl-3 pr-3 text-left text-[13px] text-white/80"
                      >
                        <span className="font-mono-adm text-[10px] text-white/30">{it.index}</span>
                        <span className="flex-1">{it.label}</span>
                      </Link>
                    ) : (
                      <button
                        key={it.key}
                        data-active={section === it.key}
                        onClick={() => { setSection(it.key as Section); setMobileNav(false); }}
                        className="adm-nav-item flex w-full items-center gap-3 rounded-r-md py-2 pl-3 pr-3 text-left text-[13px] text-white/80"
                      >
                        <span className="font-mono-adm text-[10px] text-white/30">{it.index}</span>
                        <span>{it.label}</span>
                      </button>
                    )
                  ))}
                </div>
              ))}
              <button onClick={logout} className="mt-2 w-full rounded-md bg-white/10 py-2 text-[13px] font-semibold text-white">Sign out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// NEW: DEDICATED VIDEO BANNER CONTROL PANEL
// -----------------------------------------------------------------------------
function VideoBannerAdmin() {
  const { data, loading, reload } = useApi("/api/settings", { transform: (d) => d.settings });
  const [s, setS] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [videoMode, setVideoMode] = useState<"url" | "upload">("url");
  const [uploadProgress, setUploadProgress] = useState("");

  useEffect(() => {
    // Seeds local editable state from the fetched settings once they
    // arrive — legitimate response to `data` changing, not a value that
    // can be computed inline (the user then edits `s` independently).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (data) setS(data);
  }, [data]);

  async function handleVideoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setUploadProgress("Please select a valid video file (.mp4, .webm, .mov).");
      return;
    }
    const maxSize = 100 * 1024 * 1024; // 100 MB
    if (file.size > maxSize) {
      setUploadProgress("File too large. Maximum size is 100 MB.");
      return;
    }
    setUploadProgress("Uploading video...");
    try {
      const url = await uploadMediaFile(file);
      setS((prev: any) => ({ ...prev, promoVideoUrl: url }));
      setUploadProgress(`Ready: "${file.name}" loaded (${(file.size / 1024 / 1024).toFixed(1)} MB). Save to apply.`);
    } catch (err) {
      setUploadProgress(err instanceof Error ? err.message : "Failed to read file. Try again.");
    }
    e.target.value = "";
  }

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg("");
    const r = await adminFetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });
    setBusy(false);
    if (r.ok) { setMsg("Video Banner saved!"); reload(); }
    else setMsg("Failed to save.");
  }

  if (loading || !s) return <p className="font-mono-adm text-[12px] text-[var(--adm-muted)]">Loading...</p>;

  const hasVideo = !!s.promoVideoUrl;

  return (
    <div>
      <SectionHeader index={sectionIndex("video_banner")} kicker="Storefront" title="Motion Video Banner." />
      <form onSubmit={save} className="adm-card space-y-5 p-6 max-w-2xl">
        <div>
          <p className="font-display-adm text-[18px]">B-Roll Video Settings</p>
          <p className="text-[13px] text-[var(--adm-muted)] mt-1">
            This controls the split-screen animated video banner on the homepage. Leave the video blank to hide it entirely.
          </p>
        </div>

        {/* Video preview */}
        {hasVideo && (
          <div className="rounded-lg overflow-hidden border border-[var(--adm-line)] bg-black aspect-video w-full max-w-md">
            <video
              key={s.promoVideoUrl?.slice(0, 60)}
              src={s.promoVideoUrl}
              className="w-full h-full object-cover"
              autoPlay
              muted
              loop
              playsInline
            />
          </div>
        )}

        {/* Mode toggle */}
        <div>
          <p className="adm-eyebrow mb-2">Promo Video Source</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setVideoMode("url")}
              className={`rounded-md border px-4 py-2 text-[12px] font-semibold transition ${videoMode === "url" ? "border-[var(--adm-ink)] bg-[var(--adm-ink)] text-[var(--adm-paper)]" : "border-[var(--adm-line-strong)] bg-[#fffdf7] text-[var(--adm-muted)] hover:border-[var(--adm-ink)]"}`}
            >
              <Link2 aria-hidden className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />Paste URL
            </button>
            <button
              type="button"
              onClick={() => setVideoMode("upload")}
              className={`rounded-md border px-4 py-2 text-[12px] font-semibold transition ${videoMode === "upload" ? "border-[var(--adm-ink)] bg-[var(--adm-ink)] text-[var(--adm-paper)]" : "border-[var(--adm-line-strong)] bg-[#fffdf7] text-[var(--adm-muted)] hover:border-[var(--adm-ink)]"}`}
            >
              <FolderOpen aria-hidden className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />Browse from Device
            </button>
          </div>
        </div>

        {videoMode === "url" ? (
          <Field label="Promo Video URL (Direct .mp4 / .webm link)">
            <input
              value={s.promoVideoUrl?.startsWith("data:") ? "" : (s.promoVideoUrl || "")}
              onChange={(e) => setS({ ...s, promoVideoUrl: e.target.value })}
              className="adm-input font-mono-adm !text-[12px]"
              placeholder="https://storage.googleapis.com/.../promo.mp4"
            />
          </Field>
        ) : (
          <div className="space-y-2">
            <p className="adm-eyebrow">Upload Video from Device</p>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[var(--adm-line-strong)] bg-[#fffdf7] p-8 transition hover:border-[var(--adm-ink)] hover:bg-[var(--adm-paper-2)]/40">
              <Clapperboard aria-hidden className="h-8 w-8 text-[var(--adm-muted)]" />
              <div className="text-center">
                <p className="font-semibold text-[13px] text-[var(--adm-ink)]">Click to choose a video file</p>
                <p className="text-[11px] text-[var(--adm-muted)] mt-1">MP4, WebM, MOV · Max 100 MB recommended</p>
              </div>
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime,video/*"
                className="hidden"
                onChange={handleVideoUpload}
              />
            </label>
            {uploadProgress && (
              <p className={`font-mono-adm text-[11px] ${uploadProgress.startsWith("Ready:") ? "text-[var(--adm-pine)]" : uploadProgress.includes("Failed") || uploadProgress.includes("large") || uploadProgress.includes("valid") ? "text-[var(--adm-rose)]" : "text-[var(--adm-muted)]"}`}>
                {uploadProgress}
              </p>
            )}
            {hasVideo && s.promoVideoUrl?.startsWith("data:") && (
              <button
                type="button"
                onClick={() => { setS({ ...s, promoVideoUrl: "" }); setUploadProgress(""); }}
                className="adm-btn !py-1 !text-[11px] !text-[var(--adm-rose)]"
              >
                Remove Video
              </button>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Main Heading">
            <input
              value={s.promoVideoHeading || ""}
              onChange={(e) => setS({ ...s, promoVideoHeading: e.target.value })}
              className="adm-input"
              placeholder="The Future of Tech."
            />
          </Field>
          <Field label="Subtext Paragraph">
            <input
              value={s.promoVideoSubtext || ""}
              onChange={(e) => setS({ ...s, promoVideoSubtext: e.target.value })}
              className="adm-input"
              placeholder="Experience ultra-fast speeds..."
            />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--adm-line)]">
          {msg && <span className={`adm-pill ${msg.includes("saved") ? "adm-pill--good" : "adm-pill--bad"}`}>{msg}</span>}
          <button type="submit" disabled={busy} className="adm-btn adm-btn--primary">
            {busy ? "Saving..." : "Save Banner Configuration"}
          </button>
        </div>
      </form>
    </div>
  );
}

// -----------------------------------------------------------------------------
// DEDICATED BRAND LOGO CONTROL PANEL (split out of Settings)
// -----------------------------------------------------------------------------
function LogoAdmin() {
  const { data, loading, reload } = useApi("/api/settings", { transform: (d) => d.settings });
  const [s, setS] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Seeds local editable state from the fetched settings once they
    // arrive — legitimate response to `data` changing, not a value that
    // can be computed inline (the user then edits `s` independently).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (data) setS(data);
  }, [data]);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg("");
    const r = await adminFetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });
    setBusy(false);
    if (r.ok) { setMsg("Logo saved."); reload(); }
    else setMsg("Failed to save.");
  }

  if (loading || !s) return <p className="font-mono-adm text-[12px] text-[var(--adm-muted)]">Loading...</p>;

  return (
    <div>
      <SectionHeader index={sectionIndex("logo")} kicker="Storefront" title="Brand Logo." />
      <form onSubmit={save} className="adm-card space-y-5 p-6 max-w-xl">
        <div>
          <p className="font-display-adm text-[18px]">Store logo</p>
          <p className="text-[13px] text-[var(--adm-muted)] mt-1">
            Shown at the top-left of every page in the header. Leave blank to use the default animated store mark.
          </p>
        </div>

        <div className="flex items-center gap-4">
          {s.logoUrl ? (
            <div className="relative h-20 w-20 shrink-0">
              <img src={s.logoUrl} alt="Logo preview" className="h-20 w-20 rounded-xl object-contain bg-white ring-1 ring-[var(--adm-line)]" />
              <button
                type="button"
                onClick={() => setS({ ...s, logoUrl: "" })}
                className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[var(--adm-rose)] text-white text-[9px] font-bold shadow"
                title="Remove logo"
               aria-label="Close"><X aria-hidden className="h-4 w-4" /></button>
            </div>
          ) : (
            <div className="h-20 w-20 shrink-0 rounded-xl bg-[var(--adm-paper-2)] ring-1 ring-[var(--adm-line)] grid place-items-center text-[9px] font-bold text-[var(--adm-muted)]">No logo</div>
          )}
          <div className="flex-1 space-y-2">
            <input
              value={s.logoUrl?.startsWith("data:") ? "" : (s.logoUrl || "")}
              onChange={(e) => setS({ ...s, logoUrl: e.target.value })}
              className="adm-input font-mono-adm !text-[12px]"
              placeholder="https://.../your-logo.png  (or upload below)"
            />
            <label className="adm-btn adm-btn--pine w-full cursor-pointer justify-center !py-2 !text-[12px] flex items-center gap-2">
              <FolderOpen aria-hidden className="h-3.5 w-3.5" /> Upload Logo from Device
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const url = await uploadMediaFile(file).catch(() => "");
                  if (url) setS((prev: any) => ({ ...prev, logoUrl: url }));
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </div>
        <p className="text-[11px] text-[var(--adm-muted)] -mt-2">Upload PNG or SVG with a transparent background for best results.</p>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--adm-line)]">
          {msg && <span className={`adm-pill ${msg.includes("saved") ? "adm-pill--good" : "adm-pill--bad"}`}>{msg}</span>}
          <button type="submit" disabled={busy} className="adm-btn adm-btn--primary">
            {busy ? "Saving..." : "Save Logo"}
          </button>
        </div>
      </form>
    </div>
  );
}

// -----------------------------------------------------------------------------
// EXISTING COMPONENTS
// -----------------------------------------------------------------------------

function Overview({ onGo, onError }: { onGo: (s: Section) => void; onError?: (m: string) => void }) {
  const { data, loading, error, reload } = useApi("/api/admin/stats", { poll: 10000, transform: (d) => d.stats });

  useEffect(() => { if (error && onError) onError(error); }, [error, onError]);

  // Reconcile lets staff ask the gateway what really happened to payments that
  // never reached a conclusion. Without a trigger the endpoint would only ever
  // run if someone wired up a scheduler, and the failure it catches — the
  // gateway holding a customer's money while the shop thinks the order was
  // abandoned — is completely silent otherwise.
  const [reconciling, setReconciling] = useState(false);
  const [reconcileNote, setReconcileNote] = useState("");

  async function reconcile() {
    setReconciling(true);
    setReconcileNote("");
    try {
      const res = await fetch("/api/payments/reconcile", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setReconcileNote(d.error || "Could not check with the payment provider.");
      } else {
        const r = d.summary || {};
        setReconcileNote(
          r.checked === 0
            ? "Nothing to check — no payments are stuck."
            : `Checked ${r.checked}: ${r.captured} found paid, ${r.failed} failed, ${r.abandoned} abandoned and stock returned, ${r.stillPending} still in progress.`
        );
        reload();
      }
    } catch {
      setReconcileNote("Network error. Please try again.");
    }
    setReconciling(false);
  }

  const s = data || {};
  const trend: { day: string; revenue: number; orders: number }[] = s.salesTrend || [];
  const waitingAlerts = s.stockAlertsPending ?? 0;
  const total = s.totalProducts ?? 0;
  const live = s.liveProducts ?? 0;
  const hidden = s.hiddenProducts ?? 0;
  const units = s.unitsInStock ?? 0;
  const value = s.inventoryValue ?? 0;
  const low = s.lowStockCount ?? 0;
  const out = s.outOfStockCount ?? 0;
  const pending = s.pendingOrders ?? 0;
  const orders = s.totalOrders ?? 0;
  const revenue = s.revenue ?? 0;
  const bookings = s.bookings ?? 0;
  const questionsWaiting = s.pendingQuestions ?? 0;
  const awaitingPayment = s.awaitingPaymentCount ?? 0;

  const stockHealth = total > 0 ? Math.max(0, 100 - ((low + out) / total) * 100) : 0;
  const liveRatio = total > 0 ? (live / total) * 100 : 0;

  return (
    <div>
      <SectionHeader index={sectionIndex("overview")} kicker="Overview" title="The shop, in numbers.">
        <div className="flex items-center gap-2">
          <button onClick={reload} className="adm-btn !py-1.5 !text-[12px]">Refresh Data</button>
          <a href="/admin/catalogue" className="adm-btn !py-1.5 !text-[12px]">Fix My Catalogue</a>
          <button onClick={() => onGo("products")} className="adm-btn adm-btn--primary !py-1.5 !text-[12px]">+ Add Product</button>
        </div>
      </SectionHeader>

      {error && (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-[rgba(185,28,28,0.3)] bg-[rgba(185,28,28,0.06)] p-3 text-[13px] text-[var(--adm-rose)]">
          <span className="font-mono-adm text-[11px] font-bold">ERR</span>
          <div className="flex-1">
            <p>Could not reach the live data feed: {error}</p>
            <p className="mt-1 text-[11px] text-[var(--adm-muted)]">The console will keep retrying every 10 seconds.</p>
          </div>
          <button onClick={reload} className="adm-btn !py-1 !text-[11px]">Retry</button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Total Products" value={total} sub={`${live} live · ${hidden} hidden`} fill={liveRatio} tone="ink" />
        <StatCard label="Units in Stock" value={units} sub={`Inventory value ${inr(value)}`} fill={stockHealth} tone="ink" />
        <StatCard label="Low Stock" value={low} sub="At or below threshold" fill={total ? (low / total) * 100 : 0} fillColor="var(--adm-amber)" tone={low > 0 ? "amber" : "ink"} />
        <StatCard label="Out of Stock" value={out} sub="Needs reorder" fill={total ? (out / total) * 100 : 0} fillColor="var(--adm-rose)" tone={out > 0 ? "rose" : "ink"} />
        <StatCard label="Pending Orders" value={pending} sub={`${orders} total · ${bookings} repair bookings`} fill={orders ? (pending / Math.max(1, orders)) * 100 : 0} tone="pine" />
        <StatCard label="Order Revenue" value={revenue} prefix="₹" sub="Excluding cancelled and unpaid" fill={Math.min(100, revenue / 10000)} tone="pine" />
      </div>

      <SalesTrendChart trend={trend} waitingAlerts={waitingAlerts} />

      {awaitingPayment > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[rgba(185,28,28,0.3)] bg-[rgba(185,28,28,0.06)] p-4">
          <p className="text-[13px]">
            <span className="font-mono-adm font-bold text-[var(--adm-rose)]">{awaitingPayment}</span>{" "}
            order{awaitingPayment === 1 ? "" : "s"} started an online payment that never completed.{" "}
            {awaitingPayment === 1 ? "It is" : "They are"} not counted as revenue and cannot be dispatched, but{" "}
            {awaitingPayment === 1 ? "it is" : "they are"} still holding stock. Cancel{" "}
            {awaitingPayment === 1 ? "it" : "them"} to put that stock back on sale.
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={reconcile} disabled={reconciling} aria-busy={reconciling} className="adm-btn !py-1.5 !text-[12px] disabled:opacity-50">
              {reconciling ? "Checking\u2026" : "Check with payment provider"}
            </button>
            <button onClick={() => onGo("orders")} className="adm-btn !py-1.5 !text-[12px] !text-[var(--adm-rose)]">
              Review orders
            </button>
          </div>
        </div>
      )}

      {reconcileNote && (
        <p role="status" className="mt-2 rounded-lg border border-[var(--adm-line)] bg-[var(--adm-panel)] px-3 py-2 text-[12px] text-[var(--adm-muted)]">
          {reconcileNote}
        </p>
      )}

      {questionsWaiting > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--adm-line-strong)] bg-[#fffdf7] p-4">
          <p className="text-[13px]">
            <span className="font-mono-adm font-bold text-[var(--adm-amber)]">{questionsWaiting}</span>{" "}
            customer question{questionsWaiting === 1 ? "" : "s"} on product pages {questionsWaiting === 1 ? "is" : "are"}{" "}
            waiting for a reply. Nothing shows on the storefront until you publish it.
          </p>
          <Link href="/admin/questions" className="adm-btn adm-btn--pine !py-1.5 !text-[12px]">
            Answer Q&amp;A
          </Link>
        </div>
      )}

      <div className="mt-8">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <p className="adm-eyebrow">02 / Live extracts</p>
            <h2 className="font-display-adm text-[20px]">Excel tracking & exports</h2>
          </div>
          <button onClick={() => onGo("exports")} className="adm-btn !py-1.5 !text-[12px]">Open Export Centre</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ExportTile kind="stock" title="Stock sheet" meta="All products · MRP / MOP / qty" />
          <ExportTile kind="customers" title="Customer records" meta="Names · emails · phones" />
          <ExportTile kind="orders" title="Billing & invoices" meta="Orders · totals · status" />
          <ExportTile kind="all" title="Full report bundle" meta="All three, queued" />
        </div>
      </div>

      <div className="mt-8">
        <div className="mb-3">
          <p className="adm-eyebrow">03 / Watchlist</p>
          <h2 className="font-display-adm text-[20px]">Reorder soon</h2>
        </div>
        {loading && !data ? (
          <div className="adm-card p-6 font-mono-adm text-[12px] text-[var(--adm-muted)]">Calculating...</div>
        ) : !s.lowStock?.length ? (
          <div className="adm-card flex items-center gap-3 p-5 text-[13px]">
            <StatusDot tone="good" />
            <span>Nothing below threshold right now. Shelf is healthy.</span>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--adm-line)] overflow-hidden rounded-[14px] border border-[var(--adm-line)] bg-[#fffdf7]">
            {s.lowStock.map((p: any) => (
              <li key={p.id} className="adm-row flex items-center gap-4 px-5 py-3">
                <span className="font-mono-adm text-[11px] text-[var(--adm-muted)]">#{p.id}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold">{p.name}</p>
                  <p className="font-mono-adm text-[11px] text-[var(--adm-muted)]">{p.brand} · {p.sku}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono-adm text-[13px] font-bold text-[var(--adm-amber)]">{p.stock} left</p>
                  <p className="font-mono-adm text-[10px] text-[var(--adm-muted)]">threshold {p.lowStockThreshold}</p>
                </div>
                <button onClick={() => onGo("products")} className="adm-btn !py-1 !text-[11px]">Restock</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <RestockRequests />
      <CustomerReviews />
    </div>
  );
}

/**
 * 04 / Restock requests — the admin's window into back-in-stock alerts.
 *
 * Customers subscribe on out-of-stock product pages; those rows were only
 * reachable via the API until now. Shown as a list under the Watchlist
 * because the two answer the same question ("what should I reorder?") from
 * opposite directions: Watchlist is what's running low, this is what people
 * are actively asking for. Remove deletes a request — emails go out
 * automatically the moment the product is restocked, so there's nothing
 * else to edit here.
 */
function RestockRequests() {
  const { data, loading, reload } = useApi("/api/stock-alerts");
  const [busyId, setBusyId] = useState<number | null>(null);
  const pending: any[] = data?.pending || [];

  async function remove(id: number) {
    setBusyId(id);
    try {
      const r = await adminFetch(`/api/stock-alerts?id=${id}`, { method: "DELETE" });
      if (r.ok) adminToast("Request removed.");
      else adminToast("Could not remove the request.");
    } finally {
      setBusyId(null);
      reload();
    }
  }

  return (
    <div className="mt-8">
      <div className="mb-3">
        <p className="adm-eyebrow">04 / Restock requests</p>
        <h2 className="font-display-adm text-[20px]">Customers waiting for stock.</h2>
      </div>
      {loading && !data ? (
        <div className="adm-card p-6 font-mono-adm text-[12px] text-[var(--adm-muted)]">Loading...</div>
      ) : !pending.length ? (
        <div className="adm-card flex items-center gap-3 p-5 text-[13px]">
          <StatusDot tone="good" />
          <span>
            No one is waiting right now.
            {data?.notifiedCount ? ` ${data.notifiedCount} restock email${data.notifiedCount === 1 ? "" : "s"} sent so far.` : " Requests appear here when a customer taps \u201CNotify me\u201D on an out-of-stock product."}
          </span>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--adm-line)] overflow-hidden rounded-[14px] border border-[var(--adm-line)] bg-[#fffdf7]">
          {pending.map((a) => (
            <li key={a.id} className="adm-row flex items-center gap-4 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold">{a.productName || `Product #${a.productId}`}</p>
                <p className="truncate font-mono-adm text-[11px] text-[var(--adm-muted)]">
                  {a.email}{a.variantId ? ` · variant #${a.variantId}` : ""}
                </p>
              </div>
              <p className="whitespace-nowrap font-mono-adm text-[10px] text-[var(--adm-muted)]">
                {new Date(a.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              </p>
              <button
                onClick={() => remove(a.id)}
                disabled={busyId === a.id}
                className="adm-btn !py-1 !text-[11px] disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {pending.length > 0 && (
        <p className="mt-2 font-mono-adm text-[11px] text-[var(--adm-muted)]">
          Emails go out automatically when you restock the product — nothing to do here except reorder.
        </p>
      )}
    </div>
  );
}

/**
 * Latest customer reviews across the catalogue, with removal. Reviews go
 * live immediately (only signed-in customers can post, one per product), so
 * moderation here is after-the-fact: the owner skims what shoppers are
 * saying and removes spam or abuse. Photos show as thumbnails — exactly what
 * the shopper attached, at a glance.
 */
function CustomerReviews() {
  const { data, loading, reload } = useApi("/api/reviews");
  const [busyId, setBusyId] = useState<number | null>(null);
  const items: any[] = data?.items || [];

  async function remove(id: number) {
    if (!confirm("Remove this review permanently?")) return;
    setBusyId(id);
    try {
      const r = await adminFetch("/api/reviews", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (r.ok) adminToast("Review removed.");
      else adminToast("Could not remove the review.");
    } finally {
      setBusyId(null);
      reload();
    }
  }

  function photosOf(raw: string): string[] {
    try {
      const v = JSON.parse(raw || "[]");
      return Array.isArray(v) ? v.filter((u) => typeof u === "string" && u.trim()) : [];
    } catch {
      return [];
    }
  }

  return (
    <div className="mt-8">
      <div className="mb-3">
        <p className="adm-eyebrow">05 / Customer reviews</p>
        <h2 className="font-display-adm text-[20px]">What shoppers are saying.</h2>
      </div>
      {loading && !data ? (
        <div className="adm-card p-6 font-mono-adm text-[12px] text-[var(--adm-muted)]">Loading...</div>
      ) : !items.length ? (
        <div className="adm-card flex items-center gap-3 p-5 text-[13px]">
          <StatusDot tone="good" />
          <span>No reviews yet. They appear here as soon as a signed-in customer posts one on a product page.</span>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--adm-line)] overflow-hidden rounded-[14px] border border-[var(--adm-line)] bg-[#fffdf7]">
          {items.slice(0, 12).map((r) => {
            const photos = photosOf(r.images);
            return (
              <li key={r.id} className="adm-row px-5 py-3">
                <div className="flex items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold">
                      {"\u2605".repeat(r.rating)}{"\u2606".repeat(Math.max(0, 5 - r.rating))}
                      <span className="ml-2">{r.productName || `Product #${r.productId}`}</span>
                    </p>
                    <p className="truncate font-mono-adm text-[11px] text-[var(--adm-muted)]">
                      {r.customerName || "Customer"}{r.verifiedPurchase ? " \u00b7 verified purchase" : ""}{r.helpfulCount ? ` \u00b7 ${r.helpfulCount} found helpful` : ""}
                    </p>
                    {(r.title || r.body) && (
                      <p className="mt-1 line-clamp-2 text-[12px] text-[var(--adm-muted)]">
                        {r.title ? `${r.title} \u2014 ` : ""}{r.body}
                      </p>
                    )}
                    {photos.length > 0 && (
                      <div className="mt-2 flex gap-1.5">
                        {photos.slice(0, 4).map((u, i) => (
                          /* Plain img: tiny thumbnails, often data URLs — the optimizer adds nothing here. */
                          <img key={i} src={u} alt={`Review photo ${i + 1}`} className="h-10 w-10 rounded-md border border-[var(--adm-line)] object-cover" />
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="whitespace-nowrap font-mono-adm text-[10px] text-[var(--adm-muted)]">
                    {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </p>
                  <button
                    onClick={() => remove(r.id)}
                    disabled={busyId === r.id}
                    className="adm-btn !py-1 !text-[11px] disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {items.length > 0 && (
        <p className="mt-2 font-mono-adm text-[11px] text-[var(--adm-muted)]">
          Showing the latest {Math.min(items.length, 12)} of {data?.total ?? items.length}. Removing a review also clears its helpful votes.
        </p>
      )}
    </div>
  );
}

/**
 * Last-30-days sales, as bars. Pure SVG — no chart library for one chart.
 * Revenue rules match the stat card exactly (the API computes both from the
 * same filter), so the chart never "disagrees" with the headline number.
 */
function SalesTrendChart({ trend, waitingAlerts }: { trend: { day: string; revenue: number; orders: number }[]; waitingAlerts: number }) {
  if (!trend.length) return null;
  const W = 660;
  const H = 150;
  const PAD = 4;
  const maxRev = Math.max(...trend.map((d) => d.revenue), 1);
  const bw = (W - PAD * 2) / trend.length;
  const total30 = trend.reduce((s, d) => s + d.revenue, 0);
  const orders30 = trend.reduce((s, d) => s + d.orders, 0);
  const last7 = trend.slice(-7).reduce((s, d) => s + d.revenue, 0);
  const prev7 = trend.slice(-14, -7).reduce((s, d) => s + d.revenue, 0);
  const weekLabel =
    prev7 > 0
      ? `${last7 >= prev7 ? "+" : "−"}${Math.abs(Math.round(((last7 - prev7) / prev7) * 100))}% vs previous week`
      : last7 > 0
        ? "first sales this week"
        : "no sales in two weeks";
  const fmtDay = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  };

  return (
    <div className="adm-card mt-4 p-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="adm-eyebrow">Sales · last 30 days</p>
          <p className="font-display-adm text-[20px]">
            {inr(total30)} <span className="font-mono-adm text-[12px] text-[var(--adm-muted)]">across {orders30} order{orders30 === 1 ? "" : "s"}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono-adm text-[11px] text-[var(--adm-muted)]">{weekLabel}</p>
          {waitingAlerts > 0 && (
            <p className="font-mono-adm text-[11px] text-[var(--adm-amber)]">
              {waitingAlerts} customer{waitingAlerts === 1 ? "" : "s"} waiting on restock emails
            </p>
          )}
        </div>
      </div>
      {total30 === 0 ? (
        <p className="font-mono-adm text-[12px] text-[var(--adm-muted)]">No sales in the last 30 days yet. The chart fills in as orders come in.</p>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`Daily sales for the last 30 days, totalling ${inr(total30)}`}>
            {trend.map((d, i) => {
              const h = d.revenue > 0 ? Math.max(3, (d.revenue / maxRev) * (H - 24)) : 1.5;
              return (
                <rect
                  key={d.day}
                  x={PAD + i * bw + bw * 0.15}
                  y={H - 18 - h}
                  width={bw * 0.7}
                  height={h}
                  rx={2}
                  fill={d.revenue > 0 ? "var(--adm-pine, #2f6f4f)" : "var(--adm-line, #e5e0d5)"}
                >
                  <title>{`${fmtDay(d.day)} — ${inr(d.revenue)} · ${d.orders} order${d.orders === 1 ? "" : "s"}`}</title>
                </rect>
              );
            })}
            <text x={PAD} y={H - 4} className="font-mono-adm" fontSize="10" fill="var(--adm-muted, #8a8577)">{fmtDay(trend[0].day)}</text>
            <text x={W - PAD} y={H - 4} textAnchor="end" className="font-mono-adm" fontSize="10" fill="var(--adm-muted, #8a8577)">{fmtDay(trend[trend.length - 1].day)}</text>
          </svg>
          <p className="mt-1 font-mono-adm text-[10px] text-[var(--adm-muted)]">Hover a bar for the day’s exact takings. Cancelled and unpaid orders are not counted.</p>
        </>
      )}
    </div>
  );
}

function Bookings() {
  return (
    <div>
      <SectionHeader index={sectionIndex("bookings")} kicker="Service bay" title="Repair bookings.">
        <span className="adm-pill"><StatusDot tone="good" /> auto-refresh</span>
      </SectionHeader>
      <StatusTable<any>
        apiPath="/api/bookings"
        statuses={["Booked", "In Progress", "Ready", "Delivered", "Cancelled"]}
        empty="No repair bookings yet. New requests from the storefront appear here."
        render={(b: any, update: any) => (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono-adm text-[13px] font-bold">#{b.bookingNo} · <span className="text-[var(--adm-ink)]">{b.serviceName}</span></p>
              <p className="mt-1 text-[13px]">{b.customerName} · <span className="font-mono-adm text-[12px] text-[var(--adm-muted)]">{b.customerPhone}</span></p>
              <p className="mt-1 text-[12px] text-[var(--adm-muted)]"><b>Device:</b> {b.device || "—"} | <b>Issue:</b> {b.issue}</p>
            </div>
            <StatusSelect value={b.status} onChange={update} options={["Booked", "In Progress", "Ready", "Delivered", "Cancelled"]} />
          </div>
        )}
      />
    </div>
  );
}

function Claims() {
  return (
    <div>
      <SectionHeader index={sectionIndex("claims")} kicker="Warranty" title="Claims.">
        <span className="adm-pill"><StatusDot tone="good" /> auto-refresh</span>
      </SectionHeader>
      <StatusTable<any>
        apiPath="/api/claims"
        statuses={["Pending", "Approved", "Rejected", "Resolved"]}
        empty="No warranty claims right now."
        render={(c: any, update: any) => (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono-adm text-[13px] font-bold">#{c.claimNo} · {c.productName}</p>
              <p className="mt-1 text-[13px]">{c.customerName} · <span className="font-mono-adm text-[12px] text-[var(--adm-muted)]">{c.customerPhone}</span></p>
              <p className="mt-2 rounded-md bg-[var(--adm-paper-2)]/60 p-2 text-[12px] text-[var(--adm-muted)]">{c.reason}</p>
            </div>
            <StatusSelect value={c.status} onChange={update} options={["Pending", "Approved", "Rejected", "Resolved"]} />
          </div>
        )}
      />
    </div>
  );
}

function Customers() {
  const { data, loading } = useApi("/api/customers", { transform: (d) => d.items as any[] });
  const rows = data || [];

  return (
    <div>
      <SectionHeader index={sectionIndex("customers")} kicker="People" title="Customer records.">
        <a href={buildDownloadUrl("/api/customers", `sms-customers-${stamp()}.csv`)} download className="adm-btn !py-1.5 !text-[12px]">Export CSV</a>
      </SectionHeader>

      <div className="overflow-x-auto rounded-[14px] border border-[var(--adm-line)] bg-[#fffdf7]">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-[var(--adm-line)] bg-[var(--adm-paper-2)]/60 text-[10px] uppercase tracking-[0.18em] text-[var(--adm-muted)]">
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="py-3 font-semibold">Email</th>
              <th className="py-3 font-semibold">Phone</th>
              <th className="py-3 text-right font-semibold">Orders</th>
              <th className="px-4 py-3 text-right font-semibold">Joined</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data && <tr><td colSpan={5} className="px-4 py-10 text-center font-mono-adm text-[12px] text-[var(--adm-muted)]">Loading...</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-[13px] text-[var(--adm-muted)]">No registered customers yet.</td></tr>}
            {rows.map((c: any) => (
              <tr key={c.id} className="adm-row border-b border-[var(--adm-line)] last:border-0">
                <td className="px-4 py-3 font-semibold">{c.name}</td>
                <td className="font-mono-adm text-[12px] text-[var(--adm-muted)]">{c.email}</td>
                <td className="font-mono-adm text-[12px] text-[var(--adm-muted)]">{c.phone || "—"}</td>
                <td className="text-right"><span className="adm-pill">{c.orderCount} orders</span></td>
                <td className="px-4 py-3 text-right font-mono-adm text-[11px] text-[var(--adm-muted)]">{new Date(c.createdAt).toLocaleDateString("en-IN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Categories() {
  const { data, loading, reload } = useApi("/api/categories", { transform: (d) => d.items as any[] });
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const rows = data || [];

  return (
    <div>
      <SectionHeader index={sectionIndex("categories")} kicker="Storefront" title="Categories.">
        <button onClick={() => { setEditing(null); setShow(true); }} className="adm-btn adm-btn--primary !py-1.5 !text-[12px]">+ Add Category</button>
      </SectionHeader>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {loading && !data && <p className="font-mono-adm text-[12px] text-[var(--adm-muted)]">Loading...</p>}
        {rows.map((c: any) => (
          <div key={c.id} className="adm-card overflow-hidden flex flex-col">
            <div className="aspect-[4/3] bg-[var(--adm-paper-2)] p-4 flex items-center justify-center">
              {c.image ? <img src={c.image} alt="" className="h-full w-full object-contain drop-shadow-sm" /> : <div className="font-mono-adm text-[10px] text-[var(--adm-muted)]">NO IMAGE</div>}
            </div>
            <div className="flex flex-col flex-1 gap-2 p-4 border-t border-[var(--adm-line)]">
              <div className="min-w-0">
                <p className="truncate font-display-adm text-[15px]">{c.name}</p>
                <p className="clamp-2 mt-1 text-[11px] text-[var(--adm-muted)]">{c.description || "No description."}</p>
              </div>
              <div className="mt-auto flex gap-2 justify-end pt-2">
                <button onClick={() => { setEditing(c); setShow(true); }} className="adm-btn !py-1 !text-[11px]">Edit</button>
                <button onClick={async () => { if (confirm("Delete category?")) { await adminFetch(`/api/categories/${c.id}`, { method: "DELETE" }); reload(); } }} className="adm-btn !py-1 !text-[11px] !text-[var(--adm-rose)]">Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {show && <CategoryEditor initial={editing} onClose={() => { setShow(false); setEditing(null); }} onSaved={reload} />}
    </div>
  );
}

function CategoryEditor({ initial, onClose, onSaved }: { initial: any; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: initial?.name || "", slug: initial?.slug || "", description: initial?.description || "", image: initial?.image || "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const url = await uploadMediaFile(file).catch(() => "");
    if (url) setF({ ...f, image: url });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    // Was type="url" on the icon field, which rejects the /images/... paths the
    // uploader writes - see src/lib/imageRef.ts.
    const refError = imageRefError(f.image, "Category icon URL");
    if (refError) { setErr(refError); return; }
    setBusy(true); setErr("");
    const url = initial ? `/api/categories/${initial.id}` : "/api/categories";
    const r = await adminFetch(url, { method: initial ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    setBusy(false);
    if (r.ok) { adminToast(`Category ${initial ? "saved" : "added"} — now live on the site.`); onSaved(); onClose(); return; }
    const data = await r.json().catch(() => ({}));
    setErr(data?.error || `Could not save the category (${r.status}). Please try again.`);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-4 rounded-[14px] bg-[var(--adm-paper)] p-6 shadow-2xl">
        <h3 className="font-display-adm text-[20px]">{initial ? "Edit Category" : "New Category"}</h3>
        <Field label="Name *"><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="adm-input" /></Field>
        <Field label="Description"><textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={2} className="adm-input" /></Field>
        
        {f.image && <div className="h-20 w-20 mx-auto overflow-hidden rounded-full border border-[var(--adm-line)] bg-white p-2 shadow-sm"><img src={f.image} alt="" className="h-full w-full object-contain" /></div>}
        
        <Field label="Category Icon URL">
          <input 
            type="text"
            inputMode="url"
            value={f.image.startsWith("data:") ? "" : f.image} 
            onChange={(e) => setF({ ...f, image: e.target.value })} 
            placeholder="https://example.com/icon.png" 
            className="adm-input font-mono-adm !text-[11px]" 
          />
        </Field>
        <Field label="Or Upload Icon">
          <input type="file" accept="image/*" onChange={onUpload} className="adm-input !py-1.5" />
        </Field>

        {err && (
          <p role="alert" className="rounded-md border border-[rgba(185,28,28,0.3)] bg-[rgba(185,28,28,0.07)] px-3 py-2 text-[12px] font-semibold leading-relaxed text-[var(--adm-rose)]">
            {err}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t border-[var(--adm-line)]">
          <button type="button" onClick={onClose} className="adm-btn">Cancel</button>
          <button type="submit" disabled={busy} className="adm-btn adm-btn--primary">{busy ? "Saving..." : "Save Category"}</button>
        </div>
      </form>
    </div>
  );
}

function Brands() {
  const { data, loading, reload } = useApi("/api/brands");
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const rows = data || [];

  return (
    <div>
      <SectionHeader index={sectionIndex("brands")} kicker="Storefront" title="Shop by Brand.">
        <button onClick={() => { setEditing(null); setShow(true); }} className="adm-btn adm-btn--primary !py-1.5 !text-[12px]">+ Add Brand</button>
      </SectionHeader>

      {/* Until a brand exists this tab was a heading, an Add button and
          nothing else — indistinguishable from a screen that failed to
          load. The shared Empty card says which state we are in and what
          the storefront does while the list is empty. */}
      {!loading && rows.length === 0 && (
        <Empty
          label="No brands added yet."
          hint="Until you add one, the storefront's “Shop by Brand” row falls back to a default list of popular brands — which may include brands you do not stock. Add your own to replace it."
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {loading && !data && <p className="font-mono-adm text-[12px] text-[var(--adm-muted)]">Loading...</p>}
        {rows.map((b: any) => (
          <div key={b.id} className="adm-card overflow-hidden flex flex-col">
            <div className="h-24 p-4 flex items-center justify-center border-b border-[var(--adm-line)] relative" style={{ backgroundColor: b.bgColor || "#f8fafc" }}>
              {b.logoUrl ? (
                <img src={b.logoUrl} alt="" className="h-full w-full object-contain mix-blend-multiply drop-shadow-sm" />
              ) : (
                <div className="font-display-adm text-[16px] font-bold text-[var(--adm-ink)]">{b.name}</div>
              )}
            </div>
            <div className="flex flex-col flex-1 gap-2 p-4">
              <div className="min-w-0">
                <p className="truncate font-display-adm text-[15px]">{b.name}</p>
                <p className="mt-1 font-mono-adm text-[10px] text-[var(--adm-muted)]">
                  {b.active ? "Active" : "Hidden"} · Sort Order: {b.sortOrder}
                </p>
              </div>
              <div className="mt-auto flex gap-2 justify-end pt-2">
                <button onClick={() => { setEditing(b); setShow(true); }} className="adm-btn !py-1 !text-[11px]">Edit</button>
                <button onClick={async () => { if (confirm("Delete brand?")) { await adminFetch(`/api/brands/${b.id}`, { method: "DELETE" }); reload(); } }} className="adm-btn !py-1 !text-[11px] !text-[var(--adm-rose)]">Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {show && <BrandEditor initial={editing} onClose={() => { setShow(false); setEditing(null); }} onSaved={reload} />}
    </div>
  );
}

function BrandEditor({ initial, onClose, onSaved }: { initial: any; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ 
    name: initial?.name || "", 
    bgColor: initial?.bgColor || "#ffffff", 
    label: initial?.label || "", 
    logoUrl: initial?.logoUrl || "", 
    active: initial?.active ?? true,
    sortOrder: initial?.sortOrder || 0 
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const url = await uploadMediaFile(file).catch(() => "");
    if (url) setF({ ...f, logoUrl: url });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    // Was type="url" on the logo field - see src/lib/imageRef.ts.
    const refError = imageRefError(f.logoUrl, "Logo image URL");
    if (refError) { setErr(refError); return; }
    setBusy(true); setErr("");
    const url = initial ? `/api/brands/${initial.id}` : "/api/brands";
    const r = await adminFetch(url, { method: initial ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    setBusy(false);
    if (r.ok) { adminToast(`Brand ${initial ? "saved" : "added"} — now live on the site.`); onSaved(); onClose(); return; }
    const data = await r.json().catch(() => ({}));
    setErr(data?.error || `Could not save the brand (${r.status}). Please try again.`);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-4 rounded-[14px] bg-[var(--adm-paper)] p-6 shadow-2xl">
        <h3 className="font-display-adm text-[20px]">{initial ? "Edit Brand" : "New Brand"}</h3>
        <Field label="Brand Name *"><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="adm-input" /></Field>
        
        <div className="grid grid-cols-2 gap-3">
          <Field label="Background Hex Color">
            <input type="color" value={f.bgColor} onChange={(e) => setF({ ...f, bgColor: e.target.value })} className="h-9 w-full rounded border border-[var(--adm-line)] cursor-pointer" />
          </Field>
          <Field label="Sort Order">
            <input type="number" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: Number(e.target.value) })} className="adm-input" />
          </Field>
        </div>

        {f.logoUrl && (
          <div className="h-20 w-32 mx-auto overflow-hidden rounded border border-[var(--adm-line)] p-2 shadow-sm relative" style={{ backgroundColor: f.bgColor }}>
            <img src={f.logoUrl} alt="" className="h-full w-full object-contain mix-blend-multiply" />
          </div>
        )}
        
        <Field label="Logo Image URL">
          <input type="text" inputMode="url" value={f.logoUrl.startsWith("data:") ? "" : f.logoUrl} onChange={(e) => setF({ ...f, logoUrl: e.target.value })} placeholder="https://example.com/logo.png" className="adm-input font-mono-adm !text-[11px]" />
        </Field>
        <Field label="Or Upload Logo">
          <input type="file" accept="image/*" onChange={onUpload} className="adm-input !py-1.5" />
        </Field>
        
        <Check label="Show on Storefront" checked={f.active} onChange={(v) => setF({ ...f, active: v })} />

        {err && (
          <p role="alert" className="rounded-md border border-[rgba(185,28,28,0.3)] bg-[rgba(185,28,28,0.07)] px-3 py-2 text-[12px] font-semibold leading-relaxed text-[var(--adm-rose)]">
            {err}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t border-[var(--adm-line)]">
          <button type="button" onClick={onClose} className="adm-btn">Cancel</button>
          <button type="submit" disabled={busy} className="adm-btn adm-btn--primary">{busy ? "Saving..." : "Save Brand"}</button>
        </div>
      </form>
    </div>
  );
}

function PromoCards() {
  const { data, loading, reload } = useApi("/api/promo-cards");
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const rows = data || [];

  return (
    <div>
      <SectionHeader index={sectionIndex("promo")} kicker="Storefront" title="Services Banner.">
        <button onClick={() => { setEditing(null); setShow(true); }} className="adm-btn adm-btn--primary !py-1.5 !text-[12px]">+ Add Promo Card</button>
      </SectionHeader>

      {/* Same problem as the Brands tab: with no rows this screen was a
          title and a button over blank paper, which reads as a failure
          rather than as "nothing added yet". */}
      {!loading && rows.length === 0 && (
        <Empty
          label="No promo cards yet."
          hint="These are the three short promise cards on the homepage. Until you add your own, the storefront shows a built-in default set — add a card to take control of that copy."
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {loading && !data && <p className="font-mono-adm text-[12px] text-[var(--adm-muted)]">Loading...</p>}
        {rows.map((c: any) => (
          <div key={c.id} className="adm-card overflow-hidden flex flex-col p-4">
            <div className="flex items-center gap-3">
              <div className="min-w-0">
                <p className={`font-mono-adm text-[11px] font-bold uppercase tracking-wider ${c.themeColor?.replace('text-', 'text-') || "text-amber-400"}`} style={{ color: `var(--adm-${c.themeColor?.replace('text-', '')})` }}>
                  {c.title}
                </p>
                <p className="truncate font-display-adm text-[15px]">{c.subtitle || "No subtitle"}</p>
              </div>
            </div>
            <p className="mt-3 text-[12px] text-[var(--adm-muted)]">{c.description || "No description provided."}</p>
            <div className="mt-4 flex gap-2 justify-end pt-3 border-t border-[var(--adm-line)]">
              <button onClick={() => { setEditing(c); setShow(true); }} className="adm-btn !py-1 !text-[11px]">Edit</button>
              <button onClick={async () => { if (confirm("Delete promo card?")) { await adminFetch(`/api/promo-cards/${c.id}`, { method: "DELETE" }); reload(); } }} className="adm-btn !py-1 !text-[11px] !text-[var(--adm-rose)]">Delete</button>
            </div>
          </div>
        ))}
      </div>

      {show && <PromoEditor initial={editing} onClose={() => { setShow(false); setEditing(null); }} onSaved={reload} />}
    </div>
  );
}

function PromoEditor({ initial, onClose, onSaved }: { initial: any; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ 
    title: initial?.title || "", 
    subtitle: initial?.subtitle || "", 
    description: initial?.description || "", 
    icon: initial?.icon || "",
    themeColor: initial?.themeColor || "text-blue-400", 
    active: initial?.active ?? true,
    sortOrder: initial?.sortOrder || 0 
  });
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    const url = initial ? `/api/promo-cards/${initial.id}` : "/api/promo-cards";
    const r = await adminFetch(url, { method: initial ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    setBusy(false); if (r.ok) { adminToast(`Promo card ${initial ? "saved" : "added"} — now live on the site.`); onSaved(); onClose(); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-4 rounded-[14px] bg-[var(--adm-paper)] p-6 shadow-2xl">
        <h3 className="font-display-adm text-[20px]">{initial ? "Edit Promo Card" : "New Promo Card"}</h3>
        
        <div className="grid grid-cols-[80px_1fr] gap-3">
          <Field label="Icon (Text)">
            <input required value={f.icon} onChange={(e) => setF({ ...f, icon: e.target.value })} className="adm-input text-center text-lg" placeholder="Icon" />
          </Field>
          <Field label="Main Title *">
            <input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="adm-input" placeholder="e.g. Easy EMI & Finance" />
          </Field>
        </div>
        
        <Field label="Subtitle / Providers list">
          <input required value={f.subtitle} onChange={(e) => setF({ ...f, subtitle: e.target.value })} className="adm-input" placeholder="e.g. Bajaj Finserv · DMI Finance" />
        </Field>
        
        <Field label="Description">
          <textarea rows={2} required value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="adm-input" placeholder="Debit & Credit Card EMIs available." />
        </Field>
        
        <div className="grid grid-cols-2 gap-3">
          <Field label="Theme Color">
            <select value={f.themeColor} onChange={(e) => setF({ ...f, themeColor: e.target.value })} className="adm-input font-mono-adm">
              <option value="text-amber-400">Amber</option>
              <option value="text-sky-400">Sky Blue</option>
              <option value="text-emerald-400">Emerald</option>
              <option value="text-purple-400">Purple</option>
              <option value="text-pink-400">Pink</option>
            </select>
          </Field>
          <Field label="Sort Order">
            <input type="number" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: Number(e.target.value) })} className="adm-input" />
          </Field>
        </div>

        <Check label="Show on Storefront" checked={f.active} onChange={(v) => setF({ ...f, active: v })} />

        <div className="flex justify-end gap-2 pt-3 border-t border-[var(--adm-line)]">
          <button type="button" onClick={onClose} className="adm-btn">Cancel</button>
          <button type="submit" disabled={busy} className="adm-btn adm-btn--primary">{busy ? "Saving..." : "Save Card"}</button>
        </div>
      </form>
    </div>
  );
}

function Coupons() {
  const { data, loading, reload } = useApi("/api/coupons", { transform: (d) => d.items as any[] });
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const rows = data || [];

  return (
    <div>
      <SectionHeader index={sectionIndex("coupons")} kicker="Storefront" title="Coupons.">
        <button onClick={() => { setEditing(null); setShow(true); }} className="adm-btn adm-btn--primary !py-1.5 !text-[12px]">+ Add Coupon</button>
      </SectionHeader>

      <p className="-mt-3 mb-6 max-w-2xl text-[13px] leading-relaxed text-[var(--adm-muted)]">
        Codes created here are what customers scratch to reveal on the homepage coupon strip, and what they
        can type at checkout. Only <b>active</b> coupons appear on the homepage or are accepted at checkout.
      </p>

      {loading && !data && <p className="font-mono-adm text-[12px] text-[var(--adm-muted)]">Loading...</p>}
      {!loading && rows.length === 0 && (
        <p className="adm-card p-5 text-[13px] text-[var(--adm-muted)]">No coupons yet — add one above.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((c: any) => (
          <div key={c.id} className="adm-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono-adm text-[16px] font-bold tracking-wide">{c.code}</p>
                <p className="mt-1 text-[13px] text-[var(--adm-muted)]">
                  {c.type === "fixed" ? `₹${Number(c.value).toLocaleString("en-IN")} off` : `${Number(c.value)}% off`}
                  {Number(c.minOrder) > 0 && ` · min order ₹${Number(c.minOrder).toLocaleString("en-IN")}`}
                </p>
                <p className="mt-1 font-mono-adm text-[11px] text-[var(--adm-muted)]">
                  {c.redemptions ?? 0} used
                  {c.maxRedemptions != null && ` of ${c.maxRedemptions}`}
                  {c.perCustomerLimit != null && ` · max ${c.perCustomerLimit}/customer`}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className={`adm-pill ${c.active ? "adm-pill--good" : ""}`}>
                  <StatusDot tone={c.active ? "good" : "neutral"} /> {c.active ? "active" : "hidden"}
                </span>
                {c.expiresAt && (
                  <span className="adm-pill">
                    <StatusDot tone={new Date(c.expiresAt) <= new Date() ? "bad" : "warn"} />
                    {new Date(c.expiresAt) <= new Date() ? "expired" : `till ${new Date(c.expiresAt).toLocaleDateString("en-IN")}`}
                  </span>
                )}
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={() => { setEditing(c); setShow(true); }} className="adm-btn !py-1 !text-[11px]">Edit</button>
              <button
                onClick={async () => { if (confirm(`Delete coupon ${c.code}?`)) { await adminFetch(`/api/coupons/${c.id}`, { method: "DELETE" }); reload(); } }}
                className="adm-btn !py-1 !text-[11px] !text-[var(--adm-rose)]"
              >Delete</button>
            </div>
          </div>
        ))}
      </div>

      {show && <CouponEditor initial={editing} onClose={() => { setShow(false); setEditing(null); }} onSaved={reload} />}
    </div>
  );
}

function CouponEditor({ initial, onClose, onSaved }: { initial?: any; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    code: initial?.code || "",
    type: initial?.type || "percent",
    value: initial?.value != null ? String(initial.value) : "",
    minOrder: initial?.minOrder != null ? String(initial.minOrder) : "0",
    active: initial?.active ?? true,
    // datetime-local wants "YYYY-MM-DDTHH:mm" with no timezone or seconds.
    expiresAt: initial?.expiresAt ? String(initial.expiresAt).slice(0, 16) : "",
    maxRedemptions: initial?.maxRedemptions != null ? String(initial.maxRedemptions) : "",
    perCustomerLimit: initial?.perCustomerLimit != null ? String(initial.perCustomerLimit) : "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!f.code.trim()) { setError("Coupon code is required."); return; }
    if (!f.value || Number(f.value) <= 0) { setError("Enter a discount value greater than 0."); return; }

    setBusy(true);
    const url = initial ? `/api/coupons/${initial.id}` : "/api/coupons";
    const method = initial ? "PUT" : "POST";
    const r = await adminFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    setBusy(false);
    if (r.ok) { adminToast(`Coupon ${initial ? "saved" : "added"}.`); onSaved(); onClose(); }
    else {
      const d = await r.json().catch(() => ({}));
      setError(d.error || "Couldn't save this coupon.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-3 rounded-[14px] bg-[var(--adm-paper)] p-6 shadow-2xl">
        <h3 className="font-display-adm text-[20px]">{initial ? "Edit Coupon" : "New Coupon"}</h3>

        <Field label="Coupon Code *">
          <input
            required
            value={f.code}
            onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })}
            className="adm-input font-mono-adm uppercase"
            placeholder="e.g. WELCOME10"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Discount Type">
            <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} className="adm-input">
              <option value="percent">Percentage (%)</option>
              <option value="fixed">Fixed amount (₹)</option>
            </select>
          </Field>
          <Field label={f.type === "fixed" ? "Amount off (₹) *" : "Percent off (%) *"}>
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={f.value}
              onChange={(e) => setF({ ...f, value: e.target.value })}
              className="adm-input"
            />
          </Field>
        </div>

        <Field label="Minimum Order Value (₹)">
          <input type="number" min="0" step="0.01" value={f.minOrder} onChange={(e) => setF({ ...f, minOrder: e.target.value })} className="adm-input" />
        </Field>

        <Field label="Expires On">
          <input
            type="datetime-local"
            value={f.expiresAt}
            onChange={(e) => setF({ ...f, expiresAt: e.target.value })}
            className="adm-input"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Total Uses Allowed">
            <input
              type="number"
              min="1"
              step="1"
              value={f.maxRedemptions}
              onChange={(e) => setF({ ...f, maxRedemptions: e.target.value })}
              className="adm-input"
              placeholder="Unlimited"
            />
          </Field>
          <Field label="Uses Per Customer">
            <input
              type="number"
              min="1"
              step="1"
              value={f.perCustomerLimit}
              onChange={(e) => setF({ ...f, perCustomerLimit: e.target.value })}
              className="adm-input"
              placeholder="Unlimited"
            />
          </Field>
        </div>

        <p className="text-[11px] leading-relaxed text-[var(--adm-muted)]">
          Leave these blank for no limit. Without an expiry or a use cap, a code that
          leaks online keeps working forever, for anyone who finds it.
        </p>

        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
          Active (visible on homepage &amp; usable at checkout)
        </label>

        {error && <p className="text-[12px] font-bold text-[var(--adm-rose)]">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="adm-btn">Cancel</button>
          <button type="submit" disabled={busy} className="adm-btn adm-btn--primary">{busy ? "Saving..." : "Save Coupon"}</button>
        </div>
      </form>
    </div>
  );
}

function Outlets() {
  const { data, reload } = useApi("/api/outlets", { transform: (d) => d.items as any[] });
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    // Seeds local editable rows from the fetched outlets once they arrive.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (data) setRows(data);
  }, [data]);

  async function onPhoto(id: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const url = await uploadMediaFile(file).catch(() => "");
    if (url) setRows((prev) => prev.map((o) => (o.id === id ? { ...o, photo: url } : o)));
  }

  async function save(o: any) {
    await adminFetch("/api/outlets", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(o) });
    reload();
  }

  return (
    <div>
      <SectionHeader index={sectionIndex("outlets")} kicker="Physical" title="Store outlets." />
      <div className="space-y-4">
        {rows.map((o: any) => (
          <div key={o.id} className="adm-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="adm-eyebrow">Outlet #{o.id}{o.isMain ? " · main" : ""}</p>
                <p className="font-display-adm text-[18px]">{o.name}</p>
              </div>
              <button onClick={() => save(o)} className="adm-btn adm-btn--pine !py-1.5 !text-[12px]">Save Changes</button>
            </div>
            <div className="grid gap-4 md:grid-cols-[220px_1fr]">
              <div>
                <div className="aspect-[4/3] overflow-hidden rounded-md border border-[var(--adm-line)] bg-white">
                  {o.photo ? <img src={o.photo} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center font-mono-adm text-[10px] text-[var(--adm-muted)]">NO PHOTO</div>}
                </div>
                <label className="adm-btn mt-2 w-full cursor-pointer justify-center !py-1.5 !text-[11px]">
                  Replace photo
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => onPhoto(o.id, e)} />
                </label>
              </div>
              <div className="space-y-3">
                <Field label="Address"><textarea rows={2} value={o.addressLine} onChange={(e) => setRows((p) => p.map((x) => x.id === o.id ? { ...x, addressLine: e.target.value } : x))} className="adm-input" /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Phone"><input value={o.contact} onChange={(e) => setRows((p) => p.map((x) => x.id === o.id ? { ...x, contact: e.target.value } : x))} className="adm-input font-mono-adm" /></Field>
                  <Field label="Email"><input value={o.email} onChange={(e) => setRows((p) => p.map((x) => x.id === o.id ? { ...x, email: e.target.value } : x))} className="adm-input font-mono-adm" /></Field>
                  <Field label="Opens"><input value={o.hoursOpen} onChange={(e) => setRows((p) => p.map((x) => x.id === o.id ? { ...x, hoursOpen: e.target.value } : x))} className="adm-input" /></Field>
                  <Field label="Closes"><input value={o.hoursClose} onChange={(e) => setRows((p) => p.map((x) => x.id === o.id ? { ...x, hoursClose: e.target.value } : x))} className="adm-input" /></Field>
                </div>
                <Field label="Google Maps URL"><input value={o.mapsUrl} onChange={(e) => setRows((p) => p.map((x) => x.id === o.id ? { ...x, mapsUrl: e.target.value } : x))} className="adm-input font-mono-adm !text-[12px]" /></Field>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Content() {
  const { data, reload } = useApi("/api/content", { transform: (d) => d.items as any[] });
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState("");

  // Memoised for the same reason as Banners: a fresh array each render made the
  // effect below run on every render rather than when the pages actually load.
  const pages = useMemo(() => data || [], [data]);

  // Only calls setters, so it never needs rebuilding — which is what allows it
  // to be an honest dependency of the effect below.
  const pick = useCallback((p: any) => {
    setSlug(p.slug);
    setTitle(p.title);
    setBody(p.body);
    setMsg("");
  }, []);

  // Selects the first page once they arrive. `slug` is a real dependency: the
  // guard reads it, so leaving it out meant the effect could act on a stale
  // value. Re-running when it changes is harmless, since a set slug fails the
  // guard.
  // Seeding an editable form from data that arrives asynchronously is the one
  // case this rule can't express: the setState happens when the fetch resolves,
  // not during a render pass, and the !slug guard means it fires once rather
  // than cascading. Deliberately kept as an effect instead of deriving during
  // render, because title and body become user-edited state the moment the
  // admin types, so they cannot be recomputed from `pages`.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (pages.length && !slug) pick(pages[0]);
  }, [pages, slug, pick]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const r = await adminFetch("/api/content", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, title, body }) });
    if (r.ok) { setMsg("Saved · live on the site."); reload(); }
  }

  return (
    <div>
      <SectionHeader index={sectionIndex("content")} kicker="Editorial" title="Policies & copy." />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {pages.map((p: any) => <FilterPill key={p.slug} active={slug === p.slug} onClick={() => pick(p)}>{p.title}</FilterPill>)}
      </div>
      <form onSubmit={save} className="adm-card space-y-3 p-5">
        <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} className="adm-input font-display-adm !text-[18px]" /></Field>
        <Field label="Body"><textarea rows={14} value={body} onChange={(e) => setBody(e.target.value)} className="adm-input !leading-relaxed" /></Field>
        <div className="flex items-center justify-between">
          <p className="font-mono-adm text-[11px] text-[var(--adm-muted)]">slug: /policy/{slug || "..."}</p>
          <div className="flex items-center gap-2">
            {msg && <span className="adm-pill adm-pill--good">{msg}</span>}
            <button type="submit" className="adm-btn adm-btn--primary !py-1.5 !text-[12px]">Save & publish</button>
          </div>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Exports centre                                                    */
/* ------------------------------------------------------------------ */
function Exports() {
  return (
    <div>
      <SectionHeader index={sectionIndex("exports")} kicker="Data out" title="Excel exports.">
        <span className="adm-pill adm-pill--good"><StatusDot tone="good" /> live feed</span>
      </SectionHeader>
      <p className="-mt-3 mb-6 max-w-2xl text-[14px] leading-relaxed text-[var(--adm-muted)]">
        Every export streams straight from the live database. No caching, no
        stale rows. If a download is blocked by the browser or preview
        sandbox, use <b>Open</b> to open the file in a new tab, or <b>Copy</b> to
        copy a direct link you can paste anywhere.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ExportTile kind="stock" title="Stock sheet" meta="SKU · MRP · MOP · qty · source" />
        <ExportTile kind="customers" title="Customer records" meta="Name · email · phone · order count" />
        <ExportTile kind="orders" title="Billing & invoices" meta="Order no · items · totals · coupon · status" />
        <ExportTile kind="margins" title="Cost & margins" meta="MRP vs MOP gap, stock value at cost" />
        <ExportTile kind="coupon-usage" title="Coupon usage" meta="Redemptions & total discount per code" />
        <ExportTile kind="all" title="Full report bundle" meta="All five files, queued" />
      </div>
      <div className="adm-card mt-8 p-5">
        <p className="adm-eyebrow">Direct links</p>
        <p className="mt-1 text-[13px] text-[var(--adm-muted)]">Open in a new tab or copy to share with your accountant.</p>
        <ul className="mt-3 divide-y divide-[var(--adm-line)]">
          {[
            { label: "Stock",     path: "/api/export/stock" },
            { label: "Customers", path: "/api/export/customers" },
            { label: "Orders",    path: "/api/export/orders" },
            { label: "Margins",   path: "/api/export/margins" },
            { label: "Coupon Usage", path: "/api/export/coupon-usage" },
          ].map((x) => {
            const url = buildDownloadUrl(x.path, `sms-${x.label.toLowerCase()}-${stamp()}.csv`);
            return (
              <li key={x.path} className="flex flex-wrap items-center gap-2 py-2">
                <span className="adm-pill">{x.label}</span>
                <code className="min-w-0 flex-1 truncate rounded-md bg-[var(--adm-paper-2)]/60 px-2 py-1 font-mono-adm text-[11px] text-[var(--adm-muted)]">{url}</code>
                <a href={url} download className="adm-btn !py-1 !text-[11px]">Download</a>
                <button onClick={() => window.open(url, "_blank", "noopener")} className="adm-btn !py-1 !text-[11px]">Open</button>
                <button onClick={async () => { if (await copyToClipboard(url)) alert("Link copied to clipboard."); }} className="adm-btn !py-1 !text-[11px]">Copy</button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Settings                                                          */
/* ------------------------------------------------------------------ */
function Settings() {
  const sApi = useApi("/api/settings", { transform: (d) => d.settings });
  const nApi = useApi("/api/notification-settings", { transform: (d) => d.settings });

  const [s, setS] = useState<any>(null);
  const [n, setN] = useState<any>(null);

  useEffect(() => {
    // Seeds local editable state from fetched store settings once they arrive.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (sApi.data) setS(sApi.data);
  }, [sApi.data]);
  useEffect(() => {
    // Same pattern for notification settings.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (nApi.data) setN(nApi.data);
  }, [nApi.data]);

  const [msg, setMsg] = useState("");

  async function saveStore(e: React.FormEvent) {
    e.preventDefault();
    const r = await adminFetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });
    setMsg(r.ok ? "Store details saved." : "Could not save.");
  }

  async function saveNotif(e: React.FormEvent) {
    e.preventDefault();
    const r = await adminFetch("/api/notification-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(n) });
    setMsg(r.ok ? "Notification preferences saved." : "Could not save.");
  }

  if (!s || !n) return <p className="font-mono-adm text-[12px] text-[var(--adm-muted)]">Loading settings...</p>;

  const fields: [string, string][] = [
    ["brandName", "Brand name"], ["legalName", "Legal / billing name"],
    ["tagline", "Tagline"], ["gstin", "GSTIN"], ["pan", "PAN"],
    ["state", "State"], ["stateCode", "State code"], ["placeOfSupply", "Place of supply"],
    ["whatsappNumber", "WhatsApp number"], ["supportEmail", "Support email"], ["supportPhone", "Support phone"],
  ];

  return (
    <div>
      <SectionHeader index={sectionIndex("settings")} kicker="System" title="Settings." />
      <div className="grid gap-5 lg:grid-cols-2">
        <form onSubmit={saveStore} className="adm-card space-y-3 p-5">
          <p className="font-display-adm text-[18px]">Business & billing</p>
          <p className="text-[12px] text-[var(--adm-muted)] -mt-2">Looking for the store logo? It now has its own tab under Storefront &gt; Brand Logo.</p>

          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map(([k, label]) => (
              <Field key={k} label={label}><input value={s[k] || ""} onChange={(e) => setS({ ...s, [k]: e.target.value })} className="adm-input" /></Field>
            ))}
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            {msg && <span className="adm-pill adm-pill--good">{msg}</span>}
            <button type="submit" className="adm-btn adm-btn--primary !py-1.5 !text-[12px]">Save details</button>
          </div>
        </form>

        <form onSubmit={saveNotif} className="adm-card space-y-3 p-5">
          <p className="font-display-adm text-[18px]">Owner notifications</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Alert email"><input value={n.email} onChange={(e) => setN({ ...n, email: e.target.value })} className="adm-input font-mono-adm" /></Field>
            <Field label="Alert phone"><input value={n.phone} onChange={(e) => setN({ ...n, phone: e.target.value })} className="adm-input font-mono-adm" /></Field>
          </div>
          <p className="adm-eyebrow !mt-4">Channels</p>
          <div className="flex flex-wrap gap-2">
            <Check label="WhatsApp link button" checked={n.whatsappEnabled} onChange={(v) => setN({ ...n, whatsappEnabled: v })} />
            <Check label="Email (needs SMTP)" checked={n.emailEnabled} onChange={(v) => setN({ ...n, emailEnabled: v })} />
            <Check label="SMS (needs gateway)" checked={n.smsEnabled} onChange={(v) => setN({ ...n, smsEnabled: v })} />
          </div>
          <p className="adm-eyebrow !mt-4">Events</p>
          <div className="flex flex-wrap gap-2">
            <Check label="New order" checked={n.newOrder} onChange={(v) => setN({ ...n, newOrder: v })} />
            <Check label="New booking" checked={n.newBooking} onChange={(v) => setN({ ...n, newBooking: v })} />
            <Check label="New claim" checked={n.newClaim} onChange={(v) => setN({ ...n, newClaim: v })} />
            <Check label="Low stock" checked={n.lowStock} onChange={(v) => setN({ ...n, lowStock: v })} />
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="submit" className="adm-btn adm-btn--primary !py-1.5 !text-[12px]">Save preferences</button>
          </div>
        </form>

        <PasswordCard />
      </div>
    </div>
  );
}

function PasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setMsg("");
    if (newPassword.length < 8) { setError("New password must be at least 8 characters."); return; }
    if (newPassword !== confirmPassword) { setError("New password and confirmation don't match."); return; }

    setBusy(true);
    const r = await adminFetch("/api/admin/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setBusy(false);
    if (r.ok) {
      setMsg("Password updated.");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } else {
      const d = await r.json().catch(() => ({}));
      setError(d.error || "Couldn't update password.");
    }
  }

  return (
    <form onSubmit={save} className="adm-card space-y-3 p-5 lg:col-span-2">
      <p className="font-display-adm text-[18px]">Change admin password</p>
      <p className="text-[12px] text-[var(--adm-muted)]">
        If this account is still using the password from the initial setup, change it now and keep the
        new one private to you.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Current password">
          <input required type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="adm-input" />
        </Field>
        <Field label="New password">
          <input required type="password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="adm-input" />
        </Field>
        <Field label="Confirm new password">
          <input required type="password" minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="adm-input" />
        </Field>
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        {msg && <span className="adm-pill adm-pill--good">{msg}</span>}
        {error && <span className="text-[12px] font-bold text-[var(--adm-rose)]">{error}</span>}
        <button type="submit" disabled={busy} className="adm-btn adm-btn--primary !py-1.5 !text-[12px]">{busy ? "Saving..." : "Update password"}</button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/*  Help                                                              */
/* ------------------------------------------------------------------ */
function Help() {
  const items: [string, string][] = [
    ["Adding a product", "Products & Stock > + New product. Fill name, brand, category, MRP and MOP (your real selling price), stock, warranty, upload an image, Save. It goes live immediately."],
    ["Adjusting stock", "On the Products table, use the - and + steppers in the Stock column. The low-stock watchlist on the Overview updates automatically."],
    ["Hiding a product", "Click the green 'live' pill on a product row to toggle it to 'hidden'. The card disappears from the storefront but stays in your catalogue."],
    ["Updating an order", "Open Orders. Use the status dropdown on each row to move it from Placed > Packed > Shipped > Out for Delivery > Delivered (or Cancelled). The customer's Track Order page updates instantly."],
    ["Printing a GST invoice", "On any order row, click 'View Invoice'. A print-ready page opens with your GSTIN, PAN, outlet address and itemised MRP vs MOP. Use the browser Print dialog to save as PDF."],
    ["Downloading Excel", "Go to Excel Exports (or the cards on Overview). Click Download, Open in a new tab if the browser blocks the download, or Copy a direct link."],
    ["Editing policies / About / FAQ", "Policies & Copy > pick the page > edit the text > Save & publish. Changes go live on the site with no code and no deploy."],
    ["Updating outlet details", "Store Outlets > edit the fields, replace the photo if needed, click Save. Footer and Contact page pick up the changes on next load."],
    ["Notifications not arriving", "Settings > Owner notifications. Make sure the email/phone are correct and the relevant channel is ticked. In this preview environment email/SMS require SMTP/Twilio keys - the in-console bell and the WhatsApp pre-filled link always work."],
    ["Login loop or blank dashboard", "Sign out, then sign in again. The session is now stored in a secure cookie, so there is no token in local storage or the URL. If it still looks stuck, try a hard refresh or a private / incognito window."],
  ];

  return (
    <div>
      <SectionHeader index={sectionIndex("help")} kicker="Manual" title="Help & troubleshooting." />
      <div className="grid gap-3 md:grid-cols-2">
        {items.map(([q, a], i) => (
          <article key={q} className="adm-card p-5">
            <div className="flex items-center gap-3">
              <span className="font-mono-adm text-[11px] text-[var(--adm-muted)]">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="font-display-adm text-[16px]">{q}</h3>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--adm-muted)]">{a}</p>
          </article>
        ))}
      </div>
      <div className="adm-card mt-6 p-5">
        <p className="adm-eyebrow">Locked out?</p>
        <p className="mt-1 text-[13px] text-[var(--adm-muted)]">Default owner login is <code className="rounded bg-[var(--adm-paper-2)]/60 px-1.5 py-0.5 font-mono-adm text-[12px]">admin@smsstores.com</code> / <code className="rounded bg-[var(--adm-paper-2)]/60 px-1.5 py-0.5 font-mono-adm text-[12px]">owner1234</code>. To rotate the password, ask your developer to run the seed with a new hash, or update the <code className="font-mono-adm text-[12px]">admins</code> row directly.</p>
      </div>
    </div>
  );
}