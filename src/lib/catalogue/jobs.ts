/**
 * Catalogue background jobs — the engine behind "Fix My Catalogue",
 * "Complete Catalogue", post-import auto-enrichment and the daily check.
 *
 * Jobs run in-process, detached from the request that started them: the API
 * route inserts a catalogue_jobs row, kicks runCatalogueJob(id) WITHOUT
 * awaiting it, and returns the job id immediately. The browser polls the row.
 * Progress (processed/total, counters) is persisted every product, so the
 * owner can close the tab, and a deploy restart mid-run leaves a resumable
 * trail rather than a hung spinner: stale "running" rows (no heartbeat for
 * 3 minutes) are marked failed-with-resume-hint the next time anything asks.
 *
 * WHAT AUTO-FIX MAY TOUCH (and nothing else — spec §12/§26):
 *   products.seoTitle / metaDescription / specifications / description
 *   product_images.alt / new product_images rows / removal of a row the scan
 *   itself classified placeholder-or-broken, only after its replacement is
 *   stored. Variant thumbnails only when empty.
 * Stock, prices, SKUs, names, categories and status are NEVER written here.
 * Publishing (status) is only done by the explicit import/quick-add flows,
 * and only when the publish guard passes.
 */

import { db } from "@/db";
import { catalogueJobs, catalogueIssues, products, productImages } from "@/db/schema";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { createNotification } from "@/lib/notify";
import { reportError } from "@/lib/observability";
import {
  type CatProduct,
  buildAltText,
  buildDescription,
  buildMetaDescription,
  buildSeoTitle,
  buildSpecifications,
  classifyImageRef,
  findDuplicateGroups,
  missingFields,
  productImageStatus,
  scoreProduct,
} from "./classify";
import { checkImageUrl, findImageCandidates, imageSearchConfigured } from "./imageHunt";
import { attachImage, fetchRemoteImage, optimizeAndStore } from "./imageStore";
import {
  getCatalogueSettings,
  issueFingerprint,
  loadCatalogue,
  resolveStaleIssues,
  upsertIssue,
  type IssueUpsert,
  type JobScope,
} from "./health";

export type JobType = "scan" | "fix" | "enrich" | "daily_check";

export type JobCounters = {
  autoFixed: number;
  needsReview: number;
  complete: number;
  imagesImported: number;
  imagesReplaced: number;
  seoFilled: number;
  altFilled: number;
  specsFilled: number;
  descriptionsFilled: number;
  brokenFound: number;
  duplicatesFound: number;
  errors: number;
};

const zeroCounters = (): JobCounters => ({
  autoFixed: 0, needsReview: 0, complete: 0, imagesImported: 0, imagesReplaced: 0,
  seoFilled: 0, altFilled: 0, specsFilled: 0, descriptionsFilled: 0,
  brokenFound: 0, duplicatesFound: 0, errors: 0,
});

const STALE_MS = 3 * 60 * 1000;

/** Mark abandoned "running" jobs (dead process) as failed so the UI never shows a zombie spinner. */
export async function reapStaleJobs(): Promise<void> {
  await db
    .update(catalogueJobs)
    .set({ status: "failed", error: "Interrupted (server restarted mid-run). Run it again — completed work was saved.", finishedAt: new Date() })
    .where(and(eq(catalogueJobs.status, "running"), lt(catalogueJobs.heartbeatAt, new Date(Date.now() - STALE_MS))));
}

export async function getActiveJob(): Promise<{ id: number; type: string } | null> {
  await reapStaleJobs();
  const [j] = await db
    .select({ id: catalogueJobs.id, type: catalogueJobs.type })
    .from(catalogueJobs)
    .where(inArray(catalogueJobs.status, ["queued", "running"]))
    .limit(1);
  return j ?? null;
}

/** Create a job row and start it in the background. Returns the job id at once. */
export async function startCatalogueJob(args: {
  type: JobType;
  scope: JobScope;
  admin?: { id: number | null; name: string };
}): Promise<{ jobId: number }> {
  const [job] = await db
    .insert(catalogueJobs)
    .values({
      type: args.type,
      scope: args.scope,
      status: "queued",
      adminId: args.admin?.id ?? null,
      adminName: args.admin?.name ?? "system",
      counters: zeroCounters(),
    })
    .returning({ id: catalogueJobs.id });

  // Detached on purpose — the request returns now, the job carries on.
  runCatalogueJob(job.id).catch((e) => reportError(e, "catalogue/job"));
  return { jobId: job.id };
}

