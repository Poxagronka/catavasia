// UI state around engine readiness: which engine's login terminal is open,
// and whether a "Check again" waits for the server's answer.

import { useSyncExternalStore } from 'react';

import type { Engine } from '../cats/catsApi.js';
import { catsApi } from '../cats/catsClient.js';
import { transport } from '../transport/index.js';

interface EngineUiState {
  /** The engine whose login terminal is open. */
  loginEngine: Engine | null;
  /** A checkEngines request waits for its catProfilesLoaded. */
  checking: boolean;
}

let state: EngineUiState = { loginEngine: null, checking: false };
const listeners = new Set<() => void>();

function set(next: Partial<EngineUiState>): void {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

// New engine options arrived: the check is over.
catsApi.subscribe(() => {
  if (state.checking) set({ checking: false });
});

export const engineUi = {
  openLogin: (engine: Engine) => set({ loginEngine: engine }),
  closeLogin: () => set({ loginEngine: null }),
  /** Ask the server to probe every engine CLI again. */
  checkAgain: () => {
    set({ checking: true });
    transport.send({ type: 'checkEngines' });
  },
};

export function useEngineUi(): EngineUiState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}
