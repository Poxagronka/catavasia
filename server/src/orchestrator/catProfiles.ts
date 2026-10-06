/**
 * Cat and pet profiles, the cat hierarchy, and the ~/.pixel-agents/cats.json
 * store (versioned, atomic tmp + rename writes).
 *
 * The shapes are the wire types (core/asyncapi.yaml), the same ones the Cats
 * menu uses (webview-ui/src/cats/catsApi.ts). The tree rules mirror
 * webview-ui/src/cats/hierarchy.ts: exactly one boss (`parentId: null`), any
 * depth, no cycles, a deleted cat's reports move up, a deleted boss hands over
 * to its first report, "promote to boss" puts the old boss under the new one.
 */

import * as fs from 'fs';
import * as path from 'path';

import type {
  CatAppearance,
  CatEngine,
  CatProfile,
  PetProfile,
} from '../../../core/src/messages.js';
import { CAT_NAME_MAX_CHARS, CAT_SYSTEM_PROMPT_MAX_CHARS } from '../constants.js';
import { bossOf, isInSubtree, normalizeHierarchy } from './catTree.js';

/** Breed preset ids in char_N order (= palette index). Mirrors scripts/cats/breeds.mjs names. */
export const CAT_BREED_IDS = [
  'marmalade',
  'smokey',
  'shadow',
  'snow',
  'tux',
  'patches',
  'tortie',
  'mochi',
  'nikolai',
  'butterscotch',
  'leo',
  'dobby',
  'bear',
] as const;

/** Values one engine CLI accepts, read from the installed binary. */
export interface EngineChoices {
  models: string[];
  efforts: string[];
  /** A full model name the CLI also accepts (e.g. `claude-...`). */
  fullModelPattern?: RegExp;
}

/** Engines with an adapter. An engine absent here cannot run a cat. */
export type EngineCatalog = Partial<Record<CatEngine, EngineChoices>>;

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const ID_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const ENGINES: readonly CatEngine[] = ['claude', 'codex'];
const PATTERNS = ['solid', 'tabby', 'tuxedo', 'calico', 'tortie', 'siamese', 'bengal', 'sweater'];
const LAYERS = ['fur', 'belly', 'stripe', 'patchA', 'patchB', 'point'] as const;

class ProfileError extends Error {}

function text(value: unknown, field: string, max: number, allowEmpty = false): string {
  if (typeof value !== 'string') throw new ProfileError(`${field} must be a string`);
  const trimmed = value.trim();
  if (!allowEmpty && !trimmed) throw new ProfileError(`${field} is empty`);
  if (trimmed.length > max) throw new ProfileError(`${field} is longer than ${max} characters`);
  return trimmed;
}

function id(value: unknown, field: string): string {
  if (typeof value !== 'string' || !ID_RE.test(value)) {
    throw new ProfileError(`${field} must match ^[a-z0-9][a-z0-9-]{0,31}$`);
  }
  return value;
}

function hex(value: unknown, field: string): string {
  if (typeof value !== 'string' || !HEX_RE.test(value)) {
    throw new ProfileError(`${field} must be #rrggbb`);
  }
  return value.toLowerCase();
}

function appearance(raw: unknown): CatAppearance {
  if (!raw || typeof raw !== 'object') throw new ProfileError('appearance must be an object');
  const rec = raw as Record<string, unknown>;
  const out: CatAppearance = {};
  if (rec.breed !== undefined) {
    if (!CAT_BREED_IDS.includes(rec.breed as (typeof CAT_BREED_IDS)[number])) {
      throw new ProfileError(`unknown breed "${String(rec.breed)}"`);
    }
    out.breed = rec.breed as string;
  }
  if (rec.pattern !== undefined) {
    if (typeof rec.pattern !== 'string' || !PATTERNS.includes(rec.pattern)) {
      throw new ProfileError(`unknown pattern "${String(rec.pattern)}"`);
    }
    out.pattern = rec.pattern as CatAppearance['pattern'];
  }
  if (rec.colors !== undefined) {
    if (!rec.colors || typeof rec.colors !== 'object')
      throw new ProfileError('colors must be an object');
    const colors = rec.colors as Record<string, unknown>;
    out.colors = {};
    for (const layer of LAYERS) {
      if (colors[layer] !== undefined) out.colors[layer] = hex(colors[layer], `colors.${layer}`);
    }
  }
  if (rec.eyes !== undefined) out.eyes = hex(rec.eyes, 'eyes');
  if (rec.collar !== undefined)
    out.collar = rec.collar === 'none' ? 'none' : hex(rec.collar, 'collar');
  return out;
}

function settle<T>(build: () => T): Result<T> {
  try {
    return { ok: true, value: build() };
  } catch (err) {
    if (err instanceof ProfileError) return { ok: false, error: err.message };
    throw err;
  }
}

/**
 * Validate and normalize one cat. Unknown fields are dropped. With `catalog`,
 * the engine must have an adapter and the model and effort must be values its
 * CLI accepts; without it (loading the file) only the shape is checked, so a
 * CLI upgrade never deletes a cat.
 */