async function heartbeat(jobId: number, processed: number, counters: JobCounters) {
  await db
    .update(catalogueJobs)
    .set({ processedItems: processed, counters, heartbeatAt: new Date() })
    .where(eq(catalogueJobs.id, jobId));
}

async function isCancelled(jobId: number): Promise<boolean> {
  const [j] = await db.select({ status: catalogueJobs.status }).from(catalogueJobs).where(eq(catalogueJobs.id, jobId));
  return !j || j.status === "cancelled";
}

// ---------- the run ----------

export async function runCatalogueJob(jobId: number): Promise<void> {
  const [job] = await db.select().from(catalogueJobs).where(eq(catalogueJobs.id, jobId));
  if (!job || job.status !== "queued") return;

  await db
    .update(catalogueJobs)
    .set({ status: "running", startedAt: new Date(), heartbeatAt: new Date() })
    .where(eq(catalogueJobs.id, jobId));

  const counters = zeroCounters();
  try {
    const settings = await getCatalogueSettings();
    const scope = (job.scope || { kind: "all" }) as JobScope;
    const applyFixes = job.type !== "scan" && settings.autoFixEnabled;

    const { items, categoryNames } = await loadCatalogue(scope);
    const targets =
      scope.kind === "incomplete"
        ? items.filter((p) => scoreProduct(p).classification !== "complete")
        : items;

    await db.update(catalogueJobs).set({ totalItems: targets.length }).where(eq(catalogueJobs.id, jobId));

    const liveFingerprints = new Set<string>();
    let processed = 0;

    for (const p of targets) {
      if (await isCancelled(jobId)) return;
      try {
        await processProduct(p, {
          jobId,
          applyFixes,
          categoryName: categoryNames.get(p.categoryId) || "",
          autoApprove: settings.autoApproveThreshold,
          review: settings.reviewThreshold,
          extraDomains: (settings.officialDomains || {}) as Record<string, string[]>,
          counters,
          liveFingerprints,
        });
      } catch (e) {
        counters.errors += 1;
        reportError(e, "catalogue/processProduct", { productId: p.id });
      }
      processed += 1;
      if (processed % 1 === 0) await heartbeat(jobId, processed, counters);
    }

    // Duplicate pass — whole-scope view, suggestion only.
    const dupGroups = findDuplicateGroups(items);
    for (const g of dupGroups) {
      counters.duplicatesFound += g.ids.length;
      const primary = Math.min(...g.ids);
      const issue: IssueUpsert = {
        productId: primary,
        type: "duplicate",
        status: "needs_review",
        severity: "warning",
        confidence: g.reason === "sku" ? 90 : 75,
        summary:
          g.reason === "sku"
            ? `These products share the same SKU: ${g.names.join(" / ")}`
            : `These listings look like the same product: ${g.names.join(" / ")}`,
        productName: g.names[0] || "",
        proposal: { kind: "duplicate", ids: g.ids, names: g.names, reason: g.reason },
        jobId,
      };
      liveFingerprints.add(issueFingerprint(issue));
      await upsertIssue(issue);
      counters.needsReview += 1;
    }

    await resolveStaleIssues(targets.map((t) => t.id), liveFingerprints);

    const summary = {
      scanned: targets.length,
      searchConfigured: imageSearchConfigured(),
      ...counters,
    };
    await db
      .update(catalogueJobs)
      .set({ status: "completed", processedItems: processed, counters, summary, finishedAt: new Date(), heartbeatAt: new Date() })
      .where(eq(catalogueJobs.id, jobId));

    // One grouped notification per job (spec §20) — never one per image.
    if (job.type !== "scan") {
      const needAttention = counters.needsReview;
      await createNotification(
        "system",
        "Catalogue update completed",
        `${targets.length} products processed. ${counters.autoFixed} fixed automatically. ${needAttention} require review.`,
        "/admin/catalogue"
      );
    }
  } catch (e) {
    reportError(e, "catalogue/runJob", { jobId });
    await db
      .update(catalogueJobs)
      .set({ status: "failed", error: e instanceof Error ? e.message : "Unknown error", counters, finishedAt: new Date() })
      .where(eq(catalogueJobs.id, jobId));
  }
}

// ---------- per-product pipeline ----------

type Ctx = {
  jobId: number;
  applyFixes: boolean;
  categoryName: string;
  autoApprove: number;
  review: number;
  extraDomains: Record<string, string[]>;
  counters: JobCounters;
  liveFingerprints: Set<string>;
};

