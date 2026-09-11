import Link from "next/link";
import SectionHead from "@/components/SectionHead";
import Reveal from "@/components/Reveal";
import type { UseCaseTileConfig } from "@/lib/homepageConfig";

/**
 * "Shop by use case" — lifestyle entry points (Gaming, College, Work,
 * Camera…) that deep-link into the real /products filter system. The
 * tiles are configured in Admin > Homepage CMS (label, tagline, emoji,
 * filter query, colour), so the owner can retarget them for a season
 * (e.g. "Exam Season", "Wedding Gifts") without code. Tiles carry no
 * prices or claims — they are navigation, so nothing here can go stale
 * or contradict the database.
 */

export default function UseCaseTiles({
  eyebrow,
  title,
  tiles,
}: {
  eyebrow: string;
  title: string;
  tiles: UseCaseTileConfig[];
}) {
  if (tiles.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6">
      <SectionHead eyebrow={eyebrow} title={title} accent="brand" />
      <Reveal>
        <div className="stagger-in mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map((t, i) => (
            <Link
              key={t.label}
              href={`/products?${t.query}`}
              className={`group relative overflow-hidden rounded-3xl bg-gradient-to-br ${t.tone} p-4 text-white transition hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-900/15 sm:p-5 ${
                i === 0 ? "col-span-2 sm:min-h-44 lg:col-span-1" : "min-h-36 sm:min-h-44"
              }`}
            >
              {/* Quiet texture instead of a flat gradient slab */}
              <span
                aria-hidden
                className="absolute -right-6 -top-8 text-[96px] leading-none opacity-20 transition-transform duration-500 group-hover:scale-110 group-hover:opacity-30"
              >
                {t.emoji}
              </span>
              <span aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.14)_1px,transparent_0)] [background-size:22px_22px] opacity-40" />
              <div className="relative flex h-full flex-col">
                <span aria-hidden className="text-2xl">{t.emoji}</span>
                <h3 className="mt-2 text-lg font-black leading-tight tracking-tight sm:text-xl">{t.label}</h3>
                <p className="mt-1 max-w-56 text-xs font-semibold leading-relaxed text-white/80">{t.tagline}</p>
                <span className="mt-auto inline-flex items-center gap-1.5 pt-3 text-xs font-black uppercase tracking-wider text-white/90">
                  Shop this <span className="nudge-x" aria-hidden>→</span>
                </span>
              </div>
            </Link>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
