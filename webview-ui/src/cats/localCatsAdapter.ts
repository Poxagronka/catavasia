// Local CatsApi: in-memory state mirrored to localStorage. No server round
// trip. TODO-phase1: replace with a transport adapter that sends the profile
// messages and applies catProfilesLoaded / catProfileSaved / hierarchy.

import { BREED_IDS } from './catArt.js';
import {
  type CatProfile,
  type CatsApi,
  type CatsSnapshot,
  type Engine,
  type EngineOptions,
  type PetProfile,
  validateCatProfile,
  validatePetProfile,
} from './catsApi.js';
import { moveCat, normalizeHierarchy, promoteToBoss, removeCat } from './hierarchy.js';

/**
 * TODO-phase1: the server reads these from the installed CLIs. Claude values
 * come from `claude --help` (2.1.289): --effort low|medium|high|xhigh|max,
 * --model alias or full name. Codex values are unverified placeholders
 * (the model is the one in ~/.codex/config.toml on the dev machine).
 */
const ENGINE_OPTIONS: Record<Engine, EngineOptions> = {
  claude: {
    models: ['opus', 'sonnet', 'haiku', 'fable'],
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
  },
  codex: { models: ['gpt-6-astra'], efforts: ['low', 'medium', 'high'] },
};

export const STORAGE_KEY = 'catavasia.cats.v1';

function seed(): CatsSnapshot {
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
        model: 'opus',
        effort: 'high',
        parentId: null,
        systemPrompt: 'You lead the team. Split the task, delegate, review the reports.',
      },
      worker('dev', 'Smokey', 'smokey', 'Developer'),
      worker('qa', 'Mochi', 'mochi', 'Tester'),
    ],
    pets: [{ id: 'pet-1', name: 'Biscuit', species: 'cat', appearance: { breed: 'butterscotch' } }],
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

export function createLocalCatsAdapter(store: Store | null = browserStore()): CatsApi {
  let state = load();
  const listeners = new Set<() => void>();

  function load(): CatsSnapshot {
    try {
      const raw = store?.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<CatsSnapshot>;
        if (Array.isArray(parsed.cats) && Array.isArray(parsed.pets))
          return { cats: normalizeHierarchy(parsed.cats), pets: parsed.pets };
      }
    } catch {
      // Corrupt or blocked storage: start from the seed.
    }
    return seed();
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
      fail(validateCatProfile(cat, ENGINE_OPTIONS[cat.engine], BREED_IDS));
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
    savePet(pet: PetProfile) {
      fail(validatePetProfile(pet, BREED_IDS));
      const exists = state.pets.some((p) => p.id === pet.id);
      const pets = exists
        ? state.pets.map((p) => (p.id === pet.id ? pet : p))
        : [...state.pets, pet];
      commit({ ...state, pets });
    },
    deletePet(id) {
      commit({ ...state, pets: state.pets.filter((p) => p.id !== id) });
    },
    engineOptions: (engine) => ENGINE_OPTIONS[engine],
  };
}

/** The app-wide instance the Cats and Hierarchy modals share. */
export const catsApi: CatsApi = createLocalCatsAdapter();
