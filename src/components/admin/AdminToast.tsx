"use client";

import { CheckCircle2, AlertCircle } from "lucide-react";
import { useAdminToast } from "@/lib/adminToast";

/**
 * Renders the confirmation raised by adminToast(). Mounted once by the
 * dashboard; see src/lib/adminToast.ts for why this is a module-level store.
 *
 * role="status" with aria-live="polite" so the confirmation is announced rather
 * than only seen - the modal closing is the visual cue, and a screen reader user
 * gets nothing from that.
 */
export default function AdminToast() {
  const toast = useAdminToast();
  const good = toast?.tone !== "bad";
  const Icon = good ? CheckCircle2 : AlertCircle;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex justify-center px-4"
    >
      {toast && (
        <div
          // keyed on id so re-saving replays the entrance instead of sitting there
          key={toast.id}
          className={`adm-toast ${good ? "adm-toast--good" : "adm-toast--bad"}`}
        >
          <Icon size={16} aria-hidden="true" className="shrink-0" />
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
