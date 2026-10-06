import { describe, expect, it } from 'vitest';

import {
  BREED_IDS,
  BREED_PRESETS,
  COAT_PRESETS,
  fromHex,
  renderAppearance,
  resolveBreed,
  toHex,
} from '../src/cats/catArt.js';
import type { CatProfile, PetProfile } from '../src/cats/catsApi.js';
import { validateCatProfile, validatePetProfile } from '../src/cats/catsApi.js';
import {
  buildTree,
  findBoss,
  HierarchyError,
  isInSubtree,
  moveCat,
  normalizeHierarchy,
  promoteToBoss,
  removeCat,
} from '../src/cats/hierarchy.js';
import { createLocalCatsAdapter, STORAGE_KEY } from '../src/cats/localCatsAdapter.js';

const cat = (id: string, parentId: string | null): CatProfile => ({
  id,
  name: id,
  appearance: {},
  role: '',
  systemPrompt: '',
  engine: 'claude',
  model: 'sonnet',
  effort: 'medium',
  parentId,
});

/** boss → a → a1, boss → b */
const team = () => [cat('boss', null), cat('a', 'boss'), cat('a1', 'a'), cat('b', 'boss')];
const parentOf = (cats: CatProfile[], id: string) => cats.find((c) => c.id === id)?.parentId;
const opaque = (sprite: string[][]) => sprite.flat().filter((p) => p !== '');

describe('appearance generation', () => {
  it('renders every breed preset in all three directions', () => {
    expect(BREED_PRESETS).toHaveLength(13);
    for (const preset of BREED_PRESETS) {
      const frames = renderAppearance(preset.appearance);
      for (const dir of ['down', 'up', 'right'] as const) {
        expect(frames[dir].length).toBeGreaterThanOrEqual(7);
        expect(frames[dir][0]).toHaveLength(32);
        expect(frames[dir][0][0]).toHaveLength(16);
        expect(opaque(frames[dir][0]).length).toBeGreaterThan(100);
      }
    }
  });

  it('renders every coat preset, and offers more coats for pets than breeds', () => {
    expect(COAT_PRESETS.length).toBeGreaterThan(13);
    for (const preset of COAT_PRESETS)
      expect(opaque(renderAppearance(preset.appearance)['down'][1]).length).toBeGreaterThan(100);
  });

  it('applies a custom fur colour', () => {
    const fur = toHex([32, 192, 96]);
    const sprite = renderAppearance({ breed: 'nikolai', colors: { fur } })['down'][1];
    expect(opaque(sprite)).toContain(fur);
    expect(opaque(renderAppearance({ breed: 'nikolai' })['down'][1])).not.toContain(fur);
  });

  it('applies eyes, collar and pattern overrides', () => {
    const eyes = toHex([255, 0, 170]);
    const collar = toHex([0, 17, 238]);
    const sprite = renderAppearance({ breed: 'snow', eyes, collar })['down'][1];
    expect(opaque(sprite)).toContain(eyes);
    expect(opaque(sprite)).toContain(collar);
    expect(resolveBreed({ breed: 'marmalade', collar: 'none' }).collar).toBeNull();
    const stripe = toHex([16, 32, 48]);
    const tabby = renderAppearance({ breed: 'nikolai', pattern: 'tabby', colors: { stripe } });
    expect(opaque(tabby['down'][1])).toContain(stripe);
    expect(resolveBreed({ breed: 'marmalade', pattern: 'solid' }).pattern).toBeUndefined();
  });

  it('round-trips hex colours', () => {
    expect(fromHex(toHex([161, 178, 195]))).toEqual([161, 178, 195]);
  });

  it('drops pattern-specific paws when the pattern changes', () => {
    expect(resolveBreed({ breed: 'tux', pattern: 'solid' }).paw).toBeUndefined();
    expect(resolveBreed({ breed: 'mochi', pattern: 'tabby' }).paw).toBeUndefined();
    expect(resolveBreed({ breed: 'nikolai', pattern: 'siamese' }).paw).toEqual(
      resolveBreed({ breed: 'mochi' }).paw,
    );
  });
});

