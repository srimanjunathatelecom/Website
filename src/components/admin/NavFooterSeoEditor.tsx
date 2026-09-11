"use client";

import { ArrowDown, ArrowUp, X } from "lucide-react";
import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/adminAuth";
import {
  NAV_CONFIG_SLUG,
  FOOTER_CONFIG_SLUG,
  SEO_CONFIG_SLUG,
  ANNOUNCEMENT_CONFIG_SLUG,
  DEFAULT_NAV_CONFIG,
  DEFAULT_FOOTER_CONFIG,
  DEFAULT_SEO_CONFIG,
  DEFAULT_ANNOUNCEMENT_CONFIG,
  parseNavConfig,
  parseFooterConfig,
  parseSeoConfig,
  parseAnnouncementConfig,
  isAnnouncementLive,
  validateSiteLinks,
  type NavConfig,
  type FooterConfig,
  type SeoConfig,
  type AnnouncementConfig,
  type NavItem,
  type FooterLink,
  type SocialLink,
} from "@/lib/siteConfig";
import { sectionIndex } from "@/lib/adminNav";

type ContentPage = { slug: string; title: string; body: string };
type Tab = "nav" | "footer" | "seo" | "announcement";

const BG_OPTIONS: { value: string; label: string }[] = [
  { value: "bg-slate-900", label: "Slate (default)" },
  { value: "bg-pink-600", label: "Pink" },
  { value: "bg-emerald-600", label: "Emerald" },
  { value: "bg-amber-600", label: "Amber" },
  { value: "bg-indigo-600", label: "Indigo" },
  { value: "bg-rose-600", label: "Rose" },
];

