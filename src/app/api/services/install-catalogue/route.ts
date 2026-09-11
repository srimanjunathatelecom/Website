import { getCurrentAdmin } from "@/lib/auth";
import { revalidateContent } from "@/lib/revalidateStorefront";
import { installRepairCatalogue } from "@/lib/repair/catalogue";

export const dynamic = "force-dynamic";

// One-click "Install repair catalogue" for Admin. Idempotent: never duplicates
// services and never overwrites owner-edited fields; safe to run repeatedly.
export async function POST() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const result = await installRepairCatalogue();
  revalidateContent();
  return Response.json(result);
}
