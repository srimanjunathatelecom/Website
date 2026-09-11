"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // OTP step — populated once /api/admin/login responds with requireOtp
  const [otpStep, setOtpStep] = useState<{ adminId: number; name: string } | null>(null);
  const [otpCode, setOtpCode] = useState("");

  useEffect(() => {
    // Mount flag used purely to gate entrance-animation classes (see JSX
    // below) — legitimate one-shot post-mount sync, not a derivation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error || `Server returned ${res.status}. Check credentials.`);
        setLoading(false);
        return;
      }

      if (data?.requireOtp) {
        setOtpStep({ adminId: data.adminId, name: data.name });
        setLoading(false);
        return;
      }

      if (!data?.admin) {
        setError("Unexpected response from server.");
        setLoading(false);
        return;
      }

      // The login API already set an httpOnly session cookie as a side
      // effect — no client-side token to store. Just navigate; /admin
      // resolves the session from the cookie via /api/auth/me.
      window.location.replace("/admin");
    } catch (err: any) {
      setError(err?.message || "Network error. Check your connection.");
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!otpStep) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminId: otpStep.adminId, code: otpCode.trim() }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error || `Server returned ${res.status}. Check the code and try again.`);
        setLoading(false);
        return;
      }
      if (!data?.admin) {
        setError("Unexpected response from server.");
        setLoading(false);
        return;
      }

      // verify-otp also set the session cookie server-side — just navigate.
      window.location.replace("/admin");
    } catch (err: any) {
      setError(err?.message || "Network error. Check your connection.");
      setLoading(false);
    }
  }

  return (
    <div className="admin-scope min-h-screen">
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
        {/* Left — editorial brand panel */}
        <aside className="relative hidden overflow-hidden bg-[var(--adm-ink)] text-[var(--adm-paper)] lg:block">
          {/* A real photo from the shop's own repair imagery — grounded and
              specific, instead of abstract colour blobs. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/cat-mobile-service.jpg"
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover opacity-35"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-[rgba(14,14,14,0.94)] via-[rgba(14,14,14,0.78)] to-[rgba(14,14,14,0.45)]" />
          <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "18px 18px" }} />

          <div className="relative flex h-full flex-col justify-between p-12">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-md bg-[var(--adm-paper)] font-mono-adm text-sm font-bold text-[var(--adm-ink)]">
                SMS
              </div>
              <div className="leading-tight">
                <p className="font-display-adm text-lg">Smart Mobile Stores</p>
                <p className="adm-eyebrow !text-[var(--adm-paper)]/60">Admin Console · v3</p>
              </div>
            </div>

            <div className="max-w-md">
              <p className="adm-eyebrow !text-[var(--adm-pine-2)]">— Restricted Area</p>
              <h1 className="mt-4 font-display-adm text-5xl leading-[1.02] tracking-tight">
                The till.<br />The shelf.<br />The shop floor.
              </h1>
              <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-[var(--adm-paper)]/75">
                One console for every register, every repair ticket, every
                invoice. Honest numbers, honest pricing — the way the shop
                has always run, now on a screen.
              </p>

              <div className="mt-10 grid grid-cols-3 gap-6 border-t border-white/10 pt-6">
                {[
                  { k: "MOP", v: "Not MRP" },
                  { k: "Outlets", v: "02" },
                  { k: "Open", v: "10–21h" },
                ].map((s) => (
                  <div key={s.k}>
                    <p className="adm-eyebrow !text-[var(--adm-paper)]/50">{s.k}</p>
                    <p className="font-mono-adm mt-1 text-lg font-semibold">{s.v}</p>
                  </div>
                ))}
              </div>
            </div>

            <p className="font-mono-adm text-[11px] tracking-wider text-[var(--adm-paper)]/40">
              © {new Date().getFullYear()} Smart Mobile Stores · GSTIN 29ARHPP2476R1ZR
            </p>
          </div>
        </aside>

        {/* Right — login form */}
        <section className="flex flex-col justify-between p-6 sm:p-10 lg:p-16">
          <div className="flex items-center justify-between lg:hidden">
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-md bg-[var(--adm-ink)] font-mono-adm text-xs font-bold text-[var(--adm-paper)]">SMS</div>
              <span className="font-display-adm text-base">Smart Mobile</span>
            </div>
            <Link href="/" className="adm-eyebrow">← Storefront</Link>
          </div>

          <div className={`mx-auto w-full max-w-md transition-all duration-700 ${mounted ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`}>
            {!otpStep ? (
              <>
                <p className="adm-eyebrow">01 / Authenticate</p>
                <h2 className="mt-3 font-display-adm text-4xl leading-tight sm:text-5xl">
                  Sign in to the<br />console.
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-[var(--adm-muted)]">
                  Authorised store staff only. Your session is kept on this
                  device and never shared.
                </p>

                <form onSubmit={handleSubmit} className="mt-10 space-y-6">
                  <label className="block">
                    <span className="adm-eyebrow">Email</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="adm-input mt-2 font-mono-adm"
                      placeholder="you@smsstores.com"
                      autoComplete="username"
                      required
                    />
                  </label>

                  <label className="block">
                    <span className="adm-eyebrow">Password</span>
                    <div className="relative mt-2">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="adm-input font-mono-adm !pr-11"
                        placeholder="••••••••"
                        autoComplete="current-password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        className="absolute inset-y-0 right-0 grid w-11 place-items-center text-[var(--adm-muted)] transition hover:text-[var(--adm-ink)]"
                      >
                        {showPassword ? <EyeOff aria-hidden className="h-4 w-4" /> : <Eye aria-hidden className="h-4 w-4" />}
                      </button>
                    </div>
                  </label>

                  {error && (
                    <div className="flex items-start gap-3 rounded-lg border border-[rgba(185,28,28,0.3)] bg-[rgba(185,28,28,0.06)] p-3 text-[13px] text-[var(--adm-rose)]">
                      <span className="font-mono-adm mt-0.5 text-[11px] font-bold">ERR</span>
                      <span>{error}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="adm-btn adm-btn--primary w-full justify-center py-3 text-[14px]"
                  >
                    {loading ? (
                      <>
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Verifying credentials…
                      </>
                    ) : (
                      <>
                        Enter the console
                        <span aria-hidden>→</span>
                      </>
                    )}
                  </button>
                </form>
              </>
            ) : (
              <>
                <p className="adm-eyebrow">02 / Verify</p>
                <h2 className="mt-3 font-display-adm text-4xl leading-tight sm:text-5xl">
                  Check your<br />email.
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-[var(--adm-muted)]">
                  Hi {otpStep.name}, we&apos;ve sent a 6-digit code to your email.
                  It expires in 10 minutes.
                </p>

                <form onSubmit={handleVerifyOtp} className="mt-10 space-y-6">
                  <label className="block">
                    <span className="adm-eyebrow">Verification code</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                      className="adm-input mt-2 font-mono-adm tracking-[0.3em] text-center text-lg"
                      placeholder="000000"
                      autoComplete="one-time-code"
                      autoFocus
                      required
                    />
                  </label>

                  {error && (
                    <div className="flex items-start gap-3 rounded-lg border border-[rgba(185,28,28,0.3)] bg-[rgba(185,28,28,0.06)] p-3 text-[13px] text-[var(--adm-rose)]">
                      <span className="font-mono-adm mt-0.5 text-[11px] font-bold">ERR</span>
                      <span>{error}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading || otpCode.length !== 6}
                    className="adm-btn adm-btn--primary w-full justify-center py-3 text-[14px]"
                  >
                    {loading ? (
                      <>
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Verifying code…
                      </>
                    ) : (
                      <>
                        Confirm and continue
                        <span aria-hidden>→</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => { setOtpStep(null); setOtpCode(""); setError(""); }}
                    className="block w-full text-center text-[12px] text-[var(--adm-muted)] underline-offset-4 hover:text-[var(--adm-ink)] hover:underline"
                  >
                    ← Use a different account
                  </button>
                </form>
              </>
            )}
          </div>

          <div className="mt-10 flex items-center justify-between text-[11px] text-[var(--adm-muted)] lg:mt-0">
            <Link href="/" className="hover:text-[var(--adm-ink)]">← Back to storefront</Link>
            <span className="font-mono-adm">SSL · SESSION · {mounted ? "READY" : "…"}</span>
          </div>
        </section>
      </div>
    </div>
  );
}