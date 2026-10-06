/**
 * The Cats menu over the server: local fallback until the server answers,
 * server snapshot and engine options, optimistic edits with the client
 * messages, inline rejections, and the one-time import of local cats.
 *
 * Run with: npm test
 */

import { describe, expect, it } from 'vitest';

import type { ClientMessage, ServerMessage } from '../../core/src/messages.js';
import type { CatProfile } from '../src/cats/catsApi.js';
import { createLocalCatsAdapter, localSeed, STORAGE_KEY } from '../src/cats/localCatsAdapter.js';
import { createServerCatsAdapter, MIGRATED_KEY } from '../src/cats/serverCatsAdapter.js';

const cat = (id: string, parentId: string | null, extra: Partial<CatProfile> = {}): CatProfile => ({
  id,
  name: id,
  appearance: { breed: 'marmalade' },
  role: '',
  systemPrompt: '',
  engine: 'claude',
  model: 'sonnet',
  effort: 'medium',
  parentId,
  ...extra,
});

const ENGINES = [
  { engine: 'claude' as const, models: ['fable', 'opus', 'sonnet'], efforts: ['low', 'medium'] },
];
const defaults = () => [
  cat('boss', null, { isDefault: true }),
  cat('murka', 'boss', { isDefault: true }),
  cat('pushok', 'boss', { isDefault: true }),
];

function memoryStore(init: Record<string, string> = {}) {
  const data = new Map(Object.entries(init));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

function setup(opts: { privileged?: boolean; store?: ReturnType<typeof memoryStore> } = {}) {
  const sent: ClientMessage[] = [];
  let handler: (m: ServerMessage) => void = () => {};
  const wire = {
    send: (m: ClientMessage) => void sent.push(m),
    onMessage: (h: (m: ServerMessage) => void) => {
      handler = h;
      return () => {};
    },
  };
  const store = opts.store ?? memoryStore();
  const api = createServerCatsAdapter(wire, createLocalCatsAdapter(store), {
    privileged: opts.privileged ?? true,
    store,
  });
  const load = (cats: CatProfile[]) =>
    handler({ type: 'catProfilesLoaded', cats: cats as never, engineOptions: ENGINES });
  return { api, sent, load, server: (m: ServerMessage) => handler(m), store };
}

describe('server cats adapter', () => {
  it('uses the local cats until the server office answers, then the server snapshot', () => {
    const { api, load, sent } = setup();
    expect(api.getSnapshot().cats.map((c) => c.id)).toEqual(localSeed().cats.map((c) => c.id));
    expect(api.engineOptions('claude').models).toContain('haiku');
    let notified = 0;
    api.subscribe(() => notified++);
    load(defaults());
    expect(notified).toBe(1);
    expect(api.getSnapshot().cats.map((c) => c.id)).toEqual(['boss', 'murka', 'pushok']);
    // Engine options come from the server; Codex stays listed but cannot run.
    expect(api.engineOptions('claude').models).toEqual(['fable', 'opus', 'sonnet']);
    expect(api.engineOptions('codex').unavailable).toContain('adapter not ready');
    expect(sent).toEqual([]);
  });

  it('applies edits at once, sends the client messages, and accepts full model names', () => {
    const { api, load, sent } = setup();
    load(defaults());
    api.saveCat(cat('mia', 'boss', { model: 'claude-haiku-4-5-20251001' }));
    expect(api.getSnapshot().cats.map((c) => c.id)).toContain('mia');
    api.setParent('mia', 'murka');
    api.promoteToBoss('murka');
    api.deleteCat('pushok');
    expect(sent.map((m) => m.type)).toEqual([
      'saveCatProfile',
      'setCatParent',
      'promoteCatToBoss',
      'deleteCatProfile',
    ]);
    expect(api.getSnapshot().cats.find((c) => c.parentId === null)?.id).toBe('murka');
    // Validation runs on the client too: an unknown alias never leaves.
    expect(() => api.saveCat(cat('x', 'boss', { model: 'haiku' }))).toThrow(/not offered/);
    expect(() => api.saveCat(cat('y', 'boss', { engine: 'codex' }))).toThrow(/adapter not ready/);
    expect(sent).toHaveLength(4);
  });

  it('shows a rejection inline and goes back to the last server snapshot', () => {
    const { api, load, server } = setup({ privileged: false });
    load(defaults());
    api.saveCat(cat('mia', 'boss'));
    server({ type: 'catProfileRejected', id: 'mia', error: 'Editing cats needs the server token' });
    expect(api.getSnapshot().cats.map((c) => c.id)).toEqual(['boss', 'murka', 'pushok']);
    expect(api.getSnapshot().rejected).toEqual({
      id: 'mia',
      error: 'Editing cats needs the server token',
    });
    load(defaults());
    expect(api.getSnapshot().rejected).toBeUndefined();
  });

  it('imports edited local cats once when the server holds only its default team', () => {
    const local = [
      cat('lead', null, { name: 'Lead' }),
      cat('kodi', 'lead', { engine: 'codex', model: 'gpt-6-astra' }),
      cat('dev', 'kodi', { model: 'haiku' }),
    ];
    const store = memoryStore({ [STORAGE_KEY]: JSON.stringify({ cats: local }) });
    const { load, sent } = setup({ store });
    load(defaults());
    expect(store.data.get(MIGRATED_KEY)).toBeTruthy();
    expect(sent).toEqual([
      { type: 'saveCatProfile', profile: expect.objectContaining({ id: 'lead', parentId: null }) },
      // The Codex cat is skipped; its report moves up. Haiku becomes its full name.
      {
        type: 'saveCatProfile',
        profile: expect.objectContaining({
          id: 'dev',
          parentId: 'lead',
          model: 'claude-haiku-4-5-20251001',
        }),
      },
      { type: 'promoteCatToBoss', id: 'lead' },
      { type: 'deleteCatProfile', id: 'boss' },
      { type: 'deleteCatProfile', id: 'murka' },
      { type: 'deleteCatProfile', id: 'pushok' },
    ]);
    // Never twice.
    const again = setup({ store });
    again.load(defaults());
    expect(again.sent).toEqual([]);
  });

  it('imports nothing without the token, for an edited server team, or for the untouched seed', () => {
    const edited = JSON.stringify({ cats: [cat('lead', null)] });
    const a = setup({ privileged: false, store: memoryStore({ [STORAGE_KEY]: edited }) });
    a.load(defaults());
    const b = setup({ store: memoryStore({ [STORAGE_KEY]: edited }) });
    b.load([cat('boss', null)]);
    const c = setup({
      store: memoryStore({ [STORAGE_KEY]: JSON.stringify(localSeed()) }),
    });
    c.load(defaults());
    expect([a.sent, b.sent, c.sent]).toEqual([[], [], []]);
  });
});
