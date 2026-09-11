"use client";

import { ArrowDown, ArrowUp, ExternalLink, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { adminFetch } from "@/lib/adminAuth";
import {
  DEFAULT_HOME_CONFIG,
  HOME_CONFIG_SLUG,
  type HomePageConfig,
  parseHomePageConfig,
  type TrustBadgeConfig,
  type BudgetCardConfig,
  type ProcessStepConfig,
  type ServiceFaqConfig,
  type UseCaseTileConfig,
} from "@/lib/homepageConfig";
import {
  BENEFIT_ICON_KEYS,
  DEFAULT_HOME_STORY,
  HOME_STORY_SLUG,
  type BenefitCardConfig,
  type BenefitIconKey,
  type HomeStoryConfig,
  parseHomeStoryConfig,
} from "@/lib/homepageStory";
import {
  HOMEPAGE_SECTIONS_SLUG,
  DEFAULT_HOMEPAGE_SECTIONS,
  parseHomepageSectionsConfig,
  SECTION_LABELS,
  type HomepageSectionsConfig,
  type SectionKey,
} from "@/lib/siteConfig";
import { sectionIndex } from "@/lib/adminNav";
import {
  HOME_SHOWCASE_SLUG,
  DEFAULT_HOME_SHOWCASE,
  parseHomeShowcaseConfig,
  type HomeShowcaseConfig,
  type ShowcaseChapter,
} from "@/lib/homepageShowcase";

type ContentPage = { slug: string; title: string; body: string };

const ICON_OPTIONS: { value: TrustBadgeConfig["iconKey"]; label: string }[] = [
  { value: "shield", label: "Shield" },
  { value: "card", label: "Card" },
  { value: "wrench", label: "Wrench" },
  { value: "refresh", label: "Refresh" },
  { value: "map-pin", label: "Map Pin" },
];

// Friendly labels for the richer icon set used by the "why shop with us"
// cards. Derived from BENEFIT_ICON_KEYS so a new key can never be offered
// here without also existing in the renderer's map.
const BENEFIT_ICON_LABELS: Record<BenefitIconKey, string> = {
  truck: "Delivery truck",
  shield: "Shield / warranty",
  wrench: "Wrench / repair",
  rupee: "Rupee / pricing",
  headset: "Headset / support",
  store: "Storefront",
  sparkles: "Sparkles",
  card: "Card / EMI",
  clock: "Clock / speed",
  award: "Award / quality",
  "map-pin": "Map pin / location",
  package: "Package / stock",
};

const EMPTY_BENEFIT: BenefitCardConfig = {
  iconKey: "sparkles",
  image: "",
  title: "",
  description: "",
  href: "",
  enabled: true,
};

export default function HomepageEditor() {
  const [config, setConfig] = useState<HomePageConfig>(DEFAULT_HOME_CONFIG);
  const [sections, setSections] = useState<HomepageSectionsConfig>(DEFAULT_HOMEPAGE_SECTIONS);
  const [story, setStory] = useState<HomeStoryConfig>(DEFAULT_HOME_STORY);
  const [showcase, setShowcase] = useState<HomeShowcaseConfig>(DEFAULT_HOME_SHOWCASE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  // Catalog for the "Product spotlight" picker — loaded once with the rest
  // of the editor so the owner picks by name, never by typing an id.
  const [pickerProducts, setPickerProducts] = useState<{ id: number; name: string; brand: string; mop: string; status?: string }[]>([]);
  // Live homepage preview: which device frame is open, and a counter used
  // as the iframe key so "Refresh" re-loads it after saving.
  const [previewDevice, setPreviewDevice] = useState<"mobile" | "tablet" | "desktop" | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [r, rSections, rStory, rShowcase] = await Promise.all([
        adminFetch(`/api/content?slug=${encodeURIComponent(HOME_CONFIG_SLUG)}`),
        adminFetch(`/api/content?slug=${encodeURIComponent(HOMEPAGE_SECTIONS_SLUG)}`),
        adminFetch(`/api/content?slug=${encodeURIComponent(HOME_STORY_SLUG)}`),
        adminFetch(`/api/content?slug=${encodeURIComponent(HOME_SHOWCASE_SLUG)}`),
      ]);
      const d = await r.json().catch(() => ({}));
      const page = d?.page as ContentPage | undefined;
      setConfig(parseHomePageConfig(page?.body));
      const dSections = await rSections.json().catch(() => ({}));
      const sectionsPage = dSections?.page as ContentPage | undefined;
      setSections(parseHomepageSectionsConfig(sectionsPage?.body));
      const dStory = await rStory.json().catch(() => ({}));
      setStory(parseHomeStoryConfig((dStory?.page as ContentPage | undefined)?.body));
      const dShowcase = await rShowcase.json().catch(() => ({}));
      setShowcase(parseHomeShowcaseConfig((dShowcase?.page as ContentPage | undefined)?.body));
      // Product list for the spotlight picker. Failure here should never
      // block the editor — the picker just falls back to "Automatic".
      try {
        const rProducts = await adminFetch("/api/products?limit=500");
        const dProducts = await rProducts.json().catch(() => ({}));
        if (Array.isArray(dProducts?.items)) {
          setPickerProducts(
            dProducts.items.map((p: any) => ({ id: p.id, name: p.name, brand: p.brand, mop: p.mop, status: p.status }))
          );
        }
      } catch {
        /* picker falls back to Automatic */
      }
    } catch (e: any) {
      setError(e?.message || "Could not load homepage content.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Fetch-on-mount: load()'s setState calls run after the async
    // response, not synchronously in the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  function moveSection(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= sections.order.length) return;
    const next = [...sections.order];
    [next[index], next[j]] = [next[j], next[index]];
    setSections({ ...sections, order: next });
  }

  function toggleSectionHidden(key: SectionKey) {
    const isHidden = sections.hidden.includes(key);
    setSections({
      ...sections,
      hidden: isHidden ? sections.hidden.filter((k) => k !== key) : [...sections.hidden, key],
    });
  }

  const managedAreas = useMemo(
    () => [
      "Header delivery label & marquee",
      "Welcome strip headline and sub-copy",
      "Homepage highlight chips",
      "Trust badges",
      "Shop by Budget titles and cards",
      "Service CTA block",
      "Repair CTA block",
      "Store visit heading",
      "Product spotlight pick",
      "Deal of the Day wording",
      "Shop by use case tiles",
      "Phone/tablet/desktop preview",
    ],
    []
  );

  function setField<K extends keyof HomePageConfig>(key: K, value: HomePageConfig[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  function setMarquee(index: number, value: string) {
    const next = [...config.marqueeItems];
    next[index] = value;
    setField("marqueeItems", next);
  }

  // The process steps are a fixed set of four, but a config saved before
  // this section shipped can arrive with fewer, so pad up to the index
  // being edited instead of writing past the end of the array (which
  // would leave holes that serialise to null and get dropped on parse).
  function setProcessStep(index: number, key: keyof ProcessStepConfig, value: string) {
    const next = [...config.processSteps];
    while (next.length <= index) next.push({ title: "", body: "" });
    next[index] = { ...next[index], [key]: value };
    setField("processSteps", next);
  }

  function setShowcaseChapter(index: number, key: keyof ShowcaseChapter, value: string) {
    const next = [...showcase.chapters];
    while (next.length <= index) next.push({ kicker: "", title: "", body: "", stat: "", statLabel: "" });
    next[index] = { ...next[index], [key]: value };
    setShowcase({ ...showcase, chapters: next });
  }

  function setFaqItem(index: number, key: keyof ServiceFaqConfig, value: string) {
    const next = [...config.serviceFaqItems];
    while (next.length <= index) next.push({ question: "", answer: "" });
    next[index] = { ...next[index], [key]: value };
    setField("serviceFaqItems", next);
  }

  function setBadge(index: number, key: keyof TrustBadgeConfig, value: string) {
    const next = [...config.trustBadges];
    next[index] = { ...next[index], [key]: value } as TrustBadgeConfig;
    setField("trustBadges", next);
  }

  function setUseCase(index: number, key: keyof UseCaseTileConfig, value: string) {
    const next = [...config.useCases];
    while (next.length <= index) next.push({ label: "", tagline: "", emoji: "", query: "", tone: "" });
    next[index] = { ...next[index], [key]: value };
    setField("useCases", next);
  }

  function setBudget(index: number, key: keyof BudgetCardConfig, value: string) {
    const next = [...config.budgets];
    next[index] = {
      ...next[index],
      [key]: key === "max" ? (value.trim() ? Number(value) : null) : value,
    } as BudgetCardConfig;
    setField("budgets", next);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    setError("");
    try {
      const [r, rSections, rStory, rShowcase] = await Promise.all([
        adminFetch("/api/content", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: HOME_CONFIG_SLUG,
            title: "Homepage Content",
            body: JSON.stringify(config, null, 2),
          }),
        }),
        adminFetch("/api/content", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: HOMEPAGE_SECTIONS_SLUG,
            title: "Homepage Section Order",
            body: JSON.stringify(sections, null, 2),
          }),
        }),
        adminFetch("/api/content", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: HOME_STORY_SLUG,
            title: "Homepage Brand Story & Benefits",
            body: JSON.stringify(story, null, 2),
          }),
        }),
        adminFetch("/api/content", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: HOME_SHOWCASE_SLUG,
            title: "Homepage Tech Showcase",
            body: JSON.stringify(showcase, null, 2),
          }),
        }),
      ]);
      if (!r.ok || !rSections.ok || !rStory.ok || !rShowcase.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d?.error || "Save failed.");
      }
      setMsg("Homepage editor saved. Changes are live on next refresh.");
    } catch (e: any) {
      setError(e?.message || "Could not save homepage content.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="font-mono-adm text-[12px] text-[var(--adm-muted)]">Loading homepage editor...</p>;
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="adm-eyebrow">{sectionIndex("homepage")} / Storefront</p>
          <h1 className="mt-2 font-display-adm text-[28px] leading-tight sm:text-[36px]">Homepage CMS.</h1>
        </div>
        <button onClick={load} className="adm-btn !py-1.5 !text-[12px]">Reload</button>
      </div>
      <hr className="adm-rule mb-6" />

      <div className="mb-6 grid gap-3 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="adm-card p-5">
          <p className="font-display-adm text-[18px]">What was missing from admin</p>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--adm-muted)]">
            These homepage sections were previously hardcoded in the frontend. They are now editable from this panel without touching code.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {managedAreas.map((item) => (
              <span key={item} className="adm-pill adm-pill--good">{item}</span>
            ))}
          </div>
        </div>
        <div className="adm-card p-5">
          <p className="font-display-adm text-[18px]">Commercial-readiness notes</p>
          <ul className="mt-3 space-y-2 text-[13px] text-[var(--adm-muted)]">
            <li>• One save updates all homepage copy consistently.</li>
            <li>• Existing fallback defaults stay intact if JSON is empty or broken.</li>
            <li>• No database migration required — content is stored in existing content_pages.</li>
          </ul>
        </div>
      </div>

      <form onSubmit={save} className="space-y-5">
        <Card title="Section order & visibility" subtitle="Controls which content blocks appear below the hero banner, and in what order. The hero video, category strip, welcome strip, trust badges, and banner carousel always stay at the top.">
          <div className="space-y-2">
            {sections.order.map((key, index) => {
              const hidden = sections.hidden.includes(key);
              return (
                <div
                  key={key}
                  className={`flex items-center gap-3 rounded-2xl border p-3 ${hidden ? "border-[var(--adm-line)] bg-[var(--adm-line)]/10 opacity-60" : "border-[var(--adm-line)] bg-[#fffdf7]"}`}
                >
                  <span className="font-mono-adm w-6 shrink-0 text-[11px] text-[var(--adm-muted)]">{index + 1}</span>
                  <span className="flex-1 text-[13px] font-semibold">{SECTION_LABELS[key]}</span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button type="button" onClick={() => moveSection(index, -1)} disabled={index === 0} className="adm-btn !py-1.5 !px-2.5 !text-[12px] disabled:opacity-30"><ArrowUp aria-hidden className="h-3 w-3" /><span className="sr-only">Move up</span></button>
                    <button type="button" onClick={() => moveSection(index, 1)} disabled={index === sections.order.length - 1} className="adm-btn !py-1.5 !px-2.5 !text-[12px] disabled:opacity-30"><ArrowDown aria-hidden className="h-3 w-3" /><span className="sr-only">Move down</span></button>
                    <button
                      type="button"
                      onClick={() => toggleSectionHidden(key)}
                      className={`adm-btn !py-1.5 !px-3 !text-[12px] ${hidden ? "" : "adm-btn--primary"}`}
                    >
                      {hidden ? "Hidden" : "Visible"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 font-mono-adm text-[11px] text-[var(--adm-muted)]">
            A section only appears if it&apos;s set to Visible and there&apos;s matching product/data to show (e.g. Flash sale only shows when deals exist).
          </p>
        </Card>

        <Card
          title="Preview the homepage"
          subtitle="See the live homepage as customers do, on different screen sizes. Save your changes first, then press Refresh — the preview shows what's actually published."
        >
          <div className="flex flex-wrap items-center gap-2">
            {([
              ["mobile", "\uD83D\uDCF1 Phone"],
              ["tablet", "\uD83D\uDCBB Tablet"],
              ["desktop", "\uD83D\uDDA5\uFE0F Desktop"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPreviewDevice(previewDevice === key ? null : key)}
                className={`adm-btn !text-[12px] ${previewDevice === key ? "adm-btn--primary" : ""}`}
              >
                {label}
              </button>
            ))}
            {previewDevice && (
              <>
                <button type="button" onClick={() => setPreviewNonce((n) => n + 1)} className="adm-btn !text-[12px]">
                  <RefreshCw aria-hidden className="mr-1 inline h-3 w-3 align-[-1px]" />Refresh
                </button>
                <a href="/" target="_blank" rel="noreferrer" className="adm-btn !text-[12px]">
                  Open in new tab <ExternalLink aria-hidden className="ml-0.5 inline h-3 w-3 align-[-1px]" />
                </a>
              </>
            )}
          </div>
          {previewDevice && (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--adm-line)] bg-[var(--adm-line)]/10 p-4">
              <iframe
                key={`${previewDevice}-${previewNonce}`}
                src="/"
                title="Homepage preview"
                className="mx-auto block rounded-xl border border-[var(--adm-line)] bg-white shadow-lg"
                style={{
                  width: previewDevice === "mobile" ? 390 : previewDevice === "tablet" ? 768 : "100%",
                  minWidth: previewDevice === "desktop" ? 1024 : undefined,
                  height: 620,
                }}
              />
              <p className="mt-2 text-center font-mono-adm text-[11px] text-[var(--adm-muted)]">
                {previewDevice === "mobile" ? "390px — a typical phone" : previewDevice === "tablet" ? "768px — a typical tablet" : "Full width — desktop"}
              </p>
            </div>
          )}
        </Card>

        <Card
          title="Product spotlight"
          subtitle="The big single-product stage. Pick any product by name, or leave it on Automatic to always feature your first product marked 'Featured'. Spec chips around the photo come from that product's own Specifications field."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Eyebrow">
              <input value={config.spotlightEyebrow} onChange={(e) => setField("spotlightEyebrow", e.target.value)} className="adm-input" />
            </Field>
            <Field label="Spotlight product">
              <select
                value={config.spotlightProductId ?? ""}
                onChange={(e) => setField("spotlightProductId", e.target.value ? Number(e.target.value) : null)}
                className="adm-input"
              >
                <option value="">Automatic — first &quot;Featured&quot; product</option>
                {pickerProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.brand ? `${p.brand} — ` : ""}{p.name} (₹{p.mop}){p.status && p.status !== "active" ? " — hidden!" : ""}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <p className="mt-3 font-mono-adm text-[11px] text-[var(--adm-muted)]">
            Price, MRP and stock always come live from the product itself — you never retype them here.
          </p>
        </Card>

        <Card
          title="Deal of the Day"
          subtitle="One genuinely discounted product with a countdown to midnight. The product rotates automatically every night from your real, in-stock discounts — you only control the wording."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Eyebrow (small text above)">
              <input value={config.dailyDropEyebrow} onChange={(e) => setField("dailyDropEyebrow", e.target.value)} className="adm-input" />
            </Field>
            <Field label="Title">
              <input value={config.dailyDropTitle} onChange={(e) => setField("dailyDropTitle", e.target.value)} className="adm-input" />
            </Field>
          </div>
          <p className="mt-3 font-mono-adm text-[11px] text-[var(--adm-muted)]">
            The section hides itself automatically if no product currently has a real discount and stock.
          </p>
        </Card>

        <Card
          title="Shop by use case tiles"
          subtitle="Lifestyle shortcuts like Gaming or College that jump straight to a filtered product list. Change them for a season — e.g. 'Exam Season' or 'Wedding Gifts' — any time. A tile with a blank name is dropped on save."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Eyebrow">
              <input value={config.useCasesEyebrow} onChange={(e) => setField("useCasesEyebrow", e.target.value)} className="adm-input" />
            </Field>
            <Field label="Title">
              <input value={config.useCasesTitle} onChange={(e) => setField("useCasesTitle", e.target.value)} className="adm-input" />
            </Field>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {config.useCases.map((tile, index) => (
              <div key={index} className="rounded-2xl border border-[var(--adm-line)] bg-[#fffdf7] p-4">
                <p className="adm-eyebrow">Tile {index + 1}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Name (e.g. Gaming)">
                    <input value={tile.label} onChange={(e) => setUseCase(index, "label", e.target.value)} className="adm-input" />
                  </Field>
                  <Field label="Emoji">
                    <input value={tile.emoji} onChange={(e) => setUseCase(index, "emoji", e.target.value)} className="adm-input" />
                  </Field>
                  <Field label="One-line description">
                    <input value={tile.tagline} onChange={(e) => setUseCase(index, "tagline", e.target.value)} className="adm-input" />
                  </Field>
                  <Field label="Filter (after /products?)">
                    <input value={tile.query} onChange={(e) => setUseCase(index, "query", e.target.value)} className="adm-input font-mono-adm !text-[11px]" placeholder="category=mobiles&maxPrice=15000" />
                  </Field>
                  <Field label="Gradient classes">
                    <input value={tile.tone} onChange={(e) => setUseCase(index, "tone", e.target.value)} className="adm-input font-mono-adm !text-[11px]" />
                  </Field>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 font-mono-adm text-[11px] text-[var(--adm-muted)]">
            Filter examples: <span className="font-bold">category=mobiles&amp;maxPrice=15000</span> (phones under ₹15k) · <span className="font-bold">category=mobile-accessories</span> (all accessories) · <span className="font-bold">minDiscount=10</span> (everything 10%+ off).
          </p>
        </Card>

        <Card
          title="Tech showcase (scroll chapters)"
          subtitle="The pinned cinematic section where copy chapters advance as the visitor scrolls. Reorder or hide it from “Section order & visibility” above. A chapter with a blank headline is dropped on save."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Eyebrow">
              <input value={showcase.eyebrow} onChange={(e) => setShowcase({ ...showcase, eyebrow: e.target.value })} className="adm-input" />
            </Field>
            <Field label="Heading">
              <input value={showcase.title} onChange={(e) => setShowcase({ ...showcase, title: e.target.value })} className="adm-input" />
            </Field>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Sub-line under the heading">
              <input value={showcase.subtitle} onChange={(e) => setShowcase({ ...showcase, subtitle: e.target.value })} className="adm-input" />
            </Field>
            <Field label="Device image URL (blank = built-in phone artwork)">
              <input
                value={showcase.image}
                onChange={(e) => setShowcase({ ...showcase, image: e.target.value })}
                placeholder="/images/flagship.png"
                className="adm-input font-mono-adm !text-[11px]"
              />
            </Field>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="Image alt text">
              <input value={showcase.imageAlt} onChange={(e) => setShowcase({ ...showcase, imageAlt: e.target.value })} className="adm-input" />
            </Field>
            <Field label="Button text (blank hides the button)">
              <input value={showcase.ctaLabel} onChange={(e) => setShowcase({ ...showcase, ctaLabel: e.target.value })} className="adm-input" />
            </Field>
            <Field label="Button link">
              <input value={showcase.link} onChange={(e) => setShowcase({ ...showcase, link: e.target.value })} placeholder="/products" className="adm-input" />
            </Field>
          </div>
          <div className="mt-4 space-y-4">
            {[0, 1, 2].map((index) => {
              const chapter = showcase.chapters[index] || { kicker: "", title: "", body: "", stat: "", statLabel: "" };
              return (
                <div key={index} className="rounded-2xl border border-[var(--adm-line)] p-4">
                  <p className="adm-eyebrow mb-3">Chapter {index + 1}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Kicker (small uppercase line)">
                      <input value={chapter.kicker} onChange={(e) => setShowcaseChapter(index, "kicker", e.target.value)} className="adm-input" />
                    </Field>
                    <Field label="Headline">
                      <input value={chapter.title} onChange={(e) => setShowcaseChapter(index, "title", e.target.value)} className="adm-input" />
                    </Field>
                  </div>
                  <div className="mt-3">
                    <Field label="Body">
                      <textarea rows={2} value={chapter.body} onChange={(e) => setShowcaseChapter(index, "body", e.target.value)} className="adm-input" />
                    </Field>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field label="Big stat (e.g. 30 min — optional)">
                      <input value={chapter.stat} onChange={(e) => setShowcaseChapter(index, "stat", e.target.value)} className="adm-input" />
                    </Field>
                    <Field label="Stat label">
                      <input value={chapter.statLabel} onChange={(e) => setShowcaseChapter(index, "statLabel", e.target.value)} className="adm-input" />
                    </Field>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="Header bar & marquee" subtitle="Controls the top delivery label and scrolling announcement text.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Delivery label">
              <input value={config.headerDeliveryLabel} onChange={(e) => setField("headerDeliveryLabel", e.target.value)} className="adm-input" />
            </Field>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {config.marqueeItems.map((item, index) => (
              <Field key={index} label={`Marquee line ${index + 1}`}>
                <input value={item} onChange={(e) => setMarquee(index, e.target.value)} className="adm-input" />
              </Field>
            ))}
          </div>
        </Card>

        <Card title="Welcome strip" subtitle="The one-line brand intro below the category circles.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Headline">
              <input value={config.welcomeTitle} onChange={(e) => setField("welcomeTitle", e.target.value)} className="adm-input" />
            </Field>
            <Field label="Description template">
              <input value={config.welcomeDescription} onChange={(e) => setField("welcomeDescription", e.target.value)} className="adm-input" />
            </Field>
          </div>
          <p className="mt-2 font-mono-adm text-[11px] text-[var(--adm-muted)]">Use placeholders: {'{brand}'}, {'{tagline}'}, {'{outletCount}'}</p>
        </Card>

        <Card title="Trust badges" subtitle="The delivery/repair/store trust cards shown right below the welcome strip.">
          <div className="grid gap-4 lg:grid-cols-2">
            {config.trustBadges.map((badge, index) => (
              <div key={index} className="rounded-2xl border border-[var(--adm-line)] bg-[#fffdf7] p-4">
                <p className="adm-eyebrow">Badge {index + 1}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Title">
                    <input value={badge.title} onChange={(e) => setBadge(index, "title", e.target.value)} className="adm-input" />
                  </Field>
                  <Field label="Icon">
                    <select value={badge.iconKey} onChange={(e) => setBadge(index, "iconKey", e.target.value)} className="adm-input">
                      {ICON_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="mt-3">
                  <Field label="Subtitle">
                    <input value={badge.subtitle} onChange={(e) => setBadge(index, "subtitle", e.target.value)} className="adm-input" />
                  </Field>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* ---------- Brand story block ---------- */}
        <Card
          title="Brand story block"
          subtitle="The artwork/character panel with your promise and proof numbers. Reorder or hide it from “Section order & visibility” above."
        >
          <div className="mb-4">
            <StoryCheck
              label="Show the brand story block on the homepage"
              checked={story.storyEnabled}
              onChange={(v) => setStory({ ...story, storyEnabled: v })}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Eyebrow">
              <input value={story.storyEyebrow} onChange={(e) => setStory({ ...story, storyEyebrow: e.target.value })} className="adm-input" />
            </Field>
            <Field label="Heading">
              <input value={story.storyHeading} onChange={(e) => setStory({ ...story, storyHeading: e.target.value })} className="adm-input" />
            </Field>
          </div>

          <div className="mt-3">
            <Field label="Body copy">
              <textarea
                rows={3}
                value={story.storyBody}
                onChange={(e) => setStory({ ...story, storyBody: e.target.value })}
                className="adm-input"
              />
            </Field>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Button text (blank hides the button)">
              <input value={story.storyCtaLabel} onChange={(e) => setStory({ ...story, storyCtaLabel: e.target.value })} className="adm-input" />
            </Field>
            <Field label="Button link">
              <input value={story.storyCtaHref} onChange={(e) => setStory({ ...story, storyCtaHref: e.target.value })} placeholder="/about" className="adm-input" />
            </Field>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-[2fr_1fr]">
            <Field label="Artwork / character image URL (blank = text-only block)">
              <input
                value={story.characterImage}
                onChange={(e) => setStory({ ...story, characterImage: e.target.value })}
                placeholder="/images/store-interior.jpg"
                className="adm-input font-mono-adm !text-[11px]"
              />
            </Field>
            <Field label="Artwork motion">
              <select
                value={story.characterAnimation}
                onChange={(e) => setStory({ ...story, characterAnimation: e.target.value as HomeStoryConfig["characterAnimation"] })}
                className="adm-input"
              >
                <option value="float">Gentle float</option>
                <option value="drift">Slow drift</option>
                <option value="none">Still</option>
              </select>
            </Field>
          </div>

          <div className="mt-3">
            <Field label="Artwork alt text (read by screen readers)">
              <input value={story.characterAlt} onChange={(e) => setStory({ ...story, characterAlt: e.target.value })} className="adm-input" />
            </Field>
          </div>

          <p className="adm-eyebrow mt-5">Proof stats (up to 4 — clear both fields to drop one)</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((index) => {
              const stat = story.storyStats[index] || { value: "", label: "" };
              // Stats are edited as a fixed 4-slot grid rather than an
              // add/remove list: the row is dropped on save by
              // parseHomeStoryConfig when either field is blank, so an
              // admin never has to reason about array indices.
              const setStat = (key: "value" | "label", v: string) => {
                const next = [0, 1, 2, 3].map((i) => story.storyStats[i] || { value: "", label: "" });
                next[index] = { ...next[index], [key]: v };
                setStory({ ...story, storyStats: next.filter((s) => s.value.trim() || s.label.trim()) });
              };
              return (
                <div key={index} className="rounded-2xl border border-[var(--adm-line)] bg-[#fffdf7] p-4">
                  <p className="adm-eyebrow">Stat {index + 1}</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field label="Number">
                      <input value={stat.value} onChange={(e) => setStat("value", e.target.value)} placeholder="30 min" className="adm-input" />
                    </Field>
                    <Field label="Label">
                      <input value={stat.label} onChange={(e) => setStat("label", e.target.value)} placeholder="City delivery" className="adm-input" />
                    </Field>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* ---------- Why shop with us ---------- */}
        <Card
          title="Why shop with us (benefit cards)"
          subtitle="Up to 8 cards. Each can use a built-in icon or your own artwork, and can link anywhere on the site."
        >
          <div className="mb-4">
            <StoryCheck
              label="Show the benefit cards on the homepage"
              checked={story.whyEnabled}
              onChange={(v) => setStory({ ...story, whyEnabled: v })}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Eyebrow">
              <input value={story.whyEyebrow} onChange={(e) => setStory({ ...story, whyEyebrow: e.target.value })} className="adm-input" />
            </Field>
            <Field label="Heading">
              <input value={story.whyHeading} onChange={(e) => setStory({ ...story, whyHeading: e.target.value })} className="adm-input" />
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Supporting text">
              <input value={story.whySubtitle} onChange={(e) => setStory({ ...story, whySubtitle: e.target.value })} className="adm-input" />
            </Field>
          </div>

          <div className="mt-5 space-y-3">
            {story.benefits.map((card, index) => {
              const setCard = (patch: Partial<BenefitCardConfig>) => {
                const next = [...story.benefits];
                next[index] = { ...next[index], ...patch };
                setStory({ ...story, benefits: next });
              };
              const move = (dir: -1 | 1) => {
                const j = index + dir;
                if (j < 0 || j >= story.benefits.length) return;
                const next = [...story.benefits];
                [next[index], next[j]] = [next[j], next[index]];
                setStory({ ...story, benefits: next });
              };
              return (
                <div key={index} className="rounded-2xl border border-[var(--adm-line)] bg-[#fffdf7] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="adm-eyebrow">Card {index + 1}</p>
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => move(-1)} disabled={index === 0} className="adm-btn !px-2 !py-1 !text-[11px] disabled:opacity-40"><ArrowUp aria-hidden className="h-3 w-3" /><span className="sr-only">Move up</span></button>
                      <button type="button" onClick={() => move(1)} disabled={index === story.benefits.length - 1} className="adm-btn !px-2 !py-1 !text-[11px] disabled:opacity-40"><ArrowDown aria-hidden className="h-3 w-3" /><span className="sr-only">Move down</span></button>
                      <button
                        type="button"
                        onClick={() => setCard({ enabled: !card.enabled })}
                        className={`adm-pill ${card.enabled ? "adm-pill--good" : ""}`}
                      >
                        {card.enabled ? "Visible" : "Hidden"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setStory({ ...story, benefits: story.benefits.filter((_, i) => i !== index) })}
                        className="adm-btn !px-2 !py-1 !text-[11px] text-[var(--adm-rose)]"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field label="Title">
                      <input value={card.title} onChange={(e) => setCard({ title: e.target.value })} className="adm-input" />
                    </Field>
                    <Field label="Icon">
                      <select value={card.iconKey} onChange={(e) => setCard({ iconKey: e.target.value as BenefitIconKey })} className="adm-input">
                        {BENEFIT_ICON_KEYS.map((key) => (
                          <option key={key} value={key}>{BENEFIT_ICON_LABELS[key]}</option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <div className="mt-3">
                    <Field label="Description">
                      <input value={card.description} onChange={(e) => setCard({ description: e.target.value })} className="adm-input" />
                    </Field>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field label="Link (blank = not clickable)">
                      <input value={card.href} onChange={(e) => setCard({ href: e.target.value })} placeholder="/services" className="adm-input" />
                    </Field>
                    <Field label="Artwork URL (replaces the icon)">
                      <input
                        value={card.image}
                        onChange={(e) => setCard({ image: e.target.value })}
                        placeholder="/images/svc-bench-wide.jpg"
                        className="adm-input font-mono-adm !text-[11px]"
                      />
                    </Field>
                  </div>
                </div>
              );
            })}
          </div>

          {story.benefits.length < 8 && (
            <button
              type="button"
              onClick={() => setStory({ ...story, benefits: [...story.benefits, { ...EMPTY_BENEFIT }] })}
              className="adm-btn mt-3 !py-1.5 !text-[12px]"
            >
              + Add benefit card
            </button>
          )}
          <p className="mt-3 font-mono-adm text-[11px] text-[var(--adm-muted)]">
            A card with a blank title is dropped on save. The section disappears entirely if every
            card is hidden or removed.
          </p>
        </Card>

        <Card title="Shop by Budget" subtitle="Title and filters for the homepage budget cards.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Eyebrow">
              <input value={config.budgetsEyebrow} onChange={(e) => setField("budgetsEyebrow", e.target.value)} className="adm-input" />
            </Field>
            <Field label="Title">
              <input value={config.budgetsTitle} onChange={(e) => setField("budgetsTitle", e.target.value)} className="adm-input" />
            </Field>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {config.budgets.map((budget, index) => (
              <div key={index} className="rounded-2xl border border-[var(--adm-line)] bg-[#fffdf7] p-4">
                <p className="adm-eyebrow">Budget card {index + 1}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Label">
                    <input value={budget.label} onChange={(e) => setBudget(index, "label", e.target.value)} className="adm-input" />
                  </Field>
                  <Field label="Emoji">
                    <input value={budget.emoji} onChange={(e) => setBudget(index, "emoji", e.target.value)} className="adm-input" />
                  </Field>
                  <Field label="Max price">
                    <input value={budget.max ?? ""} onChange={(e) => setBudget(index, "max", e.target.value)} className="adm-input" placeholder="Leave blank for premium+" />
                  </Field>
                  <Field label="Gradient classes">
                    <input value={budget.tone} onChange={(e) => setBudget(index, "tone", e.target.value)} className="adm-input font-mono-adm !text-[11px]" />
                  </Field>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card
          title="Repairs & Servicing strip (top of homepage)"
          subtitle="The first thing customers see. The service tiles themselves come from Services — this only controls the wording around them."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Small label above the heading">
              <input value={config.serviceStripEyebrow} onChange={(e) => setField("serviceStripEyebrow", e.target.value)} className="adm-input" />
            </Field>
            <Field label="Heading">
              <input value={config.serviceStripTitle} onChange={(e) => setField("serviceStripTitle", e.target.value)} className="adm-input" />
            </Field>
            <Field label="Booking button label">
              <input value={config.serviceStripButtonLabel} onChange={(e) => setField("serviceStripButtonLabel", e.target.value)} className="adm-input" />
            </Field>
            <Field label="Description">
              <textarea rows={3} value={config.serviceStripSubtitle} onChange={(e) => setField("serviceStripSubtitle", e.target.value)} className="adm-input !leading-relaxed" />
            </Field>
          </div>

          <p className="mt-5 text-[13px] font-semibold text-[var(--adm-muted)]">
            Four reassurance points shown under the service tiles. Leave one blank to keep the saved wording.
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((index) => (
              <Field key={index} label={`Reassurance point ${index + 1}`}>
                <input
                  value={config.serviceStripHighlights[index] ?? ""}
                  onChange={(e) => {
                    const next = [...config.serviceStripHighlights];
                    // Pad rather than index past the end, so editing point 4
                    // while point 3 is empty cannot create a sparse array
                    // (which would serialise as null and be dropped).
                    while (next.length < index) next.push("");
                    next[index] = e.target.value;
                    setField("serviceStripHighlights", next);
                  }}
                  className="adm-input"
                />
              </Field>
            ))}
          </div>
          <p className="mt-3 text-[12px] text-[var(--adm-muted)]">
            To add, rename, reprice or remove a service tile, use the Services
            section — the strip updates automatically. If no services are
            active, the whole strip is hidden.
          </p>
        </Card>

        <Card
          title="Popular repaired services"
          subtitle="Framing copy for the photo rail of repair services. The services, photos and prices themselves come from the Services section — tick “Featured” on a service there to put it first."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Eyebrow"><input value={config.repairShowcaseEyebrow} onChange={(e) => setField("repairShowcaseEyebrow", e.target.value)} className="adm-input" /></Field>
            <Field label="Title"><input value={config.repairShowcaseTitle} onChange={(e) => setField("repairShowcaseTitle", e.target.value)} className="adm-input" /></Field>
            <Field label="Button label"><input value={config.repairShowcaseButtonLabel} onChange={(e) => setField("repairShowcaseButtonLabel", e.target.value)} className="adm-input" /></Field>
          </div>
          <div className="mt-3">
            <Field label="Subtitle"><textarea rows={2} value={config.repairShowcaseSubtitle} onChange={(e) => setField("repairShowcaseSubtitle", e.target.value)} className="adm-input !leading-relaxed" /></Field>
          </div>
        </Card>

        <Card title="Service & repair CTAs" subtitle="Editable copy for the dark mid-page blocks.">
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-[var(--adm-line)] bg-[#fffdf7] p-4">
              <p className="font-display-adm text-[17px]">Service CTA block</p>
              <div className="mt-3 space-y-3">
                <Field label="Badge"><input value={config.serviceBadge} onChange={(e) => setField("serviceBadge", e.target.value)} className="adm-input" /></Field>
                <Field label="Title"><input value={config.serviceTitle} onChange={(e) => setField("serviceTitle", e.target.value)} className="adm-input" /></Field>
                <Field label="Description"><textarea rows={3} value={config.serviceDescription} onChange={(e) => setField("serviceDescription", e.target.value)} className="adm-input !leading-relaxed" /></Field>
                <Field label="Button label"><input value={config.serviceButtonLabel} onChange={(e) => setField("serviceButtonLabel", e.target.value)} className="adm-input" /></Field>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--adm-line)] bg-[#fffdf7] p-4">
              <p className="font-display-adm text-[17px]">Repair CTA block</p>
              <div className="mt-3 space-y-3">
                <Field label="Eyebrow"><input value={config.repairEyebrow} onChange={(e) => setField("repairEyebrow", e.target.value)} className="adm-input" /></Field>
                <Field label="Title before accent"><input value={config.repairTitle} onChange={(e) => setField("repairTitle", e.target.value)} className="adm-input" /></Field>
                <Field label="Accent text"><input value={config.repairAccent} onChange={(e) => setField("repairAccent", e.target.value)} className="adm-input" /></Field>
                <Field label="Description"><textarea rows={3} value={config.repairDescription} onChange={(e) => setField("repairDescription", e.target.value)} className="adm-input !leading-relaxed" /></Field>
                <Field label="Button label"><input value={config.repairButtonLabel} onChange={(e) => setField("repairButtonLabel", e.target.value)} className="adm-input" /></Field>
              </div>
            </div>
          </div>
        </Card>

        <Card
          title="How a repair works (4 steps)"
          subtitle="The four-step journey shown below the repair block. These four steps match the four booking statuses you set in Bookings — Booked, In Progress, Ready, Delivered — so keep the wording in the same order."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Eyebrow"><input value={config.processEyebrow} onChange={(e) => setField("processEyebrow", e.target.value)} className="adm-input" /></Field>
            <Field label="Heading"><input value={config.processTitle} onChange={(e) => setField("processTitle", e.target.value)} className="adm-input" /></Field>
            <Field label="Intro line"><textarea rows={2} value={config.processSubtitle} onChange={(e) => setField("processSubtitle", e.target.value)} className="adm-input !leading-relaxed" /></Field>
            <Field label="Reassurance line under the button"><input value={config.processFootnote} onChange={(e) => setField("processFootnote", e.target.value)} className="adm-input" /></Field>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="rounded-2xl border border-[var(--adm-line)] bg-[#fffdf7] p-4">
                <p className="font-display-adm text-[15px]">Step {index + 1}</p>
                <div className="mt-3 space-y-3">
                  <Field label="Step title">
                    <input
                      value={config.processSteps[index]?.title ?? ""}
                      onChange={(e) => setProcessStep(index, "title", e.target.value)}
                      className="adm-input"
                    />
                  </Field>
                  <Field label="What happens">
                    <textarea
                      rows={3}
                      value={config.processSteps[index]?.body ?? ""}
                      onChange={(e) => setProcessStep(index, "body", e.target.value)}
                      className="adm-input !leading-relaxed"
                    />
                  </Field>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12px] text-[var(--adm-muted)]">
            The number and icon on each step are set automatically. Clear a box
            to restore the wording that is saved now. The button label is shared
            with the top servicing strip.
          </p>
        </Card>

        <Card
          title="Repair & service FAQ"
          subtitle="The questions shown near the bottom of the homepage. Answer only what you can actually stand behind — this is the section customers read right before deciding to book."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Eyebrow"><input value={config.serviceFaqEyebrow} onChange={(e) => setField("serviceFaqEyebrow", e.target.value)} className="adm-input" /></Field>
            <Field label="Heading"><input value={config.serviceFaqTitle} onChange={(e) => setField("serviceFaqTitle", e.target.value)} className="adm-input" /></Field>
          </div>

          <div className="mt-4 space-y-3">
            {config.serviceFaqItems.map((item, index) => (
              <div key={index} className="rounded-2xl border border-[var(--adm-line)] bg-[#fffdf7] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-display-adm text-[15px]">Question {index + 1}</p>
                  <button
                    type="button"
                    onClick={() => setField("serviceFaqItems", config.serviceFaqItems.filter((_, i) => i !== index))}
                    className="text-[12px] font-bold text-[var(--adm-rose)] hover:underline"
                  >
                    Remove
                  </button>
                </div>
                <div className="mt-3 space-y-3">
                  <Field label="Question">
                    <input
                      value={item.question}
                      onChange={(e) => setFaqItem(index, "question", e.target.value)}
                      className="adm-input"
                    />
                  </Field>
                  <Field label="Answer">
                    <textarea
                      rows={3}
                      value={item.answer}
                      onChange={(e) => setFaqItem(index, "answer", e.target.value)}
                      className="adm-input !leading-relaxed"
                    />
                  </Field>
                </div>
              </div>
            ))}
          </div>

          {config.serviceFaqItems.length < 8 && (
            <button
              type="button"
              onClick={() => setField("serviceFaqItems", [...config.serviceFaqItems, { question: "", answer: "" }])}
              className="adm-btn mt-3"
            >
              + Add a question
            </button>
          )}

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Field label="Help card heading"><input value={config.serviceFaqHelpTitle} onChange={(e) => setField("serviceFaqHelpTitle", e.target.value)} className="adm-input" /></Field>
            <Field label="Help card text"><textarea rows={3} value={config.serviceFaqHelpBody} onChange={(e) => setField("serviceFaqHelpBody", e.target.value)} className="adm-input !leading-relaxed" /></Field>
          </div>
          <p className="mt-3 text-[12px] text-[var(--adm-muted)]">
            Up to 8 questions. A question saved without an answer is skipped on
            the live page. The device chips and phone numbers on the help card
            come from your Services and Outlets, so they update on their own.
          </p>
        </Card>

        <Card title="Store visit heading" subtitle="Controls the outlet section heading only.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Eyebrow"><input value={config.storeEyebrow} onChange={(e) => setField("storeEyebrow", e.target.value)} className="adm-input" /></Field>
            <Field label="Title"><input value={config.storeTitle} onChange={(e) => setField("storeTitle", e.target.value)} className="adm-input" /></Field>
          </div>
        </Card>

        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-[var(--adm-line)] bg-[var(--adm-paper)]/95 px-4 py-3 shadow-lg backdrop-blur">
          {error && <span className="text-[12px] font-bold text-[var(--adm-rose)]">{error}</span>}
          {msg && <span className="adm-pill adm-pill--good">{msg}</span>}
          <button type="submit" disabled={saving} className="adm-btn adm-btn--primary">
            {saving ? "Saving..." : "Save homepage content"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="adm-card p-5">
      <p className="font-display-adm text-[18px]">{title}</p>
      {subtitle && <p className="mt-1 text-[13px] text-[var(--adm-muted)]">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="adm-eyebrow">{label}</span>
      {children}
    </label>
  );
}

// Local checkbox row. AdminDashboard has its own <Check>, but it isn't
// exported and this editor is deliberately self-contained (same reason it
// carries its own Card/Field helpers).
function StoryCheck({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-[13px] font-bold">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
      {label}
    </label>
  );
}
