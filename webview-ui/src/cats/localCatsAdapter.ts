// Local CatsApi: in-memory state mirrored to localStorage. No server round
// trip. The fallback of serverCatsAdapter.ts when no server office answers
// (VS Code, Vite dev); a server office imports these cats once (see there).

import { BREED_IDS } from './catArt.js';
import {
  type CatProfile,
  type CatsApi,
  type CatsSnapshot,
  type Engine,
  type EngineOptions,
  validateCatProfile,
} from './catsApi.js';
import { moveCat, normalizeHierarchy, promoteToBoss, removeCat } from './hierarchy.js';

/**
 * Offline lists only: with a server office the values come from the
 * installed CLI (`claude --help`, `codex debug models`). The Codex values are
 * a subset of `codex debug models` from codex-cli 0.155.1 (2026-10-06).
 */
const ENGINE_OPTIONS: Record<Engine, EngineOptions> = {
  claude: {
    models: ['opus', 'sonnet', 'haiku', 'fable'],
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
  },
  codex: {
    models: ['gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna'],
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
  },
};

export const STORAGE_KEY = 'catavasia.cats.v1';

/** The cats a fresh browser starts with (exported: the server import skips them). */
export function localSeed(): CatsSnapshot {
  const worker = (id: string, name: string, breed: string, role: string): CatProfile => ({
    id,
    name,
    appearance: { breed },
    role,
    systemPrompt: '',
    engine: 'claude',
    model: 'sonnet',
    effort: 'medium',
    parentId: 'boss',
    isDefault: true,
  });
  return {
    cats: [
      {
        ...worker('boss', 'Marmalade', 'marmalade', 'Team lead'),
        personality: 'scrappy',
        model: 'opus',
        effort: 'medium',
        parentId: null,
        systemPrompt: 'You lead the team. Split the task, delegate, review the reports.',
      },
      { ...worker('dev', 'Smokey', 'smokey', 'Developer'), personality: 'zoomie' },
      { ...worker('qa', 'Mochi', 'mochi', 'Tester'), personality: 'pooper' },
    ],
  };
}

interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStore(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The local CatsApi, plus "Reset everything" (back to the seed). */
export interface LocalCatsApi extends CatsApi {
  resetToSeed(): void;
}

export function createLocalCatsAdapter(store: Store | null = browserStore()): LocalCatsApi {
  let state = load();
  const listeners = new Set<() => void>();

  function load(): CatsSnapshot {
    try {
      const raw = store?.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<CatsSnapshot>;
        // A `pets` list left by an older build is ignored: pets live in the layout now.
        if (Array.isArray(parsed.cats))
          // Profiles with an engine this build does not know are dropped.
          return {
            cats: normalizeHierarchy(parsed.cats.filter((c) => c.engine in ENGINE_OPTIONS)),
          };
      }
    } catch {
      // Corrupt or blocked storage: start from the seed.
    }
    return localSeed();
  }

  function commit(next: CatsSnapshot) {
    state = next;
    try {
      store?.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage full or blocked: keep the in-memory state.
    }
    listeners.forEach((l) => l());
  }

  const fail = (errors: string[]) => {
    if (errors.length) throw new Error(errors.join('; '));
  };

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    saveCat(cat) {
      const options = ENGINE_OPTIONS[cat.engine] ?? { models: [], efforts: [] };
      fail(validateCatProfile(cat, options, BREED_IDS));
      const exists = state.cats.some((c) => c.id === cat.id);
      const cats = exists
        ? state.cats.map((c) => (c.id === cat.id ? cat : c))
        : [...state.cats, cat];
      commit({ ...state, cats: normalizeHierarchy(cats) });
    },
    deleteCat(id) {
      commit({ ...state, cats: removeCat(state.cats, id) });
    },
    setParent(id, parentId) {
      commit({ ...state, cats: moveCat(state.cats, id, parentId) });
    },
    promoteToBoss(id) {
      commit({ ...state, cats: promoteToBoss(state.cats, id) });
    },
    engineOptions: (engine) => ENGINE_OPTIONS[engine],
    resetToSeed: () => commit(localSeed()),
  };
}
