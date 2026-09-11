/**
 * POST /api/catalogue/issues/:id — act on a review card.
 *
 * { action: "approve", candidateUrl? }  apply the proposal
 * { action: "reject" }                  keep things as they are
 * { action: "dismiss" }                 not a real problem, stop showing it
 *
 * Approving an image proposal downloads + verifies + optimizes the chosen
 * candidate right here (same pipeline as auto-fix) — approval is consent,
 * not blind trust: a candidate that fails verification is NOT applied.
 */

import { db } from "@/db";
import { catalogueIssues, productImages } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rateLimit";
import { attachImage, fetchRemoteImage, optimizeAndStore } from "@/lib/catalogue/imageStore";
import { reportError } from "@/lib/observability";

export const dynamic = "force-dynamic";

type ImageProposal = {
  kind?: string;
  candidates?: { url: string; alt?: string; confidence?: number; sourceDomain?: string }[];
  replaceImageId?: number | null;
  imageIds?: number[];
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`catalogue-issue:${clientIp(req)}`, 60, 60_000);
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);

  const { id } = await params;
  const issueId = Number(id);
  if (!Number.isInteger(issueId)) return Response.json({ error: "Invalid issue id." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  if (!["approve", "reject", "dismiss"].includes(action)) {
    return Response.json({ error: "Unknown action." }, { status: 400 });
  }

  const [issue] = await db.select().from(catalogueIssues).where(eq(catalogueIssues.id, issueId));
  if (!issue) return Response.json({ error: "Issue not found." }, { status: 404 });
  if (!["open", "needs_review"].includes(issue.status)) {
    return Response.json({ error: `This issue is already ${issue.status}.` }, { status: 409 });
  }

  const done = async (status: string, after?: object) => {
    await db
      .update(catalogueIssues)
      .set({ status, resolvedAt: new Date(), resolvedBy: admin.name, ...(after ? { after } : {}) })
      .where(eq(catalogueIssues.id, issueId));
    const [updated] = await db.select().from(catalogueIssues).where(eq(catalogueIssues.id, issueId));
    return Response.json({ issue: updated });
  };

  if (action === "reject") return done("rejected");
  if (action === "dismiss") return done("dismissed");

  // ---- approve ----
  try {
    const proposal = (issue.proposal || {}) as ImageProposal;

    if (proposal.kind === "image" && Array.isArray(proposal.candidates) && proposal.candidates.length) {
      const chosenUrl = String(body.candidateUrl || proposal.candidates[0].url);
      const chosen = proposal.candidates.find((c) => c.url === chosenUrl) || proposal.candidates[0];
      const fetched = await fetchRemoteImage(chosen.url);
      const ref = await optimizeAndStore(fetched, `p${issue.productId}`);
      const res = await attachImage({
        productId: issue.productId,
        variantId: issue.variantId,
        ref,
        alt: chosen.alt || issue.productName,
        replaceImageId: proposal.replaceImageId ?? null,
      });
      return done("approved", {
        imageRef: ref.startsWith("data:") ? "(stored in database)" : ref,
        imageId: res.imageId,
        replacedImageId: res.replacedImageId,
        source: chosen.sourceDomain || "",
      });
    }

    if (proposal.kind === "remove_broken" && Array.isArray(proposal.imageIds) && proposal.imageIds.length) {
      const ids = proposal.imageIds.map(Number).filter((n) => Number.isInteger(n) && n > 0);
      if (ids.length) await db.delete(productImages).where(inArray(productImages.id, ids));
      return done("approved", { removedImageIds: ids });
    }

    // Non-executable proposals (duplicates, data gaps, variant pricing) —
    // approval acknowledges it; the actual edit happens in the product editor.
    return done("approved");
  } catch (e) {
    reportError(e, "catalogue/issueApprove", { issueId });
    const msg = e instanceof Error ? e.message : "Could not apply the proposal.";
    return Response.json({ error: msg }, { status: 502 });
  }
}
