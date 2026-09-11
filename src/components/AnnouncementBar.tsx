"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { AnnouncementConfig } from "@/lib/siteConfig";

const STORAGE_KEY = "sms_dismissed_announcement";

export default function AnnouncementBar({ config }: { config: AnnouncementConfig }) {
  const [dismissed, setDismissed] = useState(true); // default hidden until we check storage, avoids flash

  useEffect(() => {
    // One-shot sync from localStorage (unavailable during SSR) plus the
    // config prop, run on mount and whenever the announcement text/
    // dismissible flag changes — not a per-render derivation.
    if (!config.dismissible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDismissed(false);
      return;
    }
    try {
      // Keyed by the message text itself: editing the announcement in
      // admin automatically un-dismisses it for everyone, since it's
      // effectively a new message even if "active" never toggled off.
      const dismissedText = window.localStorage.getItem(STORAGE_KEY);
      setDismissed(dismissedText === config.text);
    } catch {
      setDismissed(false);
    }
  }, [config.text, config.dismissible]);

  function handleDismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, config.text);
    } catch {
      // ignore storage failures (private browsing etc.) - dismiss still
      // works for this page view via React state above
    }
  }

  if (dismissed) return null;

  const bg = config.backgroundColor || "bg-slate-900";

  return (
    <div className={`relative w-full ${bg} px-4 py-2 text-center text-[12px] font-semibold text-white sm:text-[13px]`}>
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-center gap-x-2 gap-y-1 pr-6">
        <span>{config.text}</span>
        {config.linkLabel && config.linkHref && (
          <Link href={config.linkHref} className="underline underline-offset-2 hover:text-white/80">
            {config.linkLabel}
          </Link>
        )}
      </div>
      {config.dismissible && (
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss announcement"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          <X aria-hidden className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
