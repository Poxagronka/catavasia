/** A fresh install has no cats: the onboarding creates them. Old installs keep theirs. */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CAT_TEMPLATES } from '../../core/src/catTemplates.js';
import {
  CatStore,
  legacyDefaultTeam,
  setFirstRunSeed,
  validateCat,
} from '../src/orchestrator/catProfiles.js';
import { Orchestrator } from '../src/orchestrator/orchestrator.js';
import { PromptRepo } from '../src/orchestrator/promptRepo.js';
import { FakeCatHost } from './catOfficeHarness.js';

const CATALOG = {
  claude: { models: ['opus', 'sonnet'], efforts: ['low', 'medium', 'high'] },
};

let dir: string;
const file = () => path.join(dir, 'cats.json');
const open = () => new CatStore(file(), () => CATALOG, new PromptRepo(path.join(dir, 'prompts')));

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'first-run-'));
  setFirstRunSeed(() => []);
});
afterEach(() => {
  setFirstRunSeed(legacyDefaultTeam);
  fs.rmSync(dir, { recursive: true, force: true });
});

function profile(t: (typeof CAT_TEMPLATES)[number]['cats'][number], parentId: string | null) {
  return {
    id: t.id,
    name: t.name,
    appearance: t.appearance,
    role: t.role,
    systemPrompt: t.prompt,
    personality: t.personality,
    engine: 'claude',
    model: parentId === null ? 'opus' : 'sonnet',
    effort: 'medium',
    parentId,
  };
}

describe('first run', () => {
  it('starts with no cats and writes no cats.json', () => {
    expect(open().list()).toEqual([]);
    expect(fs.existsSync(file())).toBe(false);
  });

  it('saves a whole template: the boss first, then the workers under it', () => {
    for (const template of CAT_TEMPLATES) {
      const store = open();
      const [boss, ...workers] = template.cats;
      expect(store.saveCat(profile(boss, null)).ok).toBe(true);
      for (const w of workers) expect(store.saveCat(profile(w, boss.id)).ok).toBe(true);
      expect(
        store
          .list()
          .filter((c) => c.parentId === null)
          .map((c) => c.id),
      ).toEqual([boss.id]);
      expect(store.list()).toHaveLength(4);
      expect(store.resetToDefaults({})).toBeUndefined();
      expect(store.list()).toEqual([]);
    }
  });

  it('runs an office with no cats: no targets, reset to the same empty state', () => {
    const office = new Orchestrator({
      host: new FakeCatHost(),
      stateDir: dir,
      adapters: [],
      emit: () => {},
      turnConcurrency: 2,
    });
    expect(office.targets()).toEqual([]);
    expect(office.resolveTarget('team')).toBeUndefined();
    expect(office.resetToDefaults()).toBeUndefined();
    expect(office.targets()).toEqual([]);
  });

  it('keeps an existing cats.json with the legacy default team', () => {
    setFirstRunSeed(legacyDefaultTeam);
    open();
    setFirstRunSeed(() => []);
    expect(
      open()
        .list()
        .map((c) => c.id),
    ).toEqual(['boss', 'murka', 'pushok', 'ryzhik']);
  });
});

describe('templates', () => {
  const cats = CAT_TEMPLATES.flatMap((t) => t.cats);

  it('has six teams of one boss and three workers with valid profiles', () => {
    expect(CAT_TEMPLATES).toHaveLength(6);
    for (const t of CAT_TEMPLATES) expect(t.cats).toHaveLength(4);
    for (const t of cats) {
      const result = validateCat(profile(t, null));
      expect(result.ok, `${t.id}: ${JSON.stringify(result)}`).toBe(true);
    }
  });

  it('gives every cat a unique id, name and look', () => {
    expect(new Set(cats.map((c) => c.id)).size).toBe(24);
    expect(new Set(cats.map((c) => c.name)).size).toBe(24);
    expect(new Set(cats.map((c) => JSON.stringify(c.appearance))).size).toBe(24);
    for (const t of CAT_TEMPLATES) {
      expect(new Set(t.cats.map((c) => c.appearance.breed)).size).toBe(4);
      expect(new Set(t.cats.map((c) => c.appearance.collar)).size).toBe(4);
    }
  });
});
