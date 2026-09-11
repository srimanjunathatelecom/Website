"use client";

/**
 * Short-lived storage for something the shopper has typed but not yet been able
 * to submit.
 *
 * The review and question forms on a product page can only be posted by a
 * signed-in shopper, and that is discovered when the request comes back 401. The
 * shopper is then sent to the login page, which used to mean everything they had
 * written was gone by the time they came back. Stashing the draft here and
 * restoring it after login means the round trip costs them nothing.
 *
 * `sessionStorage`, not `localStorage`: a half-written review should not still be
 * waiting in the form a week later. It lives as long as the tab does, which is
 * exactly as long as the login detour.
 */

const PREFIX = "sms_draft:";

export function saveDraft(key: string, value: unknown) {
  try {
    window.sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Private browsing or a full quota. Losing a draft is not worth an error.
  }
}

/** Reads a draft and clears it, so it is restored once and not again. */
export function takeDraft<T>(key: string): T | null {
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    window.sessionStorage.removeItem(PREFIX + key);
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
