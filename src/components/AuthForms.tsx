"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { clearSession } from "@/lib/session";

/** Placeholder base used only to normalise a relative path; never navigated to. */
const SAFE_BASE = "https://redirect.invalid";

/**
 * Resolves the `redirect` query value to a path on this site, or "/" if it is
 * anything else. Previously the raw value was pushed straight into the router, so
 * /login?redirect=https://example.invalid - or the protocol-relative
 * //example.invalid - would take a customer who had just typed their password to
 * somebody else's page. That is a convincing phishing hop precisely because it
 * begins on the real store's own login form. Parsing against a fixed base also
 * normalises the backslash and percent-encoded variants that a hand-rolled
 * string check tends to miss, and it gives the same answer on the server and in
 * the browser, so there is nothing to reconcile at hydration.
 */
function safeRedirect(value: string | null | undefined) {
  if (!value) return "/";
  try {
    const url = new URL(value, SAFE_BASE);
    if (url.origin !== SAFE_BASE) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

function getRedirect() {
  if (typeof window === "undefined") return "/";
  return safeRedirect(new URLSearchParams(window.location.search).get("redirect"));
}

/** The pending post-sign-in destination, as a same-site path. */
function useRedirectTarget() {
  return safeRedirect(useSearchParams().get("redirect"));
}

/**
 * Why the customer is on this page, worked out from where they are headed back
 * to.
 *
 * Someone who came here on purpose wants to see their orders. Someone bounced
 * here mid-purchase or mid-repair-booking did not ask to sign in at all, and the
 * page has to explain the interruption and reassure them that the thing they
 * were doing is still waiting — otherwise it reads as "your order is gone, start
 * again", which is where people give up.
 */
function authIntent(target: string): "checkout" | "repair" | "direct" {
  if (target.startsWith("/checkout")) return "checkout";
  if (target.startsWith("/repair/")) return "repair";
  return "direct";
}

/**
 * Carries the pending destination across the sign-in <-> register links. Without
 * this a shopper sent here from the checkout who chose "Create an account"
 * finished registering and landed on the homepage, cart still full, with no
 * explanation - the redirect was simply dropped by the link.
 */
function linkWithRedirect(path: string, target: string) {
  return target && target !== "/" ? `${path}?redirect=${encodeURIComponent(target)}` : path;
}

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

/* ------------------------------------------------------------------ */
/*  Shared bits                                                        */
/* ------------------------------------------------------------------ */

function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center px-4 py-10 sm:py-14">
      <div className="mb-7 flex flex-col items-center text-center">
        <div className="relative mb-4 h-14 w-14 overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-slate-100 dark:ring-slate-800">
          <Image src="/images/sms-logo.png" alt="Store logo" fill sizes="56px" className="object-contain p-1.5" />
        </div>
        <h1 className="text-[26px] font-extrabold tracking-tight text-slate-900 dark:text-white">{title}</h1>
        <p className="mt-1.5 text-[14px] text-slate-500 dark:text-slate-400">{subtitle}</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
        {children}
      </div>

      <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">{footer}</p>
    </div>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p className="mt-1.5 flex items-center gap-1 text-[12.5px] font-medium text-rose-600 dark:text-rose-400" role="alert">
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
      </svg>
      {msg}
    </p>
  );
}

function EmailIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
    </svg>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a20.3 20.3 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 7 11 7a20.3 20.3 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <path d="M1 1l22 22" />
    </svg>
  );
}

