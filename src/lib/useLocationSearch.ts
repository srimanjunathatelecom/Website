"use client";

import { useSyncExternalStore } from "react";

/**
 * Reads the current query string as reactive state.
 *
 * This exists so a client component can keep a selection (a product variant, a
 * filter) in the URL and have the UI follow it. Keeping the selection in the URL
 * is what makes reloads, shared links and the back button all show the same
 * thing the shopper was looking at.
 *
 * `useSyncExternalStore` is used rather than reading `window.location` during
 * render because pages here are served from the ISR cache and the server has no
 * query string to render from. Passing a separate server snapshot is the
 * supported way to say "the server sees nothing, the client sees this" without
 * producing a hydration mismatch: React renders the server snapshot first, then
 * immediately re-renders with the client value.
 */

const CHANGE_EVENT = "sms:locationsearch";

function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

// Returns a string, so repeated calls are referentially equal while the URL is
// unchanged and React doesn't re-render in a loop.
function getSnapshot() {
  return window.location.search;
}

function getServerSnapshot() {
  return "";
}

export function useLocationSearch() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Updates the query string in place and notifies `useLocationSearch` readers.
 *
 * `replaceState` rather than the Next router: the page's data hasn't changed, so
 * there is nothing to refetch, and pushing every colour tap onto the history
 * stack would leave the shopper pressing back a dozen times to leave the page.
 */
export function setLocationSearch(params: URLSearchParams) {
  const qs = params.toString();
  const next = window.location.pathname + (qs ? `?${qs}` : "");
  if (next === window.location.pathname + window.location.search) return;
  window.history.replaceState(null, "", next);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export default useLocationSearch;
