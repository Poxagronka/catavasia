// Server-backed CatsApi: the Cats menu over the cat office messages.
//
// - Snapshot: `catProfilesLoaded` (and `catProfileSaved`) from the server.
// - Mutations: saveCatProfile / deleteCatProfile / setCatParent /
//   promoteCatToBoss. They apply at once (optimistic) and the server snapshot
//   replaces them; a `catProfileRejected` reverts to the last server snapshot
//   and shows its error inline (snapshot.rejected).
// - Engine options come from the server (read from the installed CLI). An
//   engine the server has no adapter for stays listed, marked unavailable.
// - Until the first `catProfilesLoaded` (no server office: VS Code, Vite dev)
//   every call goes to the local adapter.
// - One-time import: when the server holds only its seeded default team and
//   this browser has edited cats in localStorage (`catavasia.cats.v1`), a
//   tokened client sends them to the server once (see migrateLocalCats).

import type {
  CatProfile as WireCat,
  ClientMessage,
  EngineOptions as WireEngineOptions,
  ServerMessage,
} from '../../../core/src/messages.js';
import { BREED_IDS } from './catArt.js';
import {
  type CatProfile,
  type CatsApi,
  type CatsSnapshot,
  type Engine,
  ENGINE_LABELS,
  type EngineOptions,
  validateCatProfile,
} from './catsApi.js';
import { moveCat, normalizeHierarchy, promoteToBoss, removeCat } from './hierarchy.js';
import { localSeed, STORAGE_KEY } from './localCatsAdapter.js';

/** `claude --help`: the CLI also takes "a model's full name". Mirrors the server check. */
const CLAUDE_FULL_MODEL = /^claude-[a-z0-9][a-z0-9.-]*$/;
/** The Haiku alias the offline lists offered; the server takes the full name. */
const HAIKU_FULL_NAME = 'claude-haiku-4-5-20251001';
export const MIGRATED_KEY = 'catavasia.cats.migrated.v1';

export interface CatsWire {
  send(msg: ClientMessage): void;
  onMessage(handler: (msg: ServerMessage) => void): () => void;
}

interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ServerCatsOptions {
  /** The page has the server token: edits are allowed (else the server refuses them). */
  privileged: boolean;
  store: Store | null;
}

export function createServerCatsAdapter(
  wire: CatsWire,
  local: CatsApi,
  opts: ServerCatsOptions,
): CatsApi {
  let online = false;
  let serverCats: CatProfile[] = [];
  let state: CatsSnapshot = { cats: [] };
  let engines: WireEngineOptions[] = [];
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  local.subscribe(() => {
    if (!online) notify();
  });

  const engineOptions = (engine: Engine): EngineOptions => {
    const found = engines.find((e) => e.engine === engine);
    if (!found) {
      return {
        models: [],
        efforts: [],
        unavailable: `${ENGINE_LABELS[engine]}: adapter not ready`,
      };
    }
    const full = engine === 'claude' ? { fullModelPattern: CLAUDE_FULL_MODEL } : {};
    return { models: found.models, efforts: found.efforts, ...full };
  };

  const apply = (cats: CatProfile[], msg: ClientMessage) => {
    state = { cats };
    notify();
    wire.send(msg);
  };

  wire.onMessage((msg) => {
    switch (msg.type) {
      case 'catProfilesLoaded': {
        const first = !online;
        online = true;
        engines = msg.engineOptions;
        serverCats = msg.cats as CatProfile[];
        state = { cats: serverCats };
        notify();
        if (first && opts.privileged) migrateLocalCats(serverCats, opts.store, engineOptions, wire);
        break;
      }
      case 'catProfileRejected':
        if (!online) break;
        state = { cats: serverCats, rejected: { id: msg.id, error: msg.error } };
        notify();
        break;
    }
  });

  return {
    getSnapshot: () => (online ? state : local.getSnapshot()),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    saveCat(cat) {
      if (!online) return local.saveCat(cat);
      const errors = validateCatProfile(cat, engineOptions(cat.engine), BREED_IDS);
      if (errors.length) throw new Error(errors.join('; '));
      const exists = state.cats.some((c) => c.id === cat.id);
      const cats = exists
        ? state.cats.map((c) => (c.id === cat.id ? cat : c))
        : [...state.cats, cat];
      apply(normalizeHierarchy(cats), { type: 'saveCatProfile', profile: cat as WireCat });
    },
    deleteCat(id) {
      if (!online) return local.deleteCat(id);
      apply(removeCat(state.cats, id), { type: 'deleteCatProfile', id });
    },
    setParent(id, parentId) {
      if (!online) return local.setParent(id, parentId);
      apply(moveCat(state.cats, id, parentId), { type: 'setCatParent', id, parentId });
    },
    promoteToBoss(id) {
      if (!online) return local.promoteToBoss(id);
      apply(promoteToBoss(state.cats, id), { type: 'promoteCatToBoss', id });
    },
    engineOptions: (engine) => (online ? engineOptions(engine) : local.engineOptions(engine)),
  };
}

