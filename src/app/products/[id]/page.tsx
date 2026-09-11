import AppShell from "@/components/AppShell";
import BackButton from "@/components/BackButton";
import ProductDetailClient from "@/components/ProductDetailClient";
import { getProductBySlug } from "@/lib/queries";
import { safeJsonLd } from "@/lib/safeJsonLd";
import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { siteUrl } from "@/lib/env";
import { headers } from "next/headers";

// Was force-dynamic. This page has no session/cookie dependency (cart,
// wishlist and compare state are all fetched client-side), so it's safe to
// cache per-slug. Kept short (30s) rather than a longer ISR window
// specifically because stock and price are purchase-critical here — a
// stale "in stock" or an old price surviving too long on a PDP is a worse
// outcome than the extra DB reads a longer window would save.
export const revalidate = 30;

// Deduped per-request: generateMetadata and the page component both need
// this data, and without cache() it would hit the DB twice per request.
const getProductCached = cache((slug: string) => getProductBySlug(slug));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await getProductCached(id);

  if (!data) {
    // Unknown product: don't let search engines index a "not found" body
    // that was served with a 200.
    return { title: "Product not found", robots: { index: false, follow: false } };
  }

  const p = data.product as any;
  const title = `${p.name} — Buy at ₹${Number(p.mop).toLocaleString("en-IN")}`;
  const description =
    (p.description && String(p.description).slice(0, 155)) ||
    `${p.brand ? p.brand + " " : ""}${p.name} — genuine product, honest pricing at SMS Stores.`;
  const image = p.primaryImage || (p.images && p.images[0]) || undefined;
  const base = siteUrl;
  const canonical = `${base}/products/${p.slug}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: "website",
      url: canonical,
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getProductCached(id);

  // A missing product used to render a friendly "not found" panel with an
  // HTTP 200, which reads as a real page to crawlers and to anything else
  // that checks the status rather than the body. notFound() serves the same
  // kind of message from app/not-found.tsx with a genuine 404.
  if (!data) notFound();

  const p = data.product as any;
  const revs = (data.reviews as any[]) || [];
  const variants = (data.variants as any[]) || [];
  const base = siteUrl;
  const avgRating = revs.length ? revs.reduce((s, r) => s + r.rating, 0) / revs.length : 0;
  const image = p.primaryImage || (p.images && p.images[0]) || undefined;
  const url = `${base}/products/${p.slug}`;

  // Availability and price range come from the real variant rows when the
  // product has them, so structured data can never advertise a price or a
  // stock state that the buy box would refuse.
  const sellableVariants = variants.filter((v) => v.available !== false && Number(v.stock) > 0);
  const inStock = variants.length ? sellableVariants.length > 0 : Number(p.stock) > 0;
  const variantPrices = variants.map((v) => Number(v.mop)).filter((n) => n > 0);
  const lowPrice = variantPrices.length ? Math.min(...variantPrices) : Number(p.mop);
  const highPrice = variantPrices.length ? Math.max(...variantPrices) : Number(p.mop);
  const galleryImages = (((p.media as any[]) || [])
    .filter((m) => m.mediaType !== "video")
    .map((m) => m.url) as string[]);
  const images = galleryImages.length ? galleryImages.slice(0, 8) : image ? [image] : undefined;
  const availability = inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";

  const jsonLd: Record<string, any> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: (p.description && String(p.description).slice(0, 500)) || undefined,
    sku: p.sku || undefined,
    mpn: p.sku || undefined,
    category: p.category?.name || undefined,
    brand: p.brand ? { "@type": "Brand", name: p.brand } : undefined,
    image: images,
    offers:
      lowPrice !== highPrice
        ? {
            "@type": "AggregateOffer",
            url,
            priceCurrency: "INR",
            lowPrice,
            highPrice,
            offerCount: variants.length,
            availability,
            itemCondition: "https://schema.org/NewCondition",
          }
        : {
            "@type": "Offer",
            url,
            priceCurrency: "INR",
            price: lowPrice,
            availability,
            itemCondition: "https://schema.org/NewCondition",
          },
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: base },
      ...(p.category?.name
        ? [{
            "@type": "ListItem",
            position: 2,
            name: p.category.name,
            item: `${base}/products?category=${p.category.slug}`,
          }]
        : []),
      { "@type": "ListItem", position: p.category?.name ? 3 : 2, name: p.name, item: url },
    ],
  };
  if (revs.length > 0) {
    jsonLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: avgRating.toFixed(1),
      reviewCount: revs.length,
    };
  }

  // See the note in layout.tsx: hand-written script tags need the CSP nonce.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <AppShell>
      <script
        type="application/ld+json"
        nonce={nonce}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <script
        type="application/ld+json"
        nonce={nonce}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbLd) }}
      />
      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6">
        <BackButton />
      </div>
      <ProductDetailClient
        product={data.product as any}
        images={data.product.images as string[]}
        media={data.product.media}
        reviews={data.reviews as any}
        related={data.related as any}
        sameBrand={data.sameBrand as any}
        variants={data.variants as any}
        offers={data.offers as any}
        questions={data.questions as any}
      />
    </AppShell>
  );
}