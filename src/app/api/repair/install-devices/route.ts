import { getCurrentAdmin } from "@/lib/auth";
import { revalidateContent } from "@/lib/revalidateStorefront";
import { installDeviceCatalogue, seedModelCounts } from "@/lib/repair/deviceCatalogue";

export const dynamic = "force-dynamic";

/**
 * One-click "Install repair brands & models" for Admin, alongside the existing
 * "Install repair catalogue" that seeds services.
 *
 * Idempotent. Never renames, re-images, deactivates or deletes anything the
 * owner has edited — the only mutation to an existing row is flagging a brand
 * repairable. Safe to run repeatedly, which is what makes it usable as "pull in
 * the brands I'm missing" rather than a one-shot bootstrap.
 */
export async function POST() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const result = await installDeviceCatalogue();
  revalidateContent();
  return Response.json(result);
}

/** What a run would add, so Admin can show it before the owner commits. */
export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ modelsPerBrand: seedModelCounts() });
}
