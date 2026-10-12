/**
 * Whether the first-run onboarding is over. The server owns the truth (the `onboardingDone` setting):
 * settingsLoaded sets it on connect, and "Reset everything" turns it back off.
 *
 * `showOnboarding` is false until settingsLoaded arrives, so an existing user never sees a flash.
 */

import { useSyncExternalStore } from 'react';

import { transport } from '../transport/index.js';

interface OnboardingState {
  readonly loaded: boolean;
  readonly done: boolean;
}

let state: OnboardingState = { loaded: false, done: true };
const listeners = new Set<() => void>();

function set(next: OnboardingState): void {
  if (next.loaded === state.loaded && next.done === state.done) return;
  state = next;
  for (const l of listeners) l();
}

transport.onMessage((msg) => {
  if (msg.type === 'settingsLoaded') {
    // An older server omits the field: treat it as an existing user.
    set({ loaded: true, done: msg.onboardingDone !== false });
  } else if (msg.type === 'resetAllResult' && !msg.error) {
    set({ loaded: true, done: false });
  }
});

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True when the app should show the onboarding now. */
export function useShowOnboarding(): boolean {
  const snapshot = useSyncExternalStore(subscribe, () => state);
  return snapshot.loaded && !snapshot.done;
}

/** The user finished or skipped the onboarding. */
export function finishOnboarding(): void {
  set({ loaded: true, done: true });
  transport.send({ type: 'setOnboardingDone', done: true });
}

/** Settings "Run onboarding again". */
export function restartOnboarding(): void {
  set({ loaded: true, done: false });
  transport.send({ type: 'setOnboardingDone', done: false });
}