describe('hierarchy operations', () => {
  it('moves a cat under a new parent', () => {
    const moved = moveCat(team(), 'b', 'a');
    expect(parentOf(moved, 'b')).toBe('a');
    expect(buildTree(moved)?.children.map((n) => n.cat.id)).toEqual(['a']);
  });

  it('rejects cycles and self-parenting', () => {
    expect(() => moveCat(team(), 'a', 'a1')).toThrow(HierarchyError);
    expect(() => moveCat(team(), 'a', 'a')).toThrow(HierarchyError);
    expect(() => moveCat(team(), 'boss', 'b')).toThrow(HierarchyError);
    expect(isInSubtree(team(), 'a', 'a1')).toBe(true);
    expect(isInSubtree(team(), 'b', 'a1')).toBe(false);
  });

  it('promotes a cat to boss and puts the old boss under it', () => {
    const next = promoteToBoss(team(), 'a1');
    expect(findBoss(next)?.id).toBe('a1');
    expect(parentOf(next, 'boss')).toBe('a1');
    expect(parentOf(next, 'a')).toBe('boss');
    expect(next.filter((c) => c.parentId === null)).toHaveLength(1);
    expect(buildTree(next)?.cat.id).toBe('a1');
  });

  it('removes a cat and moves its reports up; a removed boss hands over', () => {
    expect(parentOf(removeCat(team(), 'a'), 'a1')).toBe('boss');
    const headless = removeCat(team(), 'boss');
    expect(findBoss(headless)?.id).toBe('a');
    expect(parentOf(headless, 'b')).toBe('a');
  });

  it('normalizes broken data to one boss and no cycles', () => {
    const broken = [
      cat('x', 'y'),
      cat('y', 'x'),
      cat('boss', null),
      cat('z', 'ghost'),
      cat('w', null),
    ];
    const fixed = normalizeHierarchy(broken);
    expect(fixed.filter((c) => c.parentId === null).map((c) => c.id)).toEqual(['boss']);
    for (const c of fixed) expect(isInSubtree(fixed, 'boss', c.id)).toBe(true);
  });
});

describe('profile validation', () => {
  const options = { models: ['opus', 'sonnet'], efforts: ['low', 'medium'] };

  it('accepts a valid cat and pet', () => {
    expect(validateCatProfile(cat('a', null), options, BREED_IDS)).toEqual([]);
    const pet: PetProfile = {
      id: 'p',
      name: 'Biscuit',
      species: 'cat',
      appearance: { breed: 'tux' },
    };
    expect(validatePetProfile(pet, BREED_IDS)).toEqual([]);
  });

  it('reports each broken field', () => {
    const bad: CatProfile = {
      ...cat('a', 'a'),
      name: '  ',
      model: 'gpt-1',
      effort: 'turbo',
      appearance: {
        breed: 'lion',
        colors: { fur: 'red' },
        eyes: toHex([1, 2, 3]).slice(0, 6),
        collar: 'blue',
      },
    };
    const errors = validateCatProfile(bad, options, BREED_IDS).join('\n');
    for (const part of ['name', 'model', 'effort', 'breed', 'fur', 'eyes', 'collar', 'itself'])
      expect(errors).toContain(part);
  });
});

describe('local adapter', () => {
  const memoryStore = () => {
    const data = new Map<string, string>();
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      data,
    };
  };

  it('seeds a boss, persists saves and notifies subscribers', () => {
    const store = memoryStore();
    const api = createLocalCatsAdapter(store);
    expect(findBoss(api.getSnapshot().cats)).toBeDefined();
    let calls = 0;
    api.subscribe(() => calls++);
    api.saveCat({ ...cat('new', 'boss'), name: 'Newbie' });
    expect(calls).toBe(1);
    const reloaded = createLocalCatsAdapter(store);
    expect(reloaded.getSnapshot().cats.some((c) => c.name === 'Newbie')).toBe(true);
    expect(store.data.has(STORAGE_KEY)).toBe(true);
  });

  it('throws on invalid input and leaves the state unchanged', () => {
    const api = createLocalCatsAdapter(memoryStore());
    const before = api.getSnapshot();
    expect(() => api.saveCat({ ...cat('x', 'boss'), name: '' })).toThrow();
    expect(() => api.setParent('boss', 'dev')).toThrow(HierarchyError);
    expect(api.getSnapshot()).toBe(before);
  });
});