/**
 * Import this browser's local cats into the server once: only when the
 * server still holds its seeded default team and the local list is not the
 * untouched local seed. Codex cats are skipped (no adapter yet; their reports
 * move up). A model the server does not accept becomes `haiku` -> its full
 * name, else the first offered model.
 */
export function migrateLocalCats(
  serverCats: readonly CatProfile[],
  store: Store | null,
  options: (engine: Engine) => EngineOptions,
  wire: Pick<CatsWire, 'send'>,
): boolean {
  if (!store || store.getItem(MIGRATED_KEY)) return false;
  if (!serverCats.every((c) => c.isDefault)) return false;
  let local: CatProfile[];
  try {
    const parsed = JSON.parse(store.getItem(STORAGE_KEY) ?? 'null') as { cats?: CatProfile[] };
    local = normalizeHierarchy(Array.isArray(parsed?.cats) ? parsed.cats : []);
  } catch {
    return false;
  }
  if (!local.length || JSON.stringify(local) === JSON.stringify(localSeed().cats)) return false;
  store.setItem(MIGRATED_KEY, new Date().toISOString());

  const byId = new Map(local.map((c) => [c.id, c]));
  const keep = local.filter((c) => !options(c.engine).unavailable);
  const kept = new Set(keep.map((c) => c.id));
  /** The nearest kept ancestor: a skipped Codex cat's reports move up. */
  const parentOf = (c: CatProfile): string | null => {
    let p = c.parentId;
    while (p !== null && !kept.has(p)) p = byId.get(p)?.parentId ?? null;
    return p;
  };
  const model = (c: CatProfile) => {
    const o = options(c.engine);
    if (o.models.includes(c.model) || o.fullModelPattern?.test(c.model)) return c.model;
    if (c.model === 'haiku' && c.engine === 'claude') return HAIKU_FULL_NAME;
    return o.models.includes('sonnet') ? 'sonnet' : o.models[0];
  };
  const effort = (c: CatProfile) => {
    const o = options(c.engine);
    return o.efforts.includes(c.effort) ? c.effort : (o.efforts[0] ?? c.effort);
  };
  // Parents before their reports, so every saved parent exists on the server.
  const ordered: CatProfile[] = [];
  const visit = (parent: string | null) => {
    for (const c of keep) {
      if (parentOf(c) !== parent || ordered.includes(c)) continue;
      ordered.push(c);
      visit(c.id);
    }
  };
  visit(null);
  const boss = ordered[0];
  if (!boss) return false;
  for (const c of ordered) {
    const profile = { ...c, model: model(c), effort: effort(c), parentId: parentOf(c) };
    delete profile.isDefault;
    wire.send({ type: 'saveCatProfile', profile: profile as WireCat });
  }
  wire.send({ type: 'promoteCatToBoss', id: boss.id });
  for (const c of serverCats) {
    if (!kept.has(c.id)) wire.send({ type: 'deleteCatProfile', id: c.id });
  }
  return true;
}
