"use client";

import { useState } from "react";

export default function ContactForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
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
      const r = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, message, website }),
      });
      const d = await r.json();
      setMsg(d.message || (r.ok ? "Message sent!" : "Try again."));
      if (r.ok) { setName(""); setPhone(""); setMessage(""); }
    } catch {
      setMsg("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="relative space-y-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="font-bold">Send us a message</h3>
      <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
        <label>
          Leave this field empty
          <input type="text" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Your name" autoComplete="name" placeholder="Your name" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800" />
      <input value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="Phone or WhatsApp number" type="tel" autoComplete="tel" placeholder="Phone / WhatsApp" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800" />
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} required rows={4} aria-label="Your message" placeholder="How can we help?" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800" />
      <button disabled={busy} className="w-full rounded-lg bg-blue-600 py-2 font-semibold text-white disabled:opacity-50">
        {busy ? "Sending…" : "Send Message"}
      </button>
      {msg && <p className="text-sm text-emerald-600">{msg}</p>}
    </form>
  );
}
