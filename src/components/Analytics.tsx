"use client";

import { useEffect } from "react";

export default function Analytics() {
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        const id = d?.settings?.gaId;
        if (!id) return;
        const s = document.createElement("script");
        s.async = true;
        s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
        document.head.appendChild(s);
        const s2 = document.createElement("script");
        s2.innerHTML = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${id}')`;
        document.head.appendChild(s2);
      })
      .catch(() => {});
  }, []);
  return null;
}
