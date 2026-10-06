// The app-wide Cat CEO store over the transport (see catCeoStore.ts).

import { useSyncExternalStore } from 'react';

import { transport } from '../transport/index.js';
import { type CatCeoStore, type CeoSnapshot, createCatCeoStore } from './catCeoStore.js';

export type { CeoSettings } from './catCeoStore.js';

export const catCeo: CatCeoStore = createCatCeoStore(transport);

export function useCatCeo(): CeoSnapshot {
  return useSyncExternalStore(catCeo.subscribe, catCeo.getSnapshot);
}
