"use client";

import { useState } from "react";

export default function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [channel, setChannel] = useState("email");
  // Honeypot — hidden from people, filled by autofill bots. The server
  // silently drops any submission that carries a value here.
  const [website, setWebsite] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/subscribers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, phone, channel, website }),
      });
      const d = await r.json();
      setMsg(d.message || (r.ok ? "Subscribed!" : "Try again."));
      if (r.ok) {
        setEmail("");
        setPhone("");
      }
    } catch {
      setMsg("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="relative space-y-2">
      <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
        <label>
          Leave this field empty
          <input type="text" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div className="flex gap-2">
        <input
          type="email"
          required={channel === "email"}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Email address for offers and updates"
          autoComplete="email"
          placeholder="Email for offers"
          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-blue-500"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50"
        >
          {busy ? "…" : "Join"}
        </button>
      </div>
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <label className="flex items-center gap-1">
          <input type="radio" checked={channel === "email"} onChange={() => setChannel("email")} /> Email
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" checked={channel === "whatsapp"} onChange={() => setChannel("whatsapp")} /> WhatsApp
        </label>
        {channel === "whatsapp" && (
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            aria-label="WhatsApp number for offers and updates"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="WhatsApp number"
            className="flex-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-slate-100 placeholder:text-slate-500 outline-none"
          />
        )}
      </div>
      {msg && <p className="text-xs text-emerald-400">{msg}</p>}
    </form>
  );
}