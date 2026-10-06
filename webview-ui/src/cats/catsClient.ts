// The app-wide CatsApi the Cats and Hierarchy modals share: the server office
// when it answers, the browser-local cats until then (see serverCatsAdapter.ts).

import { sessionToken } from '../sessionToken.js';
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

export const catsApi: CatsApi = createServerCatsAdapter(transport, createLocalCatsAdapter(), {
  privileged: sessionToken !== null,
  store: browserStore(),
});