export function validateCat(raw: unknown, catalog?: EngineCatalog): Result<CatProfile> {
  return settle(() => {
    if (!raw || typeof raw !== 'object') throw new ProfileError('profile must be an object');
    const rec = raw as Record<string, unknown>;
    const engine = rec.engine as CatEngine;
    if (!ENGINES.includes(engine)) throw new ProfileError(`unknown engine "${String(engine)}"`);
    const cat: CatProfile = {
      id: id(rec.id, 'id'),
      name: text(rec.name, 'name', CAT_NAME_MAX_CHARS),
      appearance: appearance(rec.appearance),
      role: text(rec.role, 'role', CAT_NAME_MAX_CHARS, true),
      systemPrompt: text(rec.systemPrompt, 'systemPrompt', CAT_SYSTEM_PROMPT_MAX_CHARS, true),
      engine,
      model: text(rec.model, 'model', CAT_NAME_MAX_CHARS * 2),
      effort: text(rec.effort, 'effort', CAT_NAME_MAX_CHARS),
      parentId:
        rec.parentId === null || rec.parentId === undefined ? null : id(rec.parentId, 'parentId'),
    };
    if (rec.isDefault === true) cat.isDefault = true;
    if (cat.parentId === cat.id) throw new ProfileError('a cat cannot report to itself');
    if (catalog) {
      const choices = catalog[engine];
      if (!choices) throw new ProfileError(`engine ${engine} is not available yet`);
      const fullName = choices.fullModelPattern?.test(cat.model) ?? false;
      if (!choices.models.includes(cat.model) && !fullName) {
        throw new ProfileError(
          `model "${cat.model}" is not accepted by ${engine}: use ${choices.models.join(', ')} or a full model name`,
        );
      }
      if (!choices.efforts.includes(cat.effort)) {
        throw new ProfileError(`effort must be one of ${choices.efforts.join(', ')}`);
      }
    }
    return cat;
  });
}

export function validatePet(raw: unknown): Result<PetProfile> {
  return settle(() => {
    if (!raw || typeof raw !== 'object') throw new ProfileError('pet must be an object');
    const rec = raw as Record<string, unknown>;
    if (rec.species !== 'cat') throw new ProfileError(`unknown species "${String(rec.species)}"`);
    return {
      id: id(rec.id, 'id'),
      name: text(rec.name, 'name', CAT_NAME_MAX_CHARS),
      species: 'cat',
      appearance: appearance(rec.appearance),
    };
  });
}

// ── Default team ────────────────────────────────────────────

const WORKER_PROMPT =
  'You are a careful developer cat. Do exactly the goal your lead gives you, in your own worktree. ' +
  'Keep changes small and tested. When done, call the office tool report with what you changed.';

/** Seeded when cats.json is missing: one Opus boss and three Sonnet workers. */
export function defaultTeam(): CatProfile[] {
  const worker = (catId: string, name: string, breed: string): CatProfile => ({
    id: catId,
    name,
    appearance: { breed },
    role: 'Developer',
    systemPrompt: WORKER_PROMPT,
    engine: 'claude',
    model: 'sonnet',
    effort: 'medium',
    parentId: 'boss',
    isDefault: true,
  });
  return [
    {
      id: 'boss',
      name: 'Barsik',
      appearance: { breed: 'marmalade' },
      role: 'Team lead',
      systemPrompt:
        'You lead a team of cats. Split the user task into independent parts, one per worker, ' +
        'so that no two workers edit the same file. Check the merged result before you report.',
      engine: 'claude',
      model: 'opus',
      effort: 'high',
      parentId: null,
      isDefault: true,
    },
    worker('murka', 'Murka', 'smokey'),
    worker('pushok', 'Pushok', 'snow'),
    worker('ryzhik', 'Ryzhik', 'nikolai'),
  ];
}

// ── Store ───────────────────────────────────────────────────

interface CatsFile {
  version: 1;
  cats: CatProfile[];
  pets: PetProfile[];
}

/** cats.json: every mutation validates, keeps the tree rules, and writes atomically. */
export class CatStore {
  private cats: CatProfile[] = [];
  private pets: PetProfile[] = [];

  constructor(
    private readonly filePath: string,
    private readonly catalog: () => EngineCatalog,
  ) {
    this.load();
  }

  list(): CatProfile[] {
    return this.cats.map((c) => ({ ...c }));
  }

  listPets(): PetProfile[] {
    return this.pets.map((p) => ({ ...p }));
  }

  get(catId: string): CatProfile | undefined {
    return this.cats.find((c) => c.id === catId);
  }

