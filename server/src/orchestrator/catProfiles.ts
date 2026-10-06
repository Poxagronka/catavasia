/**
 * Cat profiles and the cat hierarchy: validation, tree helpers, and the
 * ~/.pixel-agents/cats.json store (versioned, atomic tmp + rename writes).
 *
 * A profile is the whole definition of one cat: look, role, system prompt,
 * engine, model, effort, and `parentId` (absent = root). The tree may have any
 * depth; a save that would create a cycle is refused.
 */

import * as fs from 'fs';
import * as path from 'path';

import type { CatAppearance, CatEngine, CatProfile } from '../../../core/src/messages.js';
import {
  CAT_NAME_MAX_CHARS,
  CAT_SYSTEM_PROMPT_MAX_CHARS,
  HUE_SHIFT_MAX_DEG,
  PALETTE_COUNT,
} from '../constants.js';

/** Values one engine CLI accepts, read from the installed binary. */
export interface EngineChoices {
  models: string[];
  efforts: string[];
  /** A full model name the CLI also accepts (e.g. `claude-...`). */
  fullModelPattern?: RegExp;
}

/** Engines with an adapter. An engine absent here cannot run a cat. */
export type EngineCatalog = Partial<Record<CatEngine, EngineChoices>>;

export type ProfileResult = { ok: true; profile: CatProfile } | { ok: false; error: string };

const ID_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const ENGINES: readonly CatEngine[] = ['claude', 'codex'];
const PATTERNS = ['solid', 'tabby', 'tuxedo', 'calico', 'tortie', 'siamese', 'bengal', 'sphynx'];
const COLOR_KEYS = ['fur', 'shade', 'light', 'belly', 'stripe', 'eyes', 'collar'] as const;

function text(value: unknown, field: string, max: number, allowEmpty = false): string {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  const trimmed = value.trim();
  if (!allowEmpty && !trimmed) throw new Error(`${field} is empty`);
  if (trimmed.length > max) throw new Error(`${field} is longer than ${max} characters`);
  return trimmed;
}

function appearance(raw: unknown): CatAppearance {
  if (!raw || typeof raw !== 'object') throw new Error('appearance must be an object');
  const rec = raw as Record<string, unknown>;
  const out: CatAppearance = {};
  if (rec.breed !== undefined) {
    if (
      !Number.isInteger(rec.breed) ||
      (rec.breed as number) < 0 ||
      (rec.breed as number) >= PALETTE_COUNT
    ) {
      throw new Error(`appearance.breed must be an integer 0..${PALETTE_COUNT - 1}`);
    }
    out.breed = rec.breed as number;
  }
  if (rec.hueShift !== undefined) {
    const h = rec.hueShift;
    if (!Number.isInteger(h) || (h as number) < 0 || (h as number) > HUE_SHIFT_MAX_DEG) {
      throw new Error(`appearance.hueShift must be an integer 0..${HUE_SHIFT_MAX_DEG}`);
    }
    out.hueShift = h as number;
  }
  if (rec.pattern !== undefined) {
    if (typeof rec.pattern !== 'string' || !PATTERNS.includes(rec.pattern)) {
      throw new Error(`appearance.pattern must be one of ${PATTERNS.join(', ')}`);
    }
    out.pattern = rec.pattern as CatAppearance['pattern'];
  }
  for (const key of COLOR_KEYS) {
    const v = rec[key];
    if (v === undefined) continue;
    if (typeof v !== 'string' || !HEX_RE.test(v))
      throw new Error(`appearance.${key} must be #rrggbb`);
    out[key] = v.toLowerCase();
  }
  if (out.breed === undefined && (out.pattern === undefined || out.fur === undefined)) {
    throw new Error('appearance needs a breed, or a custom pattern with a fur colour');
  }
  return out;
}

/**
 * Validate and normalize one profile. Unknown fields are dropped. With
 * `catalog`, the engine must have an adapter and the model and effort must be
 * values that engine's CLI accepts; without it (loading the file) only the
 * shape is checked, so a CLI upgrade never deletes a cat.
 */