function InputRow({
  icon,
  error,
  children,
}: {
  icon: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        className={`flex items-center gap-2.5 rounded-xl border bg-white px-3.5 py-2.5 transition focus-within:ring-2 dark:bg-slate-950 ${
          error
            ? "border-rose-400 focus-within:border-rose-500 focus-within:ring-rose-100 dark:focus-within:ring-rose-900/40"
            : "border-slate-200 focus-within:border-blue-500 focus-within:ring-blue-100 dark:border-slate-700 dark:focus-within:ring-blue-900/40"
        }`}
      >
        <span className={error ? "text-rose-400" : "text-slate-400"}>{icon}</span>
        {children}
      </div>
      <FieldError msg={error} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Login                                                              */
/* ------------------------------------------------------------------ */

export function LoginForm() {
  const router = useRouter();
  const redirectTarget = useRedirectTarget();
  const intent = authIntent(redirectTarget);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const emailError = touched.email && !email.trim() ? "Email is required." : touched.email && !isValidEmail(email) ? "Enter a valid email address." : undefined;
  const passwordError = touched.password && !password ? "Password is required." : undefined;
  const canSubmit = isValidEmail(email) && password.length > 0 && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ email: true, password: true });
    setErr("");
    if (!isValidEmail(email) || !password) return;

    setBusy(true);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, remember }),
      });
      const d = await r.json();
      if (r.ok) {
        // The session just changed, so drop the cached answer the header and
        // product pages read from.
        clearSession();
        router.push(getRedirect());
      } else setErr(d.error || "That email or password looks incorrect.");
    } catch {
      setErr("Network error — please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title={
        intent === "checkout"
          ? "Sign in to place your order"
          : intent === "repair"
            ? "Sign in to confirm your repair"
            : "Welcome back"
      }
      subtitle={
        intent === "checkout"
          ? "Your cart is saved. Sign in to confirm your delivery address and pay."
          : intent === "repair"
            ? "Your chosen repair is saved. Signing in lets us send you updates on it."
            : "Sign in to track orders, manage your wishlist and more."
      }
      footer={
        <>
          New here?{" "}
          <Link
            href={linkWithRedirect("/register", redirectTarget)}
            className="font-semibold text-blue-600 hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <label htmlFor="login-email" className="mb-1.5 block text-[13px] font-semibold text-slate-700 dark:text-slate-300">
            Email address
          </label>
          <InputRow icon={<EmailIcon />} error={emailError}>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              aria-invalid={!!emailError}
              className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
            />
          </InputRow>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="login-password" className="block text-[13px] font-semibold text-slate-700 dark:text-slate-300">
              Password
            </label>
            <Link href="/forgot-password" className="inline-flex min-h-[24px] items-center text-[12.5px] font-semibold text-blue-600 hover:underline">
              Forgot password?
            </Link>
          </div>
          <InputRow icon={<LockIcon />} error={passwordError}>
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              aria-invalid={!!passwordError}
              className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="-my-1 grid h-6 w-6 shrink-0 place-items-center rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <EyeIcon open={showPassword} />
            </button>
          </InputRow>
        </div>

        <label className="flex select-none items-center gap-2 text-[13px] text-slate-600 dark:text-slate-400">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600"
          />
          Keep me signed in
        </label>

        {err && (
          <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-[13px] font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-400" role="alert">
            <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
            </svg>
            {err}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-slate-900"
        >
          {busy ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </button>
      </form>
    </AuthShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Register                                                           */
/* ------------------------------------------------------------------ */

function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3; label: string; color: string } {
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10 && /[A-Z]/.test(pw) && /[0-9]/.test(pw)) score++;
  if (pw.length >= 10 && /[^A-Za-z0-9]/.test(pw)) score++;
  const levels: { score: 0 | 1 | 2 | 3; label: string; color: string }[] = [
    { score: 0, label: "Too short", color: "bg-slate-200 dark:bg-slate-700" },
    { score: 1, label: "Weak", color: "bg-rose-400" },
    { score: 2, label: "Good", color: "bg-amber-400" },
    { score: 3, label: "Strong", color: "bg-emerald-500" },
  ];
  return levels[Math.min(score, 3)];
}

export function RegisterForm() {
  const router = useRouter();
  const redirectTarget = useRedirectTarget();
  const intent = authIntent(redirectTarget);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState<{ name?: boolean; email?: boolean; password?: boolean }>({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  const nameError = touched.name && !name.trim() ? "Full name is required." : undefined;
  const emailError = touched.email && !email.trim() ? "Email is required." : touched.email && !isValidEmail(email) ? "Enter a valid email address." : undefined;
  const passwordError = touched.password && password.length < 6 ? "Password must be at least 6 characters." : undefined;
  const strength = passwordStrength(password);
  const canSubmit = name.trim().length > 0 && isValidEmail(email) && password.length >= 6 && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ name: true, email: true, password: true });
    setErr("");
    if (!name.trim() || !isValidEmail(email) || password.length < 6) return;

    setBusy(true);
    try {
      const r = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), phone: phone.trim(), password }),
      });
      const d = await r.json();
      if (r.ok) {
        clearSession();
        setSuccess(true);
        setTimeout(() => router.push(getRedirect()), 600);
      } else {
        setErr(d.error || "Registration failed. Please try again.");
      }
    } catch {
      setErr("Network error — please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle={
        intent === "checkout"
          ? "Your cart is saved. Create an account to confirm your address and pay."
          : intent === "repair"
            ? "Your chosen repair is saved. Create an account to confirm the booking."
            : "Join to save your wishlist, track orders and check out faster."
      }
      footer={
        <>
          Already have an account?{" "}
          <Link
            href={linkWithRedirect("/login", redirectTarget)}
            className="font-semibold text-blue-600 hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <label htmlFor="reg-name" className="mb-1.5 block text-[13px] font-semibold text-slate-700 dark:text-slate-300">
            Full name
          </label>
          <InputRow icon={<UserIcon />} error={nameError}>
            <input
              id="reg-name"
              autoComplete="name"
              placeholder="Your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, name: true }))}
              aria-invalid={!!nameError}
              className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
            />
          </InputRow>
        </div>

        <div>
          <label htmlFor="reg-email" className="mb-1.5 block text-[13px] font-semibold text-slate-700 dark:text-slate-300">
            Email address
          </label>
          <InputRow icon={<EmailIcon />} error={emailError}>
            <input
              id="reg-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              aria-invalid={!!emailError}
              className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
            />
          </InputRow>
        </div>

        <div>
          <label htmlFor="reg-phone" className="mb-1.5 block text-[13px] font-semibold text-slate-700 dark:text-slate-300">
            Phone <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <InputRow icon={<PhoneIcon />}>
            <input
              id="reg-phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              placeholder="10-digit mobile number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
            />
          </InputRow>
        </div>

        <div>
          <label htmlFor="reg-password" className="mb-1.5 block text-[13px] font-semibold text-slate-700 dark:text-slate-300">
            Password
          </label>
          <InputRow icon={<LockIcon />} error={passwordError}>
            <input
              id="reg-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              minLength={6}
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              aria-invalid={!!passwordError}
              className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="-my-1 grid h-6 w-6 shrink-0 place-items-center rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <EyeIcon open={showPassword} />
            </button>
          </InputRow>

          {password.length > 0 && (
            <div className="mt-2">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span key={i} className={`h-1.5 flex-1 rounded-full ${i < strength.score ? strength.color : "bg-slate-200 dark:bg-slate-700"}`} />
                ))}
              </div>
              <p className="mt-1 text-[11.5px] font-medium text-slate-500 dark:text-slate-400">{strength.label} password</p>
            </div>
          )}
          <p className="mt-1.5 text-[11.5px] text-slate-400">Use 6+ characters. Add numbers, symbols and mixed case for a stronger password.</p>
        </div>

        {err && (
          <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-[13px] font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-400" role="alert">
            <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
            </svg>
            {err}
          </div>
        )}

        {success && (
          <div className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-[13px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" role="status">
            <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Account created — signing you in…
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit || success}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-slate-900"
        >
          {busy ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Creating account…
            </>
          ) : (
            "Create account"
          )}
        </button>
      </form>
    </AuthShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Forgot password                                                    */
/* ------------------------------------------------------------------ */

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const emailError = touched && !email.trim() ? "Email is required." : touched && !isValidEmail(email) ? "Enter a valid email address." : undefined;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    setErr("");
    if (!isValidEmail(email)) return;

    setBusy(true);
    try {
      const r = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const d = await r.json();
      if (r.ok) setSent(true);
      else setErr(d.error || "Something went wrong. Please try again.");
    } catch {
      setErr("Network error — please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="Enter your account email and we'll send you a reset link."
      footer={
        <>
          Remembered it?{" "}
          <Link href="/login" className="font-semibold text-blue-600 hover:underline">
            Back to sign in
          </Link>
        </>
      }
    >
      {sent ? (
        <div className="flex flex-col items-center gap-3 py-2 text-center" role="status">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <p className="text-[15px] font-semibold text-slate-900 dark:text-white">Check your email</p>
          <p className="text-[13.5px] text-slate-500 dark:text-slate-400">
            If an account exists for <span className="font-medium text-slate-700 dark:text-slate-300">{email.trim()}</span>, a
            reset link is on its way. It stays valid for 30 minutes — check your spam folder if it doesn&apos;t arrive.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <div>
            <label htmlFor="forgot-email" className="mb-1.5 block text-[13px] font-semibold text-slate-700 dark:text-slate-300">
              Email address
            </label>
            <InputRow icon={<EmailIcon />} error={emailError}>
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched(true)}
                aria-invalid={!!emailError}
                className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
              />
            </InputRow>
          </div>

          {err && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-[13px] font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-400" role="alert">
              <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
              </svg>
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={!isValidEmail(email) || busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-slate-900"
          >
            {busy ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Sending link…
              </>
            ) : (
              "Send reset link"
            )}
          </button>
        </form>
      )}
    </AuthShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Reset password                                                     */
/* ------------------------------------------------------------------ */

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState<{ password?: boolean; confirm?: boolean }>({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const passwordError = touched.password && password.length < 6 ? "Password must be at least 6 characters." : undefined;
  const confirmError = touched.confirm && confirm !== password ? "Passwords don't match." : undefined;
  const strength = passwordStrength(password);
  const canSubmit = password.length >= 6 && confirm === password && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ password: true, confirm: true });
    setErr("");
    if (password.length < 6 || confirm !== password) return;

    // The token lives only in the emailed link's query string; read it at
    // submit time rather than render time so this component stays
    // prerender-friendly.
    const token = new URLSearchParams(window.location.search).get("token") || "";
    if (!token) {
      setErr("This reset link is missing its token. Please use the link from your email, or request a new one.");
      return;
    }

    setBusy(true);
    try {
      const r = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const d = await r.json();
      if (r.ok) {
        clearSession();
        setDone(true);
        setTimeout(() => router.push("/login"), 2500);
      } else setErr(d.error || "Something went wrong. Please try again.");
    } catch {
      setErr("Network error — please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Set a new password"
      subtitle="Choose a new password for your account."
      footer={
        <>
          Link expired?{" "}
          <Link href="/forgot-password" className="font-semibold text-blue-600 hover:underline">
            Request a new one
          </Link>
        </>
      }
    >
      {done ? (
        <div className="flex flex-col items-center gap-3 py-2 text-center" role="status">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <p className="text-[15px] font-semibold text-slate-900 dark:text-white">Password updated</p>
          <p className="text-[13.5px] text-slate-500 dark:text-slate-400">
            You&apos;ve been signed out everywhere. Taking you to sign in…
          </p>
          <Link href="/login" className="text-[13px] font-semibold text-blue-600 hover:underline">
            Go to sign in now
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <div>
            <label htmlFor="reset-password" className="mb-1.5 block text-[13px] font-semibold text-slate-700 dark:text-slate-300">
              New password
            </label>
            <InputRow icon={<LockIcon />} error={passwordError}>
              <input
                id="reset-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                aria-invalid={!!passwordError}
                className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="-my-1 grid h-6 w-6 shrink-0 place-items-center rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <EyeIcon open={showPassword} />
              </button>
            </InputRow>
            {password.length > 0 && (
              <div className="mt-2 flex items-center gap-2" aria-live="polite">
                <div className="flex h-1 flex-1 gap-1">
                  {[1, 2, 3].map((i) => (
                    <span key={i} className={`h-1 flex-1 rounded-full ${i <= strength.score ? strength.color : "bg-slate-200 dark:bg-slate-700"}`} />
                  ))}
                </div>
                <span className="text-[11.5px] font-medium text-slate-500 dark:text-slate-400">{strength.label}</span>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="reset-confirm" className="mb-1.5 block text-[13px] font-semibold text-slate-700 dark:text-slate-300">
              Confirm new password
            </label>
            <InputRow icon={<LockIcon />} error={confirmError}>
              <input
                id="reset-confirm"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Repeat the password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
                aria-invalid={!!confirmError}
                className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
              />
            </InputRow>
          </div>

          {err && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-[13px] font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-400" role="alert">
              <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
              </svg>
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-slate-900"
          >
            {busy ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Updating…
              </>
            ) : (
              "Update password"
            )}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
