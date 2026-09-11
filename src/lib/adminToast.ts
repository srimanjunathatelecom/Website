"use client";

import { useSyncExternalStore } from "react";

/**
 * A single confirmation line for the Admin console.
 *
 * Every editor in the dashboard used to save and then just close - the modal
 * vanished and the table refreshed underneath it. Eight of them did this. There
 * was no wording anywhere that said the change had been stored, so the only
 * evidence a price edit had worked was noticing the number in the table behind
 * the modal had changed. Failures were reported properly; success said nothing.
 *
 * A store owner cannot be expected to infer "it saved" from a modal closing,
 * and the reasonable reaction to silence - open it and save again - produces
 * more silence.
 *
 * Deliberately a module-level store rather than context: the editors are spread
 * through a 4,000-line component tree and threading a provider through all of
 * them would touch far more code than the problem warrants.
 */

export type ToastTone = "good" | "bad";
export type ToastState = { id: number; message: string; tone: ToastTone } | null;

const DISMISS_MS = 2600;

let state: ToastState = null;
let seq = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Show a confirmation. Call it after a save has actually succeeded. */
export function adminToast(message: string, tone: ToastTone = "good") {
  state = { id: ++seq, message, tone };
  emit();
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    state = null;
    emit();
  }, DISMISS_MS);
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const getSnapshot = () => state;
// Nothing is ever showing on the server, so the first client render matches.
const getServerSnapshot = (): ToastState => null;

export function useAdminToast(): ToastState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
