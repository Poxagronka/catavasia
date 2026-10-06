// The app-wide CatsApi the Cats and Hierarchy modals share: the server office
// when it answers, the browser-local cats until then (see serverCatsAdapter.ts).

import { transport } from '../transport/index.js';
import type { CatsApi } from './catsApi.js';
import { createLocalCatsAdapter } from './localCatsAdapter.js';
import { createServerCatsAdapter } from './serverCatsAdapter.js';

function browserStore(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

const hasToken =
  typeof window !== 'undefined' && !!new URLSearchParams(window.location.search).get('token');

export const catsApi: CatsApi = createServerCatsAdapter(transport, createLocalCatsAdapter(), {
  privileged: hasToken,
  store: browserStore(),
});