async function processProduct(p: CatProduct, ctx: Ctx): Promise<void> {
  const track = (i: IssueUpsert) => {
    ctx.liveFingerprints.add(issueFingerprint(i));
    return upsertIssue(i);
  };

  // ---- 1. Safe text fixes (derived from real fields only) ----
  if (ctx.applyFixes) {
    const updates: Partial<{ seoTitle: string; metaDescription: string; specifications: string; description: string }> = {};
    if (!p.seoTitle.trim()) {
      updates.seoTitle = buildSeoTitle(p, ctx.categoryName);
      ctx.counters.seoFilled += 1;
    }
    if (!p.metaDescription.trim()) {
      updates.metaDescription = buildMetaDescription(p, ctx.categoryName);
    }
    const specs = buildSpecifications(p);
    if (!p.specifications.trim() && specs.trim()) {
      updates.specifications = specs;
      ctx.counters.specsFilled += 1;
    }
    const desc = buildDescription(p, ctx.categoryName);
    if (!p.description.trim() && desc.trim()) {
      updates.description = desc;
      ctx.counters.descriptionsFilled += 1;
    }
    if (Object.keys(updates).length > 0) {
      await db.update(products).set(updates).where(eq(products.id, p.id));
      Object.assign(p, updates);
      ctx.counters.autoFixed += 1;
    }

    // Missing alt text on real images — always safe.
    for (const img of p.images) {
      if (img.mediaType !== "video" && !img.alt.trim() && classifyImageRef(img.dataUrl) !== "placeholder") {
        await db.update(productImages).set({ alt: buildAltText(p) }).where(eq(productImages.id, img.id));
        ctx.counters.altFilled += 1;
      }
    }
  }

  // ---- 2. Verify remote image URLs (network truth) ----
  const brokenIds: number[] = [];
  for (const img of p.images) {
    if (img.mediaType === "video") continue;
    if (classifyImageRef(img.dataUrl) === "needs_check") {
      const check = await checkImageUrl(img.dataUrl);
      if (!check.ok) brokenIds.push(img.id);
    }
  }
  if (brokenIds.length) ctx.counters.brokenFound += brokenIds.length;

  // ---- 3. Image status → hunt / queue ----
  const imgStatus = productImageStatus(p);
  const needsImage =
    imgStatus.status === "missing" ||
    imgStatus.status === "placeholder" ||
    brokenIds.length === p.images.filter((i) => i.mediaType !== "video").length && brokenIds.length > 0;

  if (needsImage) {
    const issueType =
      imgStatus.status === "missing" ? "missing_image" : imgStatus.status === "placeholder" ? "placeholder_image" : "broken_image";
    const replaceable = imgStatus.status === "placeholder" ? imgStatus.badImageIds[0] ?? null : brokenIds[0] ?? null;

    if (ctx.applyFixes) {
      const variant = p.variants.length === 1 ? p.variants[0] : null;
      const hunt = await findImageCandidates(p, variant, ctx.extraDomains);
      const best = hunt.candidates[0];

      if (best && best.confidence >= ctx.autoApprove) {
        // High-confidence official match → import automatically.
        try {
          const fetched = await fetchRemoteImage(best.url);
          const ref = await optimizeAndStore(fetched, `p${p.id}`);
          const res = await attachImage({
            productId: p.id,
            variantId: variant?.id ?? null,
            variantColor: variant?.color || "",
            ref,
            alt: buildAltText(p, variant),
            replaceImageId: replaceable,
          });
          ctx.counters.imagesImported += 1;
          if (res.replacedImageId) ctx.counters.imagesReplaced += 1;
          ctx.counters.autoFixed += 1;
          await track({
            productId: p.id,
            variantId: variant?.id ?? null,
            type: issueType,
            status: "auto_fixed",
            severity: "warning",
            confidence: best.confidence,
            summary: `Image imported automatically from ${best.sourceDomain || "official source"} (${best.confidence}% match).`,
            productName: p.name,
            proposal: { kind: "image", chosen: best, candidates: hunt.candidates.slice(0, 3) },
            before: { imageStatus: imgStatus.status, replacedImageId: res.replacedImageId },
            after: { imageRef: ref.startsWith("data:") ? "(stored in database)" : ref },
            jobId: ctx.jobId,
          });
          return; // image fixed; remaining checks refer to pre-fix state
        } catch (e) {
          // Download/verify failed → fall through to review with the candidates.
          reportError(e, "catalogue/imageImport", { productId: p.id });
        }
      }

      if (best && best.confidence >= ctx.review) {
        ctx.counters.needsReview += 1;
        await track({
          productId: p.id,
          type: issueType,
          status: "needs_review",
          severity: "warning",
          confidence: best.confidence,
          summary: `Found a possible image (${best.confidence}% match) — confirm it is the right product.`,
          productName: p.name,
          proposal: { kind: "image", candidates: hunt.candidates, replaceImageId: replaceable, note: hunt.note },
          jobId: ctx.jobId,
        });
        return;
      }

      // Nothing confident enough (or search unconfigured) — honest open issue.
      await track({
        productId: p.id,
        type: issueType,
        status: "open",
        severity: issueType === "missing_image" ? "critical" : "warning",
        confidence: best?.confidence ?? 0,
        summary:
          issueType === "missing_image"
            ? "No product image."
            : issueType === "placeholder_image"
              ? "Only a placeholder image."
              : "Image link is broken.",
        productName: p.name,
        proposal: { kind: "image", candidates: hunt.candidates, replaceImageId: replaceable, note: hunt.note },
        jobId: ctx.jobId,
      });
    } else {
      await track({
        productId: p.id,
        type: issueType,
        status: "open",
        severity: issueType === "missing_image" ? "critical" : "warning",
        summary:
          issueType === "missing_image" ? "No product image." : issueType === "placeholder_image" ? "Only a placeholder image." : "Image link is broken.",
        productName: p.name,
        proposal: { kind: "image" },
        jobId: ctx.jobId,
      });
    }
  } else if (brokenIds.length > 0) {
    // Some (not all) images broken — flag each for review, keep the good ones.
    ctx.counters.needsReview += 1;
    await track({
      productId: p.id,
      imageId: brokenIds[0],
      type: "broken_image",
      status: "needs_review",
      severity: "warning",
      summary: `${brokenIds.length} of ${p.images.length} gallery images no longer load.`,
      productName: p.name,
      proposal: { kind: "remove_broken", imageIds: brokenIds },
      jobId: ctx.jobId,
    });
  }

  // ---- 4. Data completeness ----
  const q = scoreProduct(p, { imageBroken: brokenIds.length > 0 });
  if (q.classification === "complete") {
    ctx.counters.complete += 1;
  } else if (q.classification === "needs_data") {
    const missing = missingFields(p);
    if (missing.length) {
      await track({
        productId: p.id,
        type: "missing_data",
        status: "open",
        severity: p.mop <= 0 ? "critical" : "warning",
        summary: `Missing: ${missing.join(", ")}.`,
        productName: p.name,
        proposal: { kind: "data", missing, score: q.score },
        jobId: ctx.jobId,
      });
    }
  }

  // Invalid variant pricing is its own visible issue.
  const badVariant = p.variants.find((v) => v.mop <= 0 || (v.mrp > 0 && v.mop > v.mrp));
  if (badVariant) {
    await track({
      productId: p.id,
      variantId: badVariant.id,
      type: "invalid_variant",
      status: "needs_review",
      severity: "critical",
      summary: `Variant "${[badVariant.ram, badVariant.storage, badVariant.color].filter(Boolean).join(" · ") || badVariant.sku}" has invalid pricing.`,
      productName: p.name,
      proposal: { kind: "variant", variantId: badVariant.id },
      jobId: ctx.jobId,
    });
    ctx.counters.needsReview += 1;
  }
}

