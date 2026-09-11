/**
 * Catalogue Health — DB access layer: load the catalogue in the shape the
 * pure classifier consumes, compute the owner-facing summary, and keep the
 * catalogue_issues table in sync with what a scan actually found.
 */

import { db } from "@/db";
import {
  products,
  productImages,
  productVariants,
  categories,
  catalogueIssues,
  catalogueSettings,
  type CatalogueSettings,
} from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  type CatProduct,
  scoreProduct,
  productImageStatus,
  findDuplicateGroups,
  publishBlockers,
  type RequiredField,
} from "./classify";

// ---------- settings ----------

export async function getCatalogueSettings(): Promise<CatalogueSettings> {
  const [s] = await db.select().from(catalogueSettings).where(eq(catalogueSettings.id, 1));
  if (s) return s;
  const [created] = await db.insert(catalogueSettings).values({ id: 1 }).onConflictDoNothing().returning();
  if (created) return created;
  const [again] = await db.select().from(catalogueSettings).where(eq(catalogueSettings.id, 1));
  return again;
}

// ---------- scope ----------

export type JobScope =
  | { kind: "all" }
  | { kind: "incomplete" }
  | { kind: "category"; ids: number[] }
  | { kind: "brand"; brands: string[] }
  | { kind: "products"; ids: number[] };

// ---------- loading ----------

export async function loadCatalogue(scope: JobScope = { kind: "all" }): Promise<{
  items: CatProduct[];
  categoryNames: Map<number, string>;
}> {
  let where = undefined;
  if (scope.kind === "category" && scope.ids.length) where = inArray(products.categoryId, scope.ids);
  if (scope.kind === "products" && scope.ids.length) where = inArray(products.id, scope.ids);
  if (scope.kind === "brand" && scope.brands.length) where = inArray(products.brand, scope.brands);

  const rows = where ? await db.select().from(products).where(where) : await db.select().from(products);
  const ids = rows.map((r) => r.id);

  const imgs = ids.length
    ? await db.select().from(productImages).where(inArray(productImages.productId, ids))
    : [];
  const vars = ids.length
    ? await db.select().from(productVariants).where(inArray(productVariants.productId, ids))
    : [];
  const cats = await db.select({ id: categories.id, name: categories.name }).from(categories);

  const imgsByProduct = new Map<number, typeof imgs>();
  for (const i of imgs) {
    const list = imgsByProduct.get(i.productId) || [];
    list.push(i);
    imgsByProduct.set(i.productId, list);
  }
  const varsByProduct = new Map<number, typeof vars>();
  for (const v of vars) {
    const list = varsByProduct.get(v.productId) || [];
    list.push(v);
    varsByProduct.set(v.productId, list);
  }

  const items: CatProduct[] = rows.map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    sku: p.sku,
    barcode: p.barcode,
    categoryId: p.categoryId,
    subcategory: p.subcategory,
    description: p.description,
    specifications: p.specifications,
    warranty: p.warranty,
    seoTitle: p.seoTitle,
    metaDescription: p.metaDescription,
    mrp: Number(p.mrp),
    mop: Number(p.mop),
    stock: p.stock,
    status: p.status,
    imageSource: p.imageSource,
    images: (imgsByProduct.get(p.id) || [])
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((i) => ({
        id: i.id,
        dataUrl: i.dataUrl,
        alt: i.alt,
        sortOrder: i.sortOrder,
        variantColor: i.variantColor,
        mediaType: i.mediaType,
      })),
    variants: (varsByProduct.get(p.id) || []).map((v) => ({
      id: v.id,
      color: v.color,
      storage: v.storage,
      ram: v.ram,
      mrp: Number(v.mrp),
      mop: Number(v.mop),
      stock: v.stock,
      sku: v.sku,
      image: v.image,
      available: v.available,
    })),
  }));

  return { items, categoryNames: new Map(cats.map((c) => [c.id, c.name])) };
}

// ---------- summary ----------

export type HealthSummary = {
  healthPct: number;
  totalProducts: number;
  complete: number;
  missingImages: number;
  placeholderImages: number;
  brokenImages: number; // from open broken_image issues (network truth)
  missingData: number;
  duplicateCandidates: number;
  needsReview: number; // open needs_review issues
  autoFixedRecently: number;
  imagesVerified: number;
  notPublishable: number;
  avgQuality: number;
};

