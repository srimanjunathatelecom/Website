import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// The one-shot CSV import that used to live here wrote stock in a single
// request with no preview, no mode selection, no duplicate-file protection
// and no rollback. It has been retired in favour of the guided pipeline:
//
//   POST /api/imports/preview        → parse + validate, writes nothing
//   POST /api/imports/[id]/commit    → the only writing step, transactional
//   POST /api/imports/[id]/rollback  → undo one batch
//
// The admin UI (Products → Import) uses that pipeline. This stub answers
// 410 Gone instead of a silent 404 so any old script or bookmark gets a
// clear explanation rather than appearing to succeed or vanish.
export async function POST() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }
  return NextResponse.json(
    {
      error:
        "This import endpoint has been retired because it changed stock without a preview or confirmation. " +
        "Please use the Import button in the admin Products section, which shows exactly what will change before anything is written.",
      replacement: "/api/imports/preview",
    },
    { status: 410 }
  );
}
