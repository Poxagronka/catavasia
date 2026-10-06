import { useSyncExternalStore } from 'react';

import type { CatsSnapshot } from './catsApi.js';
import { catsApi } from './localCatsAdapter.js';

/** Live agent cats from the shared CatsApi. */
export function useCats(): CatsSnapshot {
  return useSyncExternalStore(catsApi.subscribe, catsApi.getSnapshot);
}
