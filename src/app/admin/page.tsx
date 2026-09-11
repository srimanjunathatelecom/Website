"use client";

import { useEffect, useState } from "react";
import type { AdminUser } from "@/lib/adminAuth";
import AdminDashboard from "@/components/AdminDashboard";

export default function AdminPage() {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [state, setState] = useState<"checking" | "ready" | "unauth" | "error">("checking");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function resolve() {
      try {
        const r = await fetch("/api/auth/me", { credentials: "include" });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d?.admin) {
          setAdmin(d.admin);
          setErrorMsg("");
          setState("ready");
          return;
        }
        if (r.status >= 500) {
          setErrorMsg("Could not verify the admin session right now.");
          setState("error");
          return;
        }
      } catch {
        setErrorMsg("Network error while loading the admin dashboard.");
        setState("error");
        return;
      }

      setState("unauth");
    }

    resolve();
  }, []);

  if (state === "unauth") {
    if (typeof window !== "undefined") {
      window.location.replace("/admin/login");
    }
    return <BootShell label="Redirecting to sign-in…" />;
  }

  if (state === "error") {
    return <BootShell label={errorMsg || "Admin dashboard unavailable."} allowRetry />;
  }

  if (state === "checking" || !admin) {
    return <BootShell label="Verifying session…" />;
  }

  return (
    <AdminDashboard
      admin={admin}
      onError={(msg) => {
        setErrorMsg(msg);
        setState("error");
      }}
    />
  );
}

function BootShell({ label, allowRetry = false }: { label: string; allowRetry?: boolean }) {
  return (
    <div className="admin-scope grid min-h-screen place-items-center px-4">
      <div className="flex max-w-md flex-col items-center gap-5 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-md bg-[var(--adm-ink)] font-mono-adm text-sm font-bold text-[var(--adm-paper)]">
          SMS
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--adm-pine)]" />
          <p className="font-mono-adm text-[11px] uppercase tracking-[0.22em] text-[var(--adm-muted)]">
            {label}
          </p>
        </div>
        {allowRetry && (
          <button onClick={() => window.location.reload()} className="adm-btn adm-btn--primary !py-1.5 !text-[12px]">
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
