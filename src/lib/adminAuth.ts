// Admin session helpers.
//
// Session state itself lives entirely in the httpOnly sms_session cookie
// set by the server on login (see src/lib/auth.ts createSession). Nothing
// here stores the session token in localStorage, sessionStorage, or the
// URL — any of those would be readable by an XSS payload, unlike an
// httpOnly cookie. What's left are small helpers the admin dashboard
// still needs: attaching credentials to fetch calls, building download
// links, and clipboard copy.

export type AdminUser = {
  id: number;
  name: string;
  email: string;
  role: string;
};

/**
 * Clears any leftover session artifacts from earlier versions of this
 * app that did store tokens client-side, so upgrading users don't keep
 * a stale, unused token sitting in storage. Also calls the logout API
 * (done by the caller) to clear the actual cookie session server-side.
 */
export function clearAdminSession() {
  try {
    for (const k of [
      "sms_admin_token",
      "sms_admin_user",
      "sms_admin_token_v2",
      "sms_admin_user_v2",
      "sms_admin_token_v3",
      "sms_admin_user_v3",
    ]) {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    }
  } catch {}
}

/** Build a download URL. Auth is handled by the sms_session cookie, which
 * the browser attaches automatically to this same-origin request — no
 * token needs to be embedded in the URL. */
export function buildDownloadUrl(path: string, filename: string): string {
  const sep = path.includes("?") ? "&" : "?";
  const cacheBust = Date.now();
  return `${path}${sep}dl=${encodeURIComponent(filename)}&_=${cacheBust}`;
}

/** Copy a string to the clipboard with a graceful fallback. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Fetch wrapper for admin API calls. Auth is via the httpOnly sms_session
 * cookie (credentials: "include"), matching how customer auth already
 * works — no client-readable token is attached. */
export async function adminFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  return fetch(input, { ...init, credentials: "include" });
}