export function validateProfile(raw: unknown, catalog?: EngineCatalog): ProfileResult {
  try {
    if (!raw || typeof raw !== 'object') throw new Error('profile must be an object');
    const rec = raw as Record<string, unknown>;
    if (typeof rec.id !== 'string' || !ID_RE.test(rec.id)) {
      throw new Error('id must match ^[a-z0-9][a-z0-9-]{0,31}$');
    }
    const engine = rec.engine as CatEngine;
    if (!ENGINES.includes(engine)) throw new Error(`engine must be one of ${ENGINES.join(', ')}`);
    const profile: CatProfile = {
      id: rec.id,
      name: text(rec.name, 'name', CAT_NAME_MAX_CHARS),
      role: text(rec.role, 'role', CAT_NAME_MAX_CHARS, true),
      systemPrompt: text(rec.systemPrompt, 'systemPrompt', CAT_SYSTEM_PROMPT_MAX_CHARS, true),
      engine,
      model: text(rec.model, 'model', CAT_NAME_MAX_CHARS * 2),
      appearance: appearance(rec.appearance),
    };
    if (rec.effort !== undefined && rec.effort !== '') {
      profile.effort = text(rec.effort, 'effort', CAT_NAME_MAX_CHARS);
    }
    if (rec.parentId !== undefined && rec.parentId !== '') {
      if (typeof rec.parentId !== 'string' || !ID_RE.test(rec.parentId)) {
        throw new Error('parentId must be a cat id');
      }
      if (rec.parentId === profile.id) throw new Error('a cat cannot be its own parent');
      profile.parentId = rec.parentId;
    }
    if (catalog) {
      const choices = catalog[engine];
      if (!choices) throw new Error(`engine ${engine} is not available yet`);
      const fullName = choices.fullModelPattern?.test(profile.model) ?? false;
      if (!choices.models.includes(profile.model) && !fullName) {
        throw new Error(
          `model ${profile.model} is not accepted by ${engine}: use ${choices.models.join(', ')} or a full model name`,
        );
      }
      if (profile.effort !== undefined && !choices.efforts.includes(profile.effort)) {
        throw new Error(`effort must be one of ${choices.efforts.join(', ')}`);
      }
    }
    return { ok: true, profile };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Tree helpers ────────────────────────────────────────────

export function childrenOf(cats: readonly CatProfile[], id: string): CatProfile[] {
  return cats.filter((c) => c.parentId === id);
}

export function rootsOf(cats: readonly CatProfile[]): CatProfile[] {
  return cats.filter((c) => c.parentId === undefined);
}

export function hierarchyOf(cats: readonly CatProfile[]): {
  roots: string[];
  children: Record<string, string[]>;
} {
  const children: Record<string, string[]> = {};
  for (const cat of cats) {
    if (cat.parentId !== undefined) (children[cat.parentId] ??= []).push(cat.id);
  }
  return { roots: rootsOf(cats).map((c) => c.id), children };
}

/** True when giving `id` the parent `parentId` would close a loop. */
export function createsCycle(cats: readonly CatProfile[], id: string, parentId: string): boolean {
  const byId = new Map(cats.map((c) => [c.id, c]));
  let cursor: string | undefined = parentId;
  for (let hops = 0; cursor !== undefined && hops <= cats.length; hops++) {
    if (cursor === id) return true;
    cursor = byId.get(cursor)?.parentId;
  }
  return false;
}

export type Relation = 'parent' | 'child' | 'sibling';

/** How `to` stands to `from` in the tree, or null when they are not adjacent. */
export function relationOf(cats: readonly CatProfile[], from: string, to: string): Relation | null {
  const a = cats.find((c) => c.id === from);
  const b = cats.find((c) => c.id === to);
  if (!a || !b || a.id === b.id) return null;
  if (a.parentId === b.id) return 'parent';
  if (b.parentId === a.id) return 'child';
  if (a.parentId !== undefined && a.parentId === b.parentId) return 'sibling';
  return null;
}

// ── Default team ────────────────────────────────────────────

const WORKER_PROMPT =
  'You are a careful developer cat. Do exactly the goal your lead gives you, in your own worktree. ' +
  'Keep changes small and tested. When done, call the office tool report with what you changed.';

/** Seeded when cats.json is missing: one Opus boss and three Sonnet workers. */
export function defaultTeam(): CatProfile[] {
  const worker = (id: string, name: string, breed: number): CatProfile => ({
    id,
    name,
    role: 'Developer',
    systemPrompt: WORKER_PROMPT,
    engine: 'claude',
    model: 'sonnet',
    parentId: 'boss',
    appearance: { breed },
  });
  return [
    {
      id: 'boss',
      name: 'Barsik',
      role: 'Team lead',
      systemPrompt:
        'You lead a team of cats. Split the user task into independent parts, one per worker, ' +
        'so that no two workers edit the same file. Check the merged result before you report.',
      engine: 'claude',
      model: 'opus',
      appearance: { breed: 0 },
    },
    worker('murka', 'Murka', 1),
    worker('pushok', 'Pushok', 3),
    worker('ryzhik', 'Ryzhik', 8),
  ];
}

// ── Store ───────────────────────────────────────────────────

interface CatsFile {
  version: 1;
  cats: CatProfile[];
}

export class CatStore {
  private cats: CatProfile[];

  constructor(
    private readonly filePath: string,
    private readonly catalog: () => EngineCatalog,
  ) {
    this.cats = this.load();
  }

  list(): CatProfile[] {
    return this.cats.map((c) => ({ ...c }));
  }

  get(id: string): CatProfile | undefined {
    return this.cats.find((c) => c.id === id);
  }

  /** Create or replace one profile. The parent must exist and form no cycle. */
  save(raw: unknown): ProfileResult {
    const result = validateProfile(raw, this.catalog());
    if (!result.ok) return result;
    const { profile } = result;
    if (profile.parentId !== undefined) {
      if (!this.get(profile.parentId)) {
        return { ok: false, error: `parent ${profile.parentId} does not exist` };
      }
      if (createsCycle(this.cats, profile.id, profile.parentId)) {
        return {
          ok: false,
          error: `${profile.parentId} reports to ${profile.id}: that is a cycle`,
        };
      }
    }
    const index = this.cats.findIndex((c) => c.id === profile.id);
    if (index >= 0) this.cats[index] = profile;
    else this.cats.push(profile);
    this.write();
    return { ok: true, profile };
  }

  /** Delete one cat. Its reports move up to its parent (or become roots). */
  remove(id: string): string | undefined {
    const cat = this.get(id);
    if (!cat) return `cat ${id} does not exist`;
    this.cats = this.cats.filter((c) => c.id !== id);
    for (const child of this.cats) {
      if (child.parentId !== id) continue;
      if (cat.parentId === undefined) delete child.parentId;
      else child.parentId = cat.parentId;
    }
    this.write();
    return undefined;
  }

  private load(): CatProfile[] {
    let raw: string;
    try {
      raw = fs.readFileSync(this.filePath, 'utf-8');
    } catch {
      this.cats = defaultTeam();
      this.write();
      return this.cats;
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
      this.cats = defaultTeam();
      this.write();
      return this.cats;
    }
    const cats: CatProfile[] = [];
    for (const entry of parsed.cats) {
      const result = validateProfile(entry);
      if (!result.ok) {
        console.warn(`[Pixel Agents] Cats: dropped an invalid cat: ${result.error}`);
      } else if (cats.some((c) => c.id === result.profile.id)) {
        console.warn(`[Pixel Agents] Cats: dropped a duplicate cat id ${result.profile.id}`);
      } else {
        cats.push(result.profile);
      }
    }
    // A dangling parent or a hand-made cycle makes the cat a root.
    for (const cat of cats) {
      if (cat.parentId === undefined) continue;
      const others = cats.filter((c) => c !== cat);
      if (!cats.some((c) => c.id === cat.parentId) || createsCycle(others, cat.id, cat.parentId)) {
        delete cat.parentId;
      }
    }
    return cats;
  }

  private write(): void {
    const data: CatsFile = { version: 1, cats: this.cats };
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