  /** Create or replace a cat; returns the saved cat, or an error. */
  saveCat(raw: unknown): Result<CatProfile> {
    const result = validateCat(raw, this.catalog());
    if (!result.ok) return result;
    const cat = result.value;
    if (cat.parentId !== null && !this.get(cat.parentId)) {
      return { ok: false, error: `parent ${cat.parentId} does not exist` };
    }
    const next = this.cats.some((c) => c.id === cat.id)
      ? this.cats.map((c) => (c.id === cat.id ? cat : c))
      : [...this.cats, cat];
    if (cat.parentId !== null && isInSubtree(next, cat.id, cat.parentId)) {
      return { ok: false, error: 'a cat cannot report to itself or to one of its reports' };
    }
    // A second cat with parentId null is not a new boss: promoteToBoss does that.
    const old = this.get(cat.id);
    const fixed = cat.parentId === null && old?.parentId !== null && this.cats.length > 0;
    this.commit(
      next.map((c) => (fixed && c.id === cat.id ? { ...c, parentId: bossOf(this.cats)!.id } : c)),
    );
    return { ok: true, value: this.get(cat.id)! };
  }

  /** Delete a cat. Its reports move to its parent; a deleted boss hands over to its first report. */
  removeCat(catId: string): string | undefined {
    const gone = this.get(catId);
    if (!gone) return `cat ${catId} does not exist`;
    const rest = this.cats.filter((c) => c.id !== catId);
    const heir = gone.parentId ?? rest.find((c) => c.parentId === catId)?.id ?? null;
    this.commit(
      rest.map((c) => {
        if (gone.parentId === null && c.id === heir) return { ...c, parentId: null };
        return c.parentId === catId ? { ...c, parentId: heir } : c;
      }),
    );
    return undefined;
  }

  /** Make `catId` report to `parentId`. Refuses unknown cats and cycles. */
  setParent(catId: string, parentId: string): string | undefined {
    if (!this.get(catId) || !this.get(parentId)) return 'unknown cat';
    if (isInSubtree(this.cats, catId, parentId)) {
      return 'a cat cannot report to itself or to one of its reports';
    }
    this.commit(this.cats.map((c) => (c.id === catId ? { ...c, parentId } : c)));
    return undefined;
  }

  /** `catId` becomes the boss; the old boss reports to it. */
  promoteToBoss(catId: string): string | undefined {
    if (!this.get(catId)) return 'unknown cat';
    const boss = bossOf(this.cats);
    if (!boss || boss.id === catId) return undefined;
    this.commit(
      this.cats.map((c) => {
        if (c.id === catId) return { ...c, parentId: null };
        if (c.id === boss.id) return { ...c, parentId: catId };
        return c;
      }),
    );
    return undefined;
  }

  savePet(raw: unknown): Result<PetProfile> {
    const result = validatePet(raw);
    if (!result.ok) return result;
    const pet = result.value;
    this.pets = this.pets.some((p) => p.id === pet.id)
      ? this.pets.map((p) => (p.id === pet.id ? pet : p))
      : [...this.pets, pet];
    this.write();
    return result;
  }

  removePet(petId: string): string | undefined {
    if (!this.pets.some((p) => p.id === petId)) return `pet ${petId} does not exist`;
    this.pets = this.pets.filter((p) => p.id !== petId);
    this.write();
    return undefined;
  }

  private commit(cats: CatProfile[]): void {
    this.cats = normalizeHierarchy(cats);
    this.write();
  }

  private load(): void {
    let raw: string;
    try {
      raw = fs.readFileSync(this.filePath, 'utf-8');
    } catch {
      this.commit(defaultTeam());
      return;
    }
    let parsed: Partial<CatsFile>;
    try {
      parsed = JSON.parse(raw) as Partial<CatsFile>;
      if (parsed.version !== 1 || !Array.isArray(parsed.cats)) throw new Error('unknown format');
    } catch (err) {
      // Never overwrite a file we cannot read: keep a copy, then start fresh.
      const backup = `${this.filePath}.bad-${Date.now()}`;
      fs.copyFileSync(this.filePath, backup);
      console.warn(
        `[Pixel Agents] Cats: ${this.filePath} unreadable (${err}); copied to ${backup}`,
      );
      this.commit(defaultTeam());
      return;
    }
    const keep = <T extends { id: string }>(
      entries: unknown[],
      check: (e: unknown) => Result<T>,
    ) => {
      const out: T[] = [];
      for (const entry of entries) {
        const result = check(entry);
        if (!result.ok)
          console.warn(`[Pixel Agents] Cats: dropped an invalid entry: ${result.error}`);
        else if (out.some((e) => e.id === result.value.id))
          console.warn(`[Pixel Agents] Cats: dropped duplicate ${result.value.id}`);
        else out.push(result.value);
      }
      return out;
    };
    this.cats = normalizeHierarchy(keep(parsed.cats, (e) => validateCat(e)));
    this.pets = keep(Array.isArray(parsed.pets) ? parsed.pets : [], validatePet);
  }

  private write(): void {
    const data: CatsFile = { version: 1, cats: this.cats, pets: this.pets };
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      console.error(`[Pixel Agents] Cats: failed to write ${this.filePath}: ${err}`);
    }
  }
}