export async function computeHealthSummary(): Promise<HealthSummary> {
  const { items } = await loadCatalogue({ kind: "all" });
  const settings = await getCatalogueSettings();
  const required = (settings.requiredPublishFields as RequiredField[]) || [];

  let complete = 0, missingImages = 0, placeholders = 0, missingData = 0, notPublishable = 0;
  let imagesVerified = 0, qualitySum = 0;

  for (const p of items) {
    const q = scoreProduct(p);
    qualitySum += q.score;
    const img = productImageStatus(p);
    if (img.status === "missing") missingImages++;
    else if (img.status === "placeholder") placeholders++;
    else imagesVerified += p.images.filter((i) => i.mediaType !== "video").length;
    if (q.classification === "needs_data") missingData++;
    if (q.classification === "complete") complete++;
    if (p.status === "active" && publishBlockers(p, required).length > 0) notPublishable++;
  }

  const dupGroups = findDuplicateGroups(items);

  const issueCounts = await db
    .select({ status: catalogueIssues.status, type: catalogueIssues.type, n: sql<number>`count(*)::int` })
    .from(catalogueIssues)
    .groupBy(catalogueIssues.status, catalogueIssues.type);

  let needsReview = 0, brokenImages = 0, autoFixedRecently = 0;
  for (const r of issueCounts) {
    if (r.status === "needs_review") needsReview += r.n;
    if (r.status === "open" && r.type === "broken_image") brokenImages += r.n;
    if (r.status === "auto_fixed") autoFixedRecently += r.n;
  }

  const total = items.length || 1;
  return {
    healthPct: Math.round(qualitySum / total),
    totalProducts: items.length,
    complete,
    missingImages,
    placeholderImages: placeholders,
    brokenImages,
    missingData,
    duplicateCandidates: dupGroups.reduce((s, g) => s + g.ids.length, 0),
    needsReview,
    autoFixedRecently,
    imagesVerified,
    notPublishable,
    avgQuality: Math.round(qualitySum / total),
  };
}

// ---------- issue persistence ----------

export type IssueUpsert = {
  productId: number;
  variantId?: number | null;
  imageId?: number | null;
  type: string;
  severity?: string;
  status: "open" | "needs_review" | "auto_fixed";
  confidence?: number;
  summary: string;
  productName: string;
  proposal?: unknown;
  before?: unknown;
  after?: unknown;
  jobId?: number | null;
};

export function issueFingerprint(i: Pick<IssueUpsert, "productId" | "variantId" | "type">): string {
  return `${i.type}:${i.productId}:${i.variantId ?? 0}`;
}

/**
 * Insert or refresh an issue. The partial unique index on fingerprint (open/
 * needs_review rows only) makes this an upsert for live problems while
 * resolved history is left alone.
 */
export async function upsertIssue(i: IssueUpsert): Promise<number> {
  const fingerprint = issueFingerprint(i);

  // Respect a recent human "no": if the owner rejected this exact suggestion
  // in the last 30 days, don't put the same card back in their queue.
  if (i.status === "needs_review") {
    const [rejected] = await db
      .select({ id: catalogueIssues.id, resolvedAt: catalogueIssues.resolvedAt })
      .from(catalogueIssues)
      .where(and(eq(catalogueIssues.fingerprint, fingerprint), eq(catalogueIssues.status, "rejected")))
      .orderBy(sql`${catalogueIssues.id} desc`)
      .limit(1);
    if (rejected?.resolvedAt && Date.now() - rejected.resolvedAt.getTime() < 30 * 24 * 3600 * 1000) {
      return rejected.id;
    }
  }
  const [existing] = await db
    .select({ id: catalogueIssues.id })
    .from(catalogueIssues)
    .where(and(eq(catalogueIssues.fingerprint, fingerprint), inArray(catalogueIssues.status, ["open", "needs_review"])));

  if (existing) {
    await db
      .update(catalogueIssues)
      .set({
        status: i.status,
        severity: i.severity || "warning",
        confidence: i.confidence ?? 0,
        summary: i.summary,
        productName: i.productName,
        proposal: i.proposal ?? {},
        before: i.before as object | undefined,
        after: i.after as object | undefined,
        jobId: i.jobId ?? null,
        ...(i.status === "auto_fixed" ? { resolvedAt: new Date(), resolvedBy: "auto" } : {}),
      })
      .where(eq(catalogueIssues.id, existing.id));
    return existing.id;
  }

  const [row] = await db
    .insert(catalogueIssues)
    .values({
      productId: i.productId,
      variantId: i.variantId ?? null,
      imageId: i.imageId ?? null,
      type: i.type,
      severity: i.severity || "warning",
      status: i.status,
      confidence: i.confidence ?? 0,
      summary: i.summary,
      productName: i.productName,
      proposal: (i.proposal ?? {}) as object,
      before: i.before as object | undefined,
      after: i.after as object | undefined,
      jobId: i.jobId ?? null,
      fingerprint,
      ...(i.status === "auto_fixed" ? { resolvedAt: new Date(), resolvedBy: "auto" } : {}),
    })
    .returning({ id: catalogueIssues.id });
  return row.id;
}

/**
 * Close open issues for products the scan just covered that it did NOT
 * re-detect — the problem no longer exists (owner fixed it by hand, or an
 * auto-fix landed). Only open/needs_review rows are touched.
 */
export async function resolveStaleIssues(coveredProductIds: number[], liveFingerprints: Set<string>): Promise<number> {
  if (coveredProductIds.length === 0) return 0;
  const open = await db
    .select({ id: catalogueIssues.id, fingerprint: catalogueIssues.fingerprint })
    .from(catalogueIssues)
    .where(and(inArray(catalogueIssues.productId, coveredProductIds), inArray(catalogueIssues.status, ["open", "needs_review"])));
  const stale = open.filter((o) => !liveFingerprints.has(o.fingerprint));
  if (stale.length === 0) return 0;
  await db
    .update(catalogueIssues)
    .set({ status: "resolved", resolvedAt: new Date(), resolvedBy: "rescan" })
    .where(inArray(catalogueIssues.id, stale.map((s) => s.id)));
  return stale.length;
}