// ---------- hooks for other flows ----------

/**
 * Fire-and-forget enrichment for products just created/updated by an import,
 * Quick Add publish or a manual add — the "Upload Excel once, everything else
 * is automatic" pipeline (spec §14/§15). No-op when auto-fix is off.
 */
export async function enqueueEnrichment(productIds: number[], adminName = "system"): Promise<number | null> {
  const ids = [...new Set(productIds)].filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return null;
  try {
    const settings = await getCatalogueSettings();
    if (!settings.autoFixEnabled) return null;
    const { jobId } = await startCatalogueJob({
      type: "enrich",
      scope: { kind: "products", ids },
      admin: { id: null, name: adminName },
    });
    return jobId;
  } catch (e) {
    reportError(e, "catalogue/enqueueEnrichment");
    return null;
  }
}

/** Open needs-review/open issue counts, for badges. */
export async function openIssueCounts(): Promise<{ open: number; needsReview: number }> {
  const rows = await db
    .select({ status: catalogueIssues.status, n: sql<number>`count(*)::int` })
    .from(catalogueIssues)
    .where(inArray(catalogueIssues.status, ["open", "needs_review"]))
    .groupBy(catalogueIssues.status);
  let open = 0, needsReview = 0;
  for (const r of rows) {
    if (r.status === "open") open = r.n;
    if (r.status === "needs_review") needsReview = r.n;
  }
  return { open, needsReview };
}
