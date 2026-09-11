"use client";

import { useEffect, useState } from "react";

export default function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // One-shot check of localStorage (unavailable during SSR) to decide
    // whether to show the banner on mount.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!localStorage.getItem("sms_cookie_consent")) setShow(true);
    } catch {}
  }, []);

  function accept() {
    try {
      localStorage.setItem("sms_cookie_consent", "1");
    } catch {}
    setShow(false);
  }

  if (!show) return null;
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 p-4 text-sm shadow-2xl backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
      <div className="mx-auto flex max-w-5xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-slate-600 dark:text-slate-300">
          We use cookies &amp; location to show the nearest outlet and improve your experience, per Indian data protection norms. By continuing you consent.
        </p>
        <div className="flex shrink-0 gap-2">
          <button onClick={accept} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white">
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
