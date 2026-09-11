import { existsSync } from "fs";
import path from "path";
import { db } from "@/db";
import { services } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";
import { revalidateContent } from "@/lib/revalidateStorefront";
import { REPAIR_IMAGE_LIBRARY, scoreLibraryMatch, type RepairImageEntry } from "@/lib/repair/imageLibrary";

export const dynamic = "force-dynamic";

/**
 * Auto-Fill Service Images.
 *
 * POST { mode: "preview" }               → propose a photo for every service
 *                                          whose image is missing or broken.
 * POST { mode: "apply", ids?: number[] } → apply proposals. With no ids,
 *                                          applies only high-confidence
 *                                          matches; uncertain ones are left
 *                                          for the owner to approve
 *                                          individually (exception-driven).
 *
 * Matching runs against the bundled library of real, licence-verified
 * repair photos — it needs no external API and never fabricates an image.
 * A service that matches nothing is reported as "no_match", never given a
 * random picture.
 */

// Above this score a proposal is applied without the owner's click.
const AUTO_APPLY = 0.5;

type Proposal = {
  serviceId: number;
  name: string;
  currentImage: string;
  reason: "missing" | "broken";
  match: null | {
    file: string;
    alt: string;
    confidence: number;
    action: "auto" | "review";
    sourceName: string;
    sourceUrl: string;
  };
};

function isBrokenLocalImage(image: string): boolean {
  if (!image.startsWith("/")) return false; // remote/data URLs can't be checked here
  const rel = image.replace(/^\/+/, "").split("?")[0];
  return !existsSync(path.join(process.cwd(), "public", rel));
}

function bestMatch(text: string): { entry: RepairImageEntry; score: number } | null {
  let best: { entry: RepairImageEntry; score: number } | null = null;
  for (const entry of REPAIR_IMAGE_LIBRARY) {
    const score = scoreLibraryMatch(entry, text);
    if (score > 0 && (!best || score > best.score)) best = { entry, score };
  }
  return best;
}

function buildProposals(rows: (typeof services.$inferSelect)[]): Proposal[] {
  const out: Proposal[] = [];
  for (const s of rows) {
    const image = (s.image || "").trim();
    const reason: Proposal["reason"] | null = !image ? "missing" : isBrokenLocalImage(image) ? "broken" : null;
    if (!reason) continue;

    const found = bestMatch(`${s.name} ${s.category || ""} ${s.description || ""}`);
    out.push({
      serviceId: s.id,
      name: s.name,
      currentImage: image,
      reason,
      match: found
        ? {
            file: found.entry.file,
            alt: found.entry.alt,
            confidence: Math.round(found.score * 100) / 100,
            action: found.score >= AUTO_APPLY && found.entry.status === "verified" ? "auto" : "review",
            sourceName: found.entry.source.name,
            sourceUrl: found.entry.source.url,
          }
        : null,
    });
  }
  return out;
}

export async function POST(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const mode = b.mode === "apply" ? "apply" : "preview";
  const rows = await db.select().from(services).orderBy(asc(services.sortOrder));
  const proposals = buildProposals(rows);

  if (mode === "preview") {
    return Response.json({
      proposals,
      summary: {
        scanned: rows.length,
        missing: proposals.filter((p) => p.reason === "missing").length,
        broken: proposals.filter((p) => p.reason === "broken").length,
        auto: proposals.filter((p) => p.match?.action === "auto").length,
        review: proposals.filter((p) => p.match?.action === "review").length,
        noMatch: proposals.filter((p) => !p.match).length,
      },
    });
  }

  // apply — explicit ids apply regardless of confidence (the owner clicked
  // them); with no ids only "auto" proposals are written.
  const wanted: number[] | null = Array.isArray(b.ids) ? b.ids.map(Number).filter(Number.isFinite) : null;
  const toApply = proposals.filter((p) =>
    p.match && (wanted ? wanted.includes(p.serviceId) : p.match.action === "auto")
  );

  let applied = 0;
  for (const p of toApply) {
    const entry = REPAIR_IMAGE_LIBRARY.find((e) => e.file === p.match!.file);
    if (!entry) continue;
    const ownerApproved = wanted !== null;
    await db
      .update(services)
      .set({
        image: entry.file,
        imageAlt: entry.alt,
        imageSource: JSON.stringify({
          ...entry.source,
          status: ownerApproved || entry.status === "verified" ? "verified" : "needs_review",
          matchedBy: "auto-fill",
          confidence: p.match!.confidence,
        }),
      })
      .where(eq(services.id, p.serviceId));
    applied += 1;
  }

  if (applied > 0) revalidateContent();
  const remaining = proposals.filter((p) => !toApply.includes(p));
  return Response.json({
    applied,
    needsReview: remaining.filter((p) => p.match).map((p) => ({ serviceId: p.serviceId, name: p.name })),
    noMatch: remaining.filter((p) => !p.match).map((p) => ({ serviceId: p.serviceId, name: p.name })),
  });
}
