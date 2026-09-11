"use client";

import { sectionIndex } from "@/lib/adminNav";
import { adminToast } from "@/lib/adminToast";

import { useMemo, useState } from "react";
import React from "react";
import { adminFetch } from "@/lib/adminAuth";
import { discountPercent, formatINR } from "@/lib/format";
import { imageRefError } from "@/lib/imageRef";
import { uploadMediaFile } from "@/lib/uploadMedia";
import BannerStyleFrame from "@/components/BannerStyleFrame";
import { SectionHeader, useApi, Field, Check } from "@/components/admin/shared";

export default function Banners() {
  const { data, loading, reload } = useApi("/api/banners", { transform: (d) => d.items as any[] });
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  // `data || []` inline would build a new array on every render, so the memo
  // below would recompute every time and cache nothing.
  const rows = useMemo(() => data || [], [data]);
  const groups = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const b of rows) {
      const slot = b.slot || "hero";
      map.set(slot, [...(map.get(slot) || []), b]);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const SLOT_LABELS: Record<string, string> = {
    hero_video: "Cinematic hero — full-screen video/photo above the categories",
    hero: "Hero carousel (top of homepage)",
    strip: "3-banner strips (after best sellers & after featured)",
    merchandising_1: "Merchandising banner (after deals)",
    merchandising_2: "Merchandising banner (after laptop gear)",
    merchandising_3: "Merchandising banner (after accessories)",
  };

  return (
    <div>
      <SectionHeader index={sectionIndex("banners")} kicker="Storefront" title="Homepage banners.">
        <button onClick={() => { setEditing(null); setShow(true); }} className="adm-btn adm-btn--primary !py-1.5 !text-[12px]">+ Add Banner</button>
      </SectionHeader>

      <p className="-mt-3 mb-6 max-w-2xl text-[13px] leading-relaxed text-[var(--adm-muted)]">
        Set <b>Slot</b> to <code className="font-mono-adm">hero</code> for the big top carousel,{" "}
        <code className="font-mono-adm">strip</code> for the plain 3-across banner rows, or one of the{" "}
        <code className="font-mono-adm">merchandising</code> slots for a smarter layout (split hero, a
        featured product/category/brand, a mixed grid, or video) — pick the <b>Layout</b> in the banner
        form to choose which of those it renders as.
      </p>

      {rows.length === 0 && !loading && (
        <p className="adm-card p-5 text-[13px] text-[var(--adm-muted)]">No banners yet — add one above.</p>
      )}

      {groups.map(([slot, items]) => (
        <div key={slot} className="mb-8">
          <p className="adm-eyebrow mb-3">{SLOT_LABELS[slot] || `Slot: ${slot}`} · {items.length}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {loading && !data && <p className="font-mono-adm text-[12px] text-[var(--adm-muted)]">Loading...</p>}
            {items.map((b: any) => (
              <div key={b.id} className="adm-card overflow-hidden">
                <div className="aspect-[16/7] bg-slate-100">
                  {b.image ? <img src={b.image} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center font-mono-adm text-[10px] text-[var(--adm-muted)]">NO IMAGE</div>}
                </div>
                <div className="flex items-start justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="truncate font-display-adm text-[14px]">{b.title}</p>
                    <p className="truncate text-[11px] text-[var(--adm-muted)]">{b.subtitle}</p>
                    <p className="mt-1 font-mono-adm text-[10px] text-[var(--adm-muted)]">
                      {b.slot} · {b.active ? "active" : "hidden"}
                      {b.style && b.style !== "minimal" && <> · <span className="text-[var(--adm-ink)]">{b.style}</span></>}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => { setEditing(b); setShow(true); }} className="adm-btn !py-1 !text-[11px]">Edit</button>
                    <button onClick={async () => { if (confirm("Delete banner?")) { await adminFetch(`/api/banners/${b.id}`, { method: "DELETE" }); reload(); } }} className="adm-btn !py-1 !text-[11px] !text-[var(--adm-rose)]">Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {show && <BannerEditor initial={editing} onClose={() => { setShow(false); setEditing(null); }} onSaved={reload} />}
    </div>
  );
}

function BannerEditor({ initial, onClose, onSaved }: { initial?: any; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    title: initial?.title || "",
    subtitle: initial?.subtitle || "",
    link: initial?.link || "/products",
    slot: initial?.slot || "hero",
    active: initial?.active ?? true,
    image: initial?.image || "",
    sortOrder: initial?.sortOrder != null ? String(initial.sortOrder) : "0",
    // Optional narrower crop served below 640px. Stored and validated by
    // the banners API already; now surfaced here and consumed by both
    // the hero carousel and the cinematic hero.
    mobileImage: initial?.mobileImage || "",
    // Scheduling. Blank means "live immediately / never expires" — the
    // storefront's isBannerLive() filter already handles both.
    startDate: initial?.startDate || "",
    endDate: initial?.endDate || "",
    // Layout + extras — all optional, default to the plain image tile so
    // existing banners (and the simple hero/strip flow) are unaffected.
    bannerType: initial?.bannerType || "image",
    size: initial?.size || "full",
    ctaLabel: initial?.ctaLabel || "",
    videoUrl: initial?.videoUrl || "",
    animation: initial?.animation || "fade",
    imageSide: initial?.imageSide || "right",
    productId: initial?.productId ?? "",
    categoryId: initial?.categoryId ?? "",
    brandId: initial?.brandId ?? "",
    // Premium banner design system — style + independent text/product
    // animation + carousel transition + optional eyebrow badge. All
    // default to values that render identically to the pre-upgrade
    // layout, so existing banners are unaffected until an admin
    // explicitly picks a style.
    style: initial?.style || "minimal",
    textAnimation: initial?.textAnimation || "fade-up",
    productAnimation: initial?.productAnimation || "none",
    transition: initial?.transition || "fade",
    badge: initial?.badge || "",
    autoplayMs: initial?.autoplayMs != null ? String(initial.autoplayMs) : "",
    // Cinematic hero only (slot hero_video).
    contentPosition: initial?.contentPosition || "left",
    overlayStrength: initial?.overlayStrength || "medium",
    mobileVideo: initial?.mobileVideo ?? false,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");

  // Reference pickers only need to load when a layout that uses them is
  // selected — fetched lazily off the existing admin list endpoints
  // rather than duplicating that data-fetching logic here.
  const needsProduct = f.bannerType === "product";
  const needsCategory = f.bannerType === "category";
  const needsBrand = f.bannerType === "brand";

  const { data: productOptions } = useApi("/api/products?limit=500", {
    transform: (d) => (d.items || []) as any[],
  });
  const { data: categoryOptions } = useApi("/api/categories", {
    transform: (d) => (d.items || []) as any[],
  });
  const { data: brandOptions } = useApi("/api/brands", {
    transform: (d) => (Array.isArray(d) ? d : d.items || []) as any[],
  });

  // Live preview data — resolves the same product/category/brand the
  // storefront would use, so the preview reflects real price/discount
  // instead of placeholder numbers. Falls back gracefully when nothing
  // is selected yet.
  const previewProduct = needsProduct && f.productId !== "" ? productOptions?.find((p: any) => String(p.id) === String(f.productId)) : null;
  const previewImage =
    f.image ||
    previewProduct?.primaryImage ||
    previewProduct?.images?.[0] ||
    (needsCategory && f.categoryId !== "" ? categoryOptions?.find((c: any) => String(c.id) === String(f.categoryId))?.image : null) ||
    (needsBrand && f.brandId !== "" ? brandOptions?.find((b: any) => String(b.id) === String(f.brandId))?.logoUrl : null) ||
    null;

  const previewData = {
    id: initial?.id ?? "preview",
    link: f.link,
    badge: f.badge,
    title: previewProduct?.name || f.title || "Banner headline",
    subtitle: f.subtitle,
    ctaLabel: f.ctaLabel,
    image: previewImage,
    imageSide: f.imageSide,
    style: f.style,
    textAnimation: f.textAnimation,
    productAnimation: f.productAnimation,
    price: previewProduct ? formatINR(previewProduct.mop) : null,
    mrp: previewProduct ? formatINR(previewProduct.mrp) : null,
    discountPercent: previewProduct ? discountPercent(previewProduct.mrp, previewProduct.mop) : null,
  };

  const DEVICE_WIDTH: Record<string, string> = { desktop: "100%", tablet: "440px", mobile: "300px" };

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const url = await uploadMediaFile(file).catch(() => "");
    if (url) setF({ ...f, image: url });
  }

  // Same pipeline as images — R2 when configured, data-URL fallback — but
  // surfaces the error instead of silently clearing, because a 60 MB video
  // that exceeds the upload cap should say so, not vanish.
  const [videoUploadErr, setVideoUploadErr] = useState("");
  async function onVideoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setVideoUploadErr("");
    try {
      const url = await uploadMediaFile(file);
      setF({ ...f, videoUrl: url });
    } catch (err) {
      setVideoUploadErr(err instanceof Error ? err.message : "Video upload failed.");
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();

    // The three location fields are validated here rather than by the browser.
    // They were type="url", which rejects the site-relative paths every existing
    // banner holds (/images/banner-hero-1.jpg), so editing a banner's title or
    // dates was blocked by a complaint about an image field the owner had not
    // touched. See src/lib/imageRef.ts.
    const refError =
      imageRefError(f.image, "Banner image URL") ||
      imageRefError(f.mobileImage, "Mobile image URL") ||
      imageRefError(f.videoUrl, "Video URL");
    if (refError) { setErr(refError); return; }

    setBusy(true); setErr("");

    const url = initial ? `/api/banners/${initial.id}` : "/api/banners";
    const method = initial ? "PUT" : "POST";

    // Only send the reference id that actually matches the chosen layout —
    // avoids leaving a stale productId set on a banner that was switched
    // from "product" to "category", for example.
    const payload = {
      ...f,
      productId: needsProduct && f.productId !== "" ? Number(f.productId) : null,
      categoryId: needsCategory && f.categoryId !== "" ? Number(f.categoryId) : null,
      brandId: needsBrand && f.brandId !== "" ? Number(f.brandId) : null,
      sortOrder: f.sortOrder === "" ? 0 : Number(f.sortOrder),
      // Send null rather than "" so clearing a date actually removes the
      // schedule instead of storing an unparseable empty string.
      startDate: f.startDate || null,
      endDate: f.endDate || null,
    };

    const r = await adminFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setBusy(false);
    if (r.ok) { adminToast(`Banner ${initial ? "saved" : "added"} — now live on the site.`); onSaved(); onClose(); return; }
    // This editor previously had no failure branch at all: a rejected save left
    // the form sitting there with no message, looking identical to one that had
    // not been submitted yet.
    const data = await r.json().catch(() => ({}));
    setErr(data?.error || `Could not save the banner (${r.status}). Please try again.`);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="grid w-full max-w-5xl grid-cols-1 gap-0 overflow-hidden rounded-[14px] bg-[var(--adm-paper)] shadow-2xl lg:grid-cols-[1fr_1fr]">
        <form onSubmit={save} className="max-h-[90vh] space-y-3 overflow-y-auto p-6">
        <h3 className="font-display-adm text-[20px]">{initial ? "Edit Banner" : "New Banner"}</h3>
        <Field label="Title *"><input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="adm-input" /></Field>
        <Field label="Subtitle"><input value={f.subtitle} onChange={(e) => setF({ ...f, subtitle: e.target.value })} className="adm-input" /></Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Link"><input value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} className="adm-input" /></Field>
          <Field label="Slot (Where to display)">
            <select value={f.slot} onChange={(e) => setF({ ...f, slot: e.target.value })} className="adm-input">
              <option value="hero_video">Cinematic hero (full-screen video/photo)</option>
              <option value="hero">Hero carousel (top)</option>
              <option value="strip">3-banner strip</option>
              <option value="merchandising_1">Merchandising — after deals</option>
              <option value="merchandising_2">Merchandising — after laptop gear</option>
              <option value="merchandising_3">Merchandising — after accessories</option>
            </select>
          </Field>
        </div>

        <p className="-mt-1 font-mono-adm text-[11px] text-[var(--adm-muted)]">
          Strip banners are pooled together and rotated in groups of 3 across the strip
          positions on the homepage — you don&apos;t assign one to a specific position.
        </p>

        <Field label="Layout">
          <select value={f.bannerType} onChange={(e) => setF({ ...f, bannerType: e.target.value })} className="adm-input">
            <option value="image">Plain image tile</option>
            <option value="split">Split hero (big image + text side by side)</option>
            <option value="product">Featured product (live price, pulled from a real product)</option>
            <option value="category">Category spotlight (links to a category)</option>
            <option value="brand">Brand spotlight (links to a brand)</option>
            <option value="grid">Mixed grid (large tile + small tiles — pair with other &quot;grid&quot; banners in the same slot)</option>
            <option value="video">Video banner</option>
          </select>
        </Field>
        <p className="-mt-1 font-mono-adm text-[11px] text-[var(--adm-muted)]">
          Layout only matters in a <code>merchandising</code> slot — <code>hero</code> and{" "}
          <code>strip</code> always render as a plain image tile regardless of this setting.
        </p>

        {needsProduct && (
          <Field label="Featured product *">
            <select required value={f.productId} onChange={(e) => setF({ ...f, productId: e.target.value })} className="adm-input">
              <option value="">Select a product…</option>
              {(productOptions || []).map((p: any) => (
                <option key={p.id} value={p.id}>{p.name} — {p.brand}</option>
              ))}
            </select>
          </Field>
        )}
        {needsCategory && (
          <Field label="Category *">
            <select required value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })} className="adm-input">
              <option value="">Select a category…</option>
              {(categoryOptions || []).map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
        )}
        {needsBrand && (
          <Field label="Brand *">
            <select required value={f.brandId} onChange={(e) => setF({ ...f, brandId: e.target.value })} className="adm-input">
              <option value="">Select a brand…</option>
              {(brandOptions || []).map((b: any) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </Field>
        )}

        {(f.bannerType === "split" || f.bannerType === "product" || f.bannerType === "video") && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Button text">
              <input value={f.ctaLabel} onChange={(e) => setF({ ...f, ctaLabel: e.target.value })} placeholder="Shop Now" className="adm-input" />
            </Field>
            {f.bannerType !== "video" && (
              <Field label="Image side">
                <select value={f.imageSide} onChange={(e) => setF({ ...f, imageSide: e.target.value })} className="adm-input">
                  <option value="right">Image on right</option>
                  <option value="left">Image on left</option>
                </select>
              </Field>
            )}
          </div>
        )}

        {f.bannerType === "grid" && (
          <Field label="Tile size (within the mixed grid)">
            <select value={f.size} onChange={(e) => setF({ ...f, size: e.target.value })} className="adm-input">
              <option value="large">Large (the big featured tile)</option>
              <option value="small">Small (a side tile)</option>
            </select>
          </Field>
        )}

        {f.bannerType === "video" && (
          <Field label="Video URL *">
            <input required type="text" inputMode="url" value={f.videoUrl} onChange={(e) => setF({ ...f, videoUrl: e.target.value })} placeholder="https://example.com/promo.mp4" className="adm-input font-mono-adm !text-[11px]" />
          </Field>
        )}

        <Field label="Entrance animation">
          <select value={f.animation} onChange={(e) => setF({ ...f, animation: e.target.value })} className="adm-input">
            <option value="fade">Fade in</option>
            <option value="slide">Slide in</option>
            <option value="scale">Scale in</option>
            <option value="none">None</option>
          </select>
        </Field>

        {/* Premium banner design system — only meaningful for split/product
            banners (BannerStyleFrame). Left visible but low-emphasis for
            other types since a style can still be saved for later reuse
            if the banner type is switched. */}
        {(f.bannerType === "split" || f.bannerType === "product") && (
          <div className="grid grid-cols-1 gap-4 rounded-lg border border-[var(--adm-line)] p-4 sm:grid-cols-2">
            <p className="col-span-full text-[11px] font-black uppercase tracking-[0.14em] text-[var(--adm-muted)]">
              Premium style (optional)
            </p>

            <Field label="Banner style">
              <select value={f.style} onChange={(e) => setF({ ...f, style: e.target.value })} className="adm-input">
                <option value="minimal">Minimal (classic layout)</option>
                <option value="premium-product">Premium Product</option>
                <option value="dark-tech">Dark Tech</option>
                <option value="light-retail">Light Retail</option>
                <option value="sale">Sale</option>
                <option value="editorial">Editorial</option>
                <option value="glass">Glass</option>
                <option value="gradient">Gradient</option>
              </select>
            </Field>

            <Field label="Badge / eyebrow text">
              <input
                type="text"
                value={f.badge}
                onChange={(e) => setF({ ...f, badge: e.target.value })}
                placeholder="e.g. LIMITED OFFER"
                maxLength={40}
                className="adm-input"
              />
            </Field>

            <Field label="Text animation">
              <select value={f.textAnimation} onChange={(e) => setF({ ...f, textAnimation: e.target.value })} className="adm-input">
                <option value="fade-up">Fade up</option>
                <option value="fade">Fade</option>
                <option value="slide">Slide</option>
                <option value="stagger">Stagger (badge → heading → price → CTA)</option>
                <option value="pop">Pop</option>
                <option value="none">None</option>
              </select>
            </Field>

            <Field label="Product/image animation">
              <select value={f.productAnimation} onChange={(e) => setF({ ...f, productAnimation: e.target.value })} className="adm-input">
                <option value="none">None</option>
                <option value="float">Float</option>
                <option value="glow">Glow</option>
                <option value="tilt">Tilt (hover)</option>
                <option value="scale">Scale in</option>
              </select>
            </Field>
          </div>
        )}

        {/* Cinematic hero controls. Only this slot renders full-screen
            over video, so overlay/content-position/mobile-video would be
            meaningless noise anywhere else. */}
        {f.slot === "hero_video" && (
          <div className="grid grid-cols-1 gap-4 rounded-lg border border-[var(--adm-line)] p-4 sm:grid-cols-2">
            <p className="col-span-full text-[11px] font-black uppercase tracking-[0.14em] text-[var(--adm-muted)]">
              Cinematic hero
            </p>

            <Field label="Background video URL (optional)">
              <input
                type="text"
                inputMode="url"
                value={f.videoUrl}
                onChange={(e) => setF({ ...f, videoUrl: e.target.value })}
                placeholder="https://example.com/store.mp4"
                className="adm-input font-mono-adm !text-[11px]"
              />
            </Field>

            <Field label="Content position">
              <select value={f.contentPosition} onChange={(e) => setF({ ...f, contentPosition: e.target.value })} className="adm-input">
                <option value="left">Left</option>
                <option value="center">Centre</option>
                <option value="right">Right</option>
              </select>
            </Field>

            <Field label="Overlay darkness">
              <select value={f.overlayStrength} onChange={(e) => setF({ ...f, overlayStrength: e.target.value })} className="adm-input">
                <option value="soft">Soft (bright footage)</option>
                <option value="medium">Medium (recommended)</option>
                <option value="strong">Strong (busy footage)</option>
              </select>
            </Field>

            <Field label="Slide transition">
              <select value={f.transition} onChange={(e) => setF({ ...f, transition: e.target.value })} className="adm-input">
                <option value="fade">Fade</option>
                <option value="slide">Slide</option>
                <option value="scale">Scale</option>
                <option value="fade-slide">Fade + Slide</option>
              </select>
            </Field>

            <Field label="Slide duration (ms)">
              <input
                type="number"
                min={3000}
                step={500}
                value={f.autoplayMs}
                onChange={(e) => setF({ ...f, autoplayMs: e.target.value })}
                placeholder="7000"
                className="adm-input"
              />
            </Field>

            <Field label="Button text">
              <input value={f.ctaLabel} onChange={(e) => setF({ ...f, ctaLabel: e.target.value })} placeholder="Shop Now" className="adm-input" />
            </Field>

            <Field label="Badge / eyebrow text">
              <input value={f.badge} onChange={(e) => setF({ ...f, badge: e.target.value })} placeholder="e.g. NOW OPEN" maxLength={40} className="adm-input" />
            </Field>

            <div className="col-span-full">
              <Check
                label="Also play the video on phones"
                checked={f.mobileVideo}
                onChange={(v) => setF({ ...f, mobileVideo: v })}
              />
              <p className="mt-2 font-mono-adm text-[11px] text-[var(--adm-muted)]">
                Leave this off unless the file is small. Phones otherwise show the mobile image
                (or the main image), which loads far faster on mobile data. If no video is set
                at all, the image is used everywhere — video is never required.
              </p>
            </div>
          </div>
        )}

        {f.slot === "hero" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Carousel transition">
              <select value={f.transition} onChange={(e) => setF({ ...f, transition: e.target.value })} className="adm-input">
                <option value="fade">Fade</option>
                <option value="slide">Slide</option>
                <option value="scale">Scale</option>
                <option value="fade-slide">Fade + Slide</option>
              </select>
            </Field>
            <Field label="Autoplay interval (ms)">
              <input
                type="number"
                min={2000}
                step={500}
                value={f.autoplayMs}
                onChange={(e) => setF({ ...f, autoplayMs: e.target.value })}
                placeholder="5000"
                className="adm-input"
              />
            </Field>
          </div>
        )}

        {f.image && <div className="aspect-[6/1] overflow-hidden rounded-md border border-[var(--adm-line)]"><img src={f.image} alt="" className="h-full w-full object-cover" /></div>}

        <Field label="Banner Image URL">
          <input
            type="text"
            inputMode="url"
            value={f.image.startsWith("data:") ? "" : f.image}
            onChange={(e) => setF({ ...f, image: e.target.value })}
            placeholder="https://example.com/banner.jpg"
            className="adm-input font-mono-adm !text-[11px]"
          />
        </Field>

        <Field label="Mobile image URL (optional)">
          <input
            type="text"
            inputMode="url"
            value={f.mobileImage}
            onChange={(e) => setF({ ...f, mobileImage: e.target.value })}
            placeholder="https://example.com/banner-mobile.jpg"
            className="adm-input font-mono-adm !text-[11px]"
          />
        </Field>
        <p className="-mt-1 font-mono-adm text-[11px] text-[var(--adm-muted)]">
          A taller crop shown below 640px. Only this file is downloaded on phones, so a wide
          desktop banner never costs a mobile visitor extra data. Leave blank to reuse the main image.
        </p>

        {/* Ordering + scheduling. Both columns already existed in the
            database and were honoured by the storefront, but there was no
            way to set them from here — order had to be guessed from the
            insert sequence, and a Diwali banner had to be switched on and
            off by hand. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Display order">
            <input
              type="number"
              value={f.sortOrder}
              onChange={(e) => setF({ ...f, sortOrder: e.target.value })}
              placeholder="0"
              className="adm-input"
            />
          </Field>
          <Field label="Go live on (optional)">
            <input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} className="adm-input" />
          </Field>
          <Field label="Expire after (optional)">
            <input type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} className="adm-input" />
          </Field>
        </div>
        <p className="-mt-1 font-mono-adm text-[11px] text-[var(--adm-muted)]">
          Lower display order shows first. Leave the dates blank for a banner that is live now
          and never expires.
        </p>

        <div>
          <Field label="Or Upload Banner">
            <input type="file" accept="image/*" onChange={onUpload} className="adm-input !py-1.5" />
          </Field>
          <p className="mt-2 text-[11px] font-bold text-[var(--adm-rose)]">
            REQUIREMENT: Upload images cropped to exactly 1400x233 pixels. (Product/category/brand
            layouts use the referenced item&apos;s own image instead — this upload is optional for those.)
            Any format works — JPEG/PNG/WebP/AVIF are all converted to WebP automatically on upload.
          </p>
        </div>

        {f.slot === "hero" && f.bannerType !== "video" && (
          <div className="rounded-lg border border-[var(--adm-line)] p-4">
            <p className="mb-3 text-[11px] font-black uppercase tracking-[0.14em] text-[var(--adm-muted)]">
              Looping video (optional)
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Video URL">
                <input
                  type="text"
                  inputMode="url"
                  value={f.videoUrl}
                  onChange={(e) => setF({ ...f, videoUrl: e.target.value })}
                  placeholder="https://example.com/promo.mp4"
                  className="adm-input font-mono-adm !text-[11px]"
                />
              </Field>
              <Field label="Or upload video (MP4/WebM, max 100 MB)">
                <input type="file" accept="video/mp4,video/webm" onChange={onVideoUpload} className="adm-input !py-1.5" />
              </Field>
            </div>
            {videoUploadErr && (
              <p role="alert" className="mt-2 text-[11px] font-bold text-[var(--adm-rose)]">{videoUploadErr}</p>
            )}
            <p className="mt-2 font-mono-adm text-[11px] text-[var(--adm-muted)]">
              Plays muted on a continuous loop while this slide is showing. The banner image above
              doubles as the poster and is shown to visitors who prefer reduced motion, so keep it set.
              Short 6–15 second clips work best.
            </p>
          </div>
        )}

        <Check label="Show on Storefront" checked={f.active} onChange={(v) => setF({ ...f, active: v })} />

        {err && (
          <p role="alert" className="rounded-md border border-[rgba(185,28,28,0.3)] bg-[rgba(185,28,28,0.07)] px-3 py-2 text-[12px] font-semibold leading-relaxed text-[var(--adm-rose)]">
            {err}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="adm-btn">Cancel</button>
          <button type="submit" disabled={busy} className="adm-btn adm-btn--primary">{busy ? "Saving..." : "Save Banner"}</button>
        </div>
        </form>

        {/* Live preview — renders the same BannerStyleFrame component the
            storefront uses, so this never drifts from production output.
            Device toggle scales the preview width only; the frame itself
            is the real component, not a mock. */}
        <div className="hidden max-h-[90vh] flex-col overflow-y-auto border-l border-[var(--adm-line)] bg-[var(--adm-bg,#f4f4f2)] p-6 lg:flex">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--adm-muted)]">Live preview</p>
            <div className="flex gap-1 rounded-full border border-[var(--adm-line)] bg-white p-0.5">
              {(["desktop", "tablet", "mobile"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setPreviewDevice(d)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold capitalize transition ${
                    previewDevice === d ? "bg-[var(--adm-ink)] text-white" : "text-[var(--adm-muted)] hover:text-[var(--adm-ink)]"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-1 items-center justify-center overflow-hidden rounded-xl bg-slate-100 p-4">
            <div style={{ width: DEVICE_WIDTH[previewDevice], maxWidth: "100%" }} className="transition-all duration-300">
              {f.bannerType === "split" || f.bannerType === "product" ? (
                <BannerStyleFrame data={previewData} />
              ) : (
                <div className="overflow-hidden rounded-2xl bg-slate-900 shadow-lg">
                  {previewImage ? (
                    <img src={previewImage} alt="" className="aspect-[6/1] w-full object-cover" />
                  ) : (
                    <div className="flex aspect-[6/1] items-center justify-center text-xs font-bold text-white/50">No image yet</div>
                  )}
                  <div className="p-4">
                    <p className="text-sm font-black text-white">{f.title || "Banner headline"}</p>
                    {f.subtitle && <p className="mt-1 text-xs text-white/70">{f.subtitle}</p>}
                  </div>
                </div>
              )}
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-[var(--adm-muted)]">
            This preview uses the real storefront banner component. Product/category/brand price and image
            data reflect the current live catalogue.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Coupons                                                            */
/* ------------------------------------------------------------------ */