export default function NavFooterSeoEditor() {
  const [tab, setTab] = useState<Tab>("nav");
  const [nav, setNav] = useState<NavConfig>(DEFAULT_NAV_CONFIG);
  const [footer, setFooter] = useState<FooterConfig>(DEFAULT_FOOTER_CONFIG);
  const [seo, setSeo] = useState<SeoConfig>(DEFAULT_SEO_CONFIG);
  const [announcement, setAnnouncement] = useState<AnnouncementConfig>(DEFAULT_ANNOUNCEMENT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [navRes, footerRes, seoRes, announcementRes] = await Promise.all([
        adminFetch(`/api/content?slug=${encodeURIComponent(NAV_CONFIG_SLUG)}`),
        adminFetch(`/api/content?slug=${encodeURIComponent(FOOTER_CONFIG_SLUG)}`),
        adminFetch(`/api/content?slug=${encodeURIComponent(SEO_CONFIG_SLUG)}`),
        adminFetch(`/api/content?slug=${encodeURIComponent(ANNOUNCEMENT_CONFIG_SLUG)}`),
      ]);
      const navPage = (await navRes.json().catch(() => ({})))?.page as ContentPage | undefined;
      const footerPage = (await footerRes.json().catch(() => ({})))?.page as ContentPage | undefined;
      const seoPage = (await seoRes.json().catch(() => ({})))?.page as ContentPage | undefined;
      const announcementPage = (await announcementRes.json().catch(() => ({})))?.page as ContentPage | undefined;
      setNav(parseNavConfig(navPage?.body));
      setFooter(parseFooterConfig(footerPage?.body));
      setSeo(parseSeoConfig(seoPage?.body));
      setAnnouncement(parseAnnouncementConfig(announcementPage?.body));
    } catch (e: any) {
      setError(e?.message || "Could not load navigation/footer/SEO content.");
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

  async function saveAll(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    setError("");

    const linkErrors = validateSiteLinks(nav, footer, announcement);
    if (linkErrors.length > 0) {
      setError(linkErrors[0].message + (linkErrors.length > 1 ? ` (and ${linkErrors.length - 1} more issue${linkErrors.length - 1 === 1 ? "" : "s"} — check the highlighted sections.)` : ""));
      setSaving(false);
      return;
    }

    try {
      const results = await Promise.all([
        adminFetch("/api/content", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: NAV_CONFIG_SLUG, title: "Main Navigation", body: JSON.stringify(nav, null, 2) }),
        }),
        adminFetch("/api/content", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: FOOTER_CONFIG_SLUG, title: "Footer", body: JSON.stringify(footer, null, 2) }),
        }),
        adminFetch("/api/content", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: SEO_CONFIG_SLUG, title: "Site SEO", body: JSON.stringify(seo, null, 2) }),
        }),
        adminFetch("/api/content", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: ANNOUNCEMENT_CONFIG_SLUG, title: "Announcement Bar", body: JSON.stringify(announcement, null, 2) }),
        }),
      ]);
      if (results.some((r) => !r.ok)) throw new Error("One or more sections failed to save.");
      setMsg("Saved. Changes are live on next page refresh.");
    } catch (e: any) {
      setError(e?.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  // ---- Nav item helpers ----
  function addNavItem() {
    if (nav.items.length >= 12) return;
    setNav({ ...nav, items: [...nav.items, { label: "New link", href: "/", icon: "🔗" }] });
  }
  function updateNavItem(i: number, key: keyof NavItem, value: string) {
    const next = [...nav.items];
    next[i] = { ...next[i], [key]: value };
    setNav({ ...nav, items: next });
  }
  function removeNavItem(i: number) {
    setNav({ ...nav, items: nav.items.filter((_, idx) => idx !== i) });
  }
  function moveNavItem(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= nav.items.length) return;
    const next = [...nav.items];
    [next[i], next[j]] = [next[j], next[i]];
    setNav({ ...nav, items: next });
  }

  // ---- Footer link helpers (generic for shop/company lists) ----
  function addFooterLink(list: "shopLinks" | "companyLinks") {
    setFooter({ ...footer, [list]: [...footer[list], { label: "New link", href: "/" }] });
  }
  function updateFooterLink(list: "shopLinks" | "companyLinks", i: number, key: keyof FooterLink, value: string) {
    const next = [...footer[list]];
    next[i] = { ...next[i], [key]: value };
    setFooter({ ...footer, [list]: next });
  }
  function removeFooterLink(list: "shopLinks" | "companyLinks", i: number) {
    setFooter({ ...footer, [list]: footer[list].filter((_, idx) => idx !== i) });
  }

  // ---- Social link helpers ----
  function addSocialLink() {
    if (footer.socialLinks.length >= 8) return;
    setFooter({ ...footer, socialLinks: [...footer.socialLinks, { platform: "Instagram", url: "https://" }] });
  }
  function updateSocialLink(i: number, key: keyof SocialLink, value: string) {
    const next = [...footer.socialLinks];
    next[i] = { ...next[i], [key]: value };
    setFooter({ ...footer, socialLinks: next });
  }
  function removeSocialLink(i: number) {
    setFooter({ ...footer, socialLinks: footer.socialLinks.filter((_, idx) => idx !== i) });
  }

  if (loading) {
    return <p className="font-mono-adm text-[12px] text-[var(--adm-muted)]">Loading navigation, footer & SEO...</p>;
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="adm-eyebrow">{sectionIndex("navfooterseo")} / Storefront</p>
          <h1 className="mt-2 font-display-adm text-[28px] leading-tight sm:text-[36px]">Navigation, footer & SEO.</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[var(--adm-muted)]">
            Controls the top nav bar, footer link columns, social icons, and the site title/description search engines and social shares use. None of this required touching code before — it does now.
          </p>
        </div>
        <button onClick={load} className="adm-btn !py-1.5 !text-[12px]">Reload</button>
      </div>
      <hr className="adm-rule mb-6" />

      <div className="mb-5 flex flex-wrap gap-1.5">
        <TabPill active={tab === "nav"} onClick={() => setTab("nav")}>Main navigation</TabPill>
        <TabPill active={tab === "footer"} onClick={() => setTab("footer")}>Footer</TabPill>
        <TabPill active={tab === "seo"} onClick={() => setTab("seo")}>SEO & metadata</TabPill>
        <TabPill active={tab === "announcement"} onClick={() => setTab("announcement")}>Announcement bar</TabPill>
      </div>

      <form onSubmit={saveAll} className="space-y-5">
        {tab === "nav" && (
          <Card title="Top navigation bar" subtitle="Shown in the header and mobile menu. Order here is the display order.">
            <div className="space-y-3">
              {nav.items.map((item, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 rounded-2xl border border-[var(--adm-line)] bg-[#fffdf7] p-3 sm:grid-cols-[60px_1fr_1.4fr_auto]">
                  <Field label="Icon">
                    <input value={item.icon} onChange={(e) => updateNavItem(i, "icon", e.target.value)} className="adm-input text-center" />
                  </Field>
                  <Field label="Label">
                    <input value={item.label} onChange={(e) => updateNavItem(i, "label", e.target.value)} className="adm-input" />
                  </Field>
                  <Field label="Link (path or /products?category=slug)">
                    <input value={item.href} onChange={(e) => updateNavItem(i, "href", e.target.value)} className="adm-input font-mono-adm !text-[12px]" />
                  </Field>
                  <div className="flex items-end gap-1.5">
                    <button type="button" onClick={() => moveNavItem(i, -1)} disabled={i === 0} className="adm-btn !py-1.5 !px-2.5 !text-[12px] disabled:opacity-30"><ArrowUp aria-hidden className="h-3 w-3" /><span className="sr-only">Move up</span></button>
                    <button type="button" onClick={() => moveNavItem(i, 1)} disabled={i === nav.items.length - 1} className="adm-btn !py-1.5 !px-2.5 !text-[12px] disabled:opacity-30"><ArrowDown aria-hidden className="h-3 w-3" /><span className="sr-only">Move down</span></button>
                    <button type="button" onClick={() => removeNavItem(i)} className="adm-btn !py-1.5 !px-2.5 !text-[12px] !text-[var(--adm-rose)]" aria-label="Remove"><X aria-hidden className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={addNavItem} disabled={nav.items.length >= 12} className="adm-btn mt-3 !py-1.5 !text-[12px] disabled:opacity-40">
              + Add nav item
            </button>
            <p className="mt-2 font-mono-adm text-[11px] text-[var(--adm-muted)]">
              Tip: if the link matches a category (e.g. /products?category=mobiles), the live category name is shown instead of the label above.
            </p>
          </Card>
        )}

        {tab === "footer" && (
          <>
            <Card title="Footer link columns" subtitle="The 'All Products' link and your live category list always appear first in Shop — these are added below them.">
              <div className="grid gap-5 lg:grid-cols-2">
                <FooterLinkListEditor
                  heading={footer.shopHeading}
                  onHeadingChange={(v) => setFooter({ ...footer, shopHeading: v })}
                  links={footer.shopLinks}
                  onAdd={() => addFooterLink("shopLinks")}
                  onUpdate={(i, key, value) => updateFooterLink("shopLinks", i, key, value)}
                  onRemove={(i) => removeFooterLink("shopLinks", i)}
                  columnLabel="Shop column"
                />
                <FooterLinkListEditor
                  heading={footer.companyHeading}
                  onHeadingChange={(v) => setFooter({ ...footer, companyHeading: v })}
                  links={footer.companyLinks}
                  onAdd={() => addFooterLink("companyLinks")}
                  onUpdate={(i, key, value) => updateFooterLink("companyLinks", i, key, value)}
                  onRemove={(i) => removeFooterLink("companyLinks", i)}
                  columnLabel="Company column"
                />
              </div>
            </Card>

            <Card title="Stores column & newsletter" subtitle="Outlet cards themselves are managed under Storefront > Outlets.">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Stores column heading">
                  <input value={footer.storesHeading} onChange={(e) => setFooter({ ...footer, storesHeading: e.target.value })} className="adm-input" />
                </Field>
                <Field label="Newsletter prompt text">
                  <input value={footer.newsletterLabel} onChange={(e) => setFooter({ ...footer, newsletterLabel: e.target.value })} className="adm-input" />
                </Field>
              </div>
              <div className="mt-3">
                <Field label="Copyright line (after the legal name & year)">
                  <input value={footer.copyrightText} onChange={(e) => setFooter({ ...footer, copyrightText: e.target.value })} className="adm-input" />
                </Field>
              </div>
            </Card>

            <Card title="Social links" subtitle="Shown as small icons in the footer's first column. Leave empty to hide.">
              <div className="space-y-3">
                {footer.socialLinks.map((link, i) => (
                  <div key={i} className="grid grid-cols-1 gap-2 rounded-2xl border border-[var(--adm-line)] bg-[#fffdf7] p-3 sm:grid-cols-[1fr_2fr_auto]">
                    <Field label="Platform">
                      <input value={link.platform} onChange={(e) => updateSocialLink(i, "platform", e.target.value)} className="adm-input" placeholder="Instagram" />
                    </Field>
                    <Field label="URL">
                      <input value={link.url} onChange={(e) => updateSocialLink(i, "url", e.target.value)} className="adm-input font-mono-adm !text-[12px]" placeholder="https://instagram.com/..." />
                    </Field>
                    <div className="flex items-end">
                      <button type="button" onClick={() => removeSocialLink(i)} className="adm-btn !py-1.5 !px-2.5 !text-[12px] !text-[var(--adm-rose)]" aria-label="Remove"><X aria-hidden className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addSocialLink} disabled={footer.socialLinks.length >= 8} className="adm-btn mt-3 !py-1.5 !text-[12px] disabled:opacity-40">
                + Add social link
              </button>
            </Card>
          </>
        )}

        {tab === "seo" && (
          <Card title="Search & social preview" subtitle="Controls the browser tab title, search-engine snippet, and how the site looks when shared on WhatsApp, X, etc.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Site name">
                <input value={seo.siteName} onChange={(e) => setSeo({ ...seo, siteName: e.target.value })} className="adm-input" />
              </Field>
              <Field label="Title template (%s = page title)">
                <input value={seo.titleTemplate} onChange={(e) => setSeo({ ...seo, titleTemplate: e.target.value })} className="adm-input font-mono-adm !text-[12px]" />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="Default page title">
                <input value={seo.siteTitle} onChange={(e) => setSeo({ ...seo, siteTitle: e.target.value })} className="adm-input" />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="Meta description (search engine snippet)">
                <textarea rows={3} value={seo.metaDescription} onChange={(e) => setSeo({ ...seo, metaDescription: e.target.value })} className="adm-input !leading-relaxed" />
              </Field>
            </div>
            <div className="mt-4 rounded-2xl border border-[var(--adm-line)] bg-[#fffdf7] p-4">
              <p className="adm-eyebrow">Social share preview (Open Graph)</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Share title">
                  <input value={seo.ogTitle} onChange={(e) => setSeo({ ...seo, ogTitle: e.target.value })} className="adm-input" />
                </Field>
                <Field label="Share image URL">
                  <input value={seo.ogImage} onChange={(e) => setSeo({ ...seo, ogImage: e.target.value })} className="adm-input font-mono-adm !text-[12px]" placeholder="https://..." />
                </Field>
              </div>
              <div className="mt-3">
                <Field label="Share description">
                  <textarea rows={2} value={seo.ogDescription} onChange={(e) => setSeo({ ...seo, ogDescription: e.target.value })} className="adm-input !leading-relaxed" />
                </Field>
              </div>
            </div>
          </Card>
        )}

        {tab === "announcement" && (
          <Card title="Announcement bar" subtitle="A single dismissible strip above the header — separate from the always-on scrolling marquee. Good for festival sales, temporary closures, or one-off notices.">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-[13px] font-semibold">
                <input
                  type="checkbox"
                  checked={announcement.active}
                  onChange={(e) => setAnnouncement({ ...announcement, active: e.target.checked })}
                  className="h-4 w-4"
                />
                Enabled
              </label>
              <label className="ml-4 flex items-center gap-2 text-[13px] font-semibold">
                <input
                  type="checkbox"
                  checked={announcement.dismissible}
                  onChange={(e) => setAnnouncement({ ...announcement, dismissible: e.target.checked })}
                  className="h-4 w-4"
                />
                Visitors can dismiss it
              </label>
            </div>

            <div className="mt-4">
              <Field label="Message">
                <textarea rows={2} value={announcement.text} onChange={(e) => setAnnouncement({ ...announcement, text: e.target.value })} className="adm-input !leading-relaxed" placeholder="e.g. Independence Day Sale — flat 10% off accessories, this weekend only." />
              </Field>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Link label (optional)">
                <input value={announcement.linkLabel} onChange={(e) => setAnnouncement({ ...announcement, linkLabel: e.target.value })} className="adm-input" placeholder="Shop now" />
              </Field>
              <Field label="Link destination (optional)">
                <input value={announcement.linkHref} onChange={(e) => setAnnouncement({ ...announcement, linkHref: e.target.value })} className="adm-input font-mono-adm !text-[12px]" placeholder="/products" />
              </Field>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Field label="Start date (optional)">
                <input type="date" value={announcement.startDate} onChange={(e) => setAnnouncement({ ...announcement, startDate: e.target.value })} className="adm-input" />
              </Field>
              <Field label="End date (optional)">
                <input type="date" value={announcement.endDate} onChange={(e) => setAnnouncement({ ...announcement, endDate: e.target.value })} className="adm-input" />
              </Field>
              <Field label="Bar color">
                <select value={announcement.backgroundColor} onChange={(e) => setAnnouncement({ ...announcement, backgroundColor: e.target.value })} className="adm-input">
                  {BG_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </Field>
            </div>

            <p className="mt-2 font-mono-adm text-[11px] text-[var(--adm-muted)]">
              Leave dates empty to run indefinitely. With an end date, the bar stops showing automatically the day after — no need to come back and disable it. It still only appears when &quot;Enabled&quot; is checked.
            </p>

            {announcement.text && (
              <div className="mt-4">
                <p className="adm-eyebrow mb-2">Preview</p>
                <div className={`relative w-full rounded-xl ${announcement.backgroundColor || "bg-slate-900"} px-4 py-2 text-center text-[12px] font-semibold text-white`}>
                  {announcement.text}
                  {announcement.linkLabel && <span className="ml-2 underline underline-offset-2">{announcement.linkLabel}</span>}
                </div>
                <p className="mt-1.5 font-mono-adm text-[11px] text-[var(--adm-muted)]">
                  {isAnnouncementLive(announcement) ? "Currently live on the site." : "Not currently showing (disabled, empty, or outside its date range)."}
                </p>
              </div>
            )}
          </Card>
        )}

        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-[var(--adm-line)] bg-[var(--adm-paper)]/95 px-4 py-3 shadow-lg backdrop-blur">
          {error && <span className="text-[12px] font-bold text-[var(--adm-rose)]">{error}</span>}
          {msg && <span className="adm-pill adm-pill--good">{msg}</span>}
          <button type="submit" disabled={saving} className="adm-btn adm-btn--primary">
            {saving ? "Saving..." : "Save all"}
          </button>
        </div>
      </form>
    </div>
  );
}

function FooterLinkListEditor({
  heading,
  onHeadingChange,
  links,
  onAdd,
  onUpdate,
  onRemove,
  columnLabel,
}: {
  heading: string;
  onHeadingChange: (v: string) => void;
  links: FooterLink[];
  onAdd: () => void;
  onUpdate: (i: number, key: keyof FooterLink, value: string) => void;
  onRemove: (i: number) => void;
  columnLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--adm-line)] bg-[#fffdf7] p-4">
      <p className="adm-eyebrow">{columnLabel}</p>
      <div className="mt-3">
        <Field label="Column heading">
          <input value={heading} onChange={(e) => onHeadingChange(e.target.value)} className="adm-input" />
        </Field>
      </div>
      <div className="mt-3 space-y-2">
        {links.map((link, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
            <input value={link.label} onChange={(e) => onUpdate(i, "label", e.target.value)} className="adm-input !text-[12px]" placeholder="Label" />
            <input value={link.href} onChange={(e) => onUpdate(i, "href", e.target.value)} className="adm-input font-mono-adm !text-[11px]" placeholder="/path" />
            <button type="button" onClick={() => onRemove(i)} className="adm-btn !py-1.5 !px-2.5 !text-[12px] !text-[var(--adm-rose)]" aria-label="Remove"><X aria-hidden className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>
      <button type="button" onClick={onAdd} disabled={links.length >= 12} className="adm-btn mt-3 !py-1.5 !text-[12px] disabled:opacity-40">
        + Add link
      </button>
    </div>
  );
}

function TabPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-[12px] font-semibold transition ${active ? "border-[var(--adm-ink)] bg-[var(--adm-ink)] text-[var(--adm-paper)]" : "border-[var(--adm-line-strong)] bg-[#fffdf7] text-[var(--adm-muted)] hover:border-[var(--adm-ink)] hover:text-[var(--adm-ink)]"}`}
    >
      {children}
    </button>
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