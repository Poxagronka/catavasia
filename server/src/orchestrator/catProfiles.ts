/**
 * Cat profiles, the cat hierarchy, and the ~/.pixel-agents/cats.json
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

import type { CatAppearance, CatEngine, CatProfile } from '../../../core/src/messages.js';
import { CAT_NAME_MAX_CHARS, CAT_SYSTEM_PROMPT_MAX_CHARS } from '../constants.js';
import { bossOf, isInSubtree, normalizeHierarchy } from './catTree.js';
import type { PromptFile, PromptItem } from './promptFile.js';
import type { PromptRepo } from './promptRepo.js';

/** Breed preset ids in char_N order (= palette index). Mirrors scripts/cats/breeds.mjs ids (else names). */
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
      // Since the prompt files, cats.json holds no systemPrompt: it is the Role section.
      systemPrompt:
        rec.systemPrompt === undefined
          ? ''
          : text(rec.systemPrompt, 'systemPrompt', CAT_SYSTEM_PROMPT_MAX_CHARS, true),
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
      name: 'Oliver',
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
    // The ids predate the English names: prompt files and branches are keyed by them.
    worker('murka', 'Luna', 'smokey'),
    worker('pushok', 'Milo', 'snow'),
    worker('ryzhik', 'Pepper', 'nikolai'),
  ];
}

/** Default names before the English ones, by cat id: load() renames a cat that still has one. */
const OLD_DEFAULT_NAMES: Record<string, string> = {
  boss: 'Barsik',
  murka: 'Murka',
  pushok: 'Pushok',
  ryzhik: 'Ryzhik',
};

// ── Store ───────────────────────────────────────────────────

interface CatsFile {
  version: 1;
  cats: CatProfile[];
  /** The Cat CEO settings (server/src/catCeo/ceoSettings.ts reads them). */
  catCeo?: unknown;
}

/**
 * cats.json: every mutation validates, keeps the tree rules, and writes atomically.
 * The prompt text of each cat lives in its prompt file (PromptRepo): the wire
 * field `systemPrompt` carries its `Role & conduct` section.
 */
export class CatStore {
  private cats: CatProfile[] = [];
  /** The raw `catCeo` block: kept as is, written back on every save. */
  private ceoBlock: unknown;
  /** Why a cat's prompt file on disk is not used (it does not parse). */
  private readonly promptErrors = new Map<string, string>();

  constructor(
    private readonly filePath: string,
    private readonly catalog: () => EngineCatalog,
    readonly prompts: PromptRepo,
  ) {
    this.load();
  }

  /** Rules and Lessons of a cat's prompt file (read-only in the Cats menu), and its parse error. */
  promptView(catId: string): { rules: PromptItem[]; lessons: PromptItem[]; promptError?: string } {
    const { file } = this.prompts.read(catId);
    const promptError = this.promptErrors.get(catId);
    return { rules: file.rules, lessons: file.lessons, ...(promptError ? { promptError } : {}) };
  }

  list(): CatProfile[] {
    return this.cats.map((c) => ({ ...c }));
  }

  get(catId: string): CatProfile | undefined {
    return this.cats.find((c) => c.id === catId);
  }

  get catCeo(): unknown {
    return this.ceoBlock;
  }

  setCatCeo(block: unknown): void {
    this.ceoBlock = block;
    this.write();
  }

  /**
   * Re-read a cat's prompt file after a history change (revert, restore, item
   * edit): the in-memory Role and the parse error follow the file.
   */
  reloadPrompt(catId: string): void {
    const cat = this.get(catId);
    const { file, error } = this.prompts.read(catId);
    if (error) this.promptErrors.set(catId, error);
    else this.promptErrors.delete(catId);
    if (cat) cat.systemPrompt = file.role;
  }

  /** Create or replace a cat; returns the saved cat, or an error. */
  saveCat(raw: unknown): Result<CatProfile> {
    const result = validateCat(raw, this.catalog());
    if (!result.ok) return result;
    const cat = result.value;
    if (cat.parentId !== null && !this.get(cat.parentId)) {
      return { ok: false, error: `parent ${cat.parentId} does not exist` };
    }
    const before = this.get(cat.id);
    const next = this.cats.some((c) => c.id === cat.id)
      ? this.cats.map((c) => (c.id === cat.id ? cat : c))
      : [...this.cats, cat];
    if (cat.parentId !== null && isInSubtree(next, cat.id, cat.parentId)) {
      return { ok: false, error: 'a cat cannot report to itself or to one of its reports' };
    }
    if (!before || before.systemPrompt !== cat.systemPrompt) {
      const subject = before ? 'edit Role & conduct' : 'create';
      const error = this.saveRole(cat.id, cat.systemPrompt, subject);
      if (error) return { ok: false, error };
    }
    // A second cat with parentId null is not a new boss: promoteToBoss does that.
    const fixed = cat.parentId === null && before?.parentId !== null && this.cats.length > 0;
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
    this.prompts.remove(catId, `user(${catId}): delete`);
    this.promptErrors.delete(catId);
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

  /**
   * The default team again, with fresh prompt files: `extra` adds the prompt
   * files of non-cats (the Cat CEO). Every other prompt file is deleted, all in
   * one commit. Returns an error, and changes nothing, when a file would not parse.
   */
  resetToDefaults(extra: Record<string, PromptFile>): string | undefined {
    const team = defaultTeam();
    const files = { ...extra };
    for (const cat of team) files[cat.id] = { role: cat.systemPrompt, rules: [], lessons: [] };
    const error = this.prompts.replaceAll(files, 'user(all): reset to defaults');
    if (error) return error;
    this.promptErrors.clear();
    this.commit(team);
    for (const cat of team) this.reloadPrompt(cat.id);
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
      this.syncPrompts();
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
      this.syncPrompts();
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
    this.ceoBlock = parsed.catCeo;
    const team = defaultTeam();
    let renamed = false;
    this.cats = normalizeHierarchy(keep(parsed.cats, (e) => validateCat(e))).map((cat) => {
      if (OLD_DEFAULT_NAMES[cat.id] !== cat.name) return cat;
      renamed = true;
      return { ...cat, name: team.find((d) => d.id === cat.id)!.name };
    });
    this.syncPrompts();
    // The prompt text moved to the prompt files: cats.json drops it.
    if (
      renamed ||
      parsed.cats.some((c) => (c as { systemPrompt?: unknown })?.systemPrompt !== undefined)
    ) {
      this.write();
    }
  }

  /** The Role section of a cat's prompt file (Rules and Lessons stay). */
  private saveRole(catId: string, role: string, subject: string): string | undefined {
    const { file } = this.prompts.read(catId);
    const error = this.prompts.write(catId, { ...file, role }, `user(${catId}): ${subject}`);
    if (!error) this.promptErrors.delete(catId);
    return error;
  }

  /**
   * Each cat gets its prompt file (migration: Role = the old systemPrompt), a
   * hand edit on disk is committed, and the in-memory systemPrompt = the Role.
   */
  private syncPrompts(): void {
    for (const cat of this.cats) {
      if (!this.prompts.exists(cat.id)) {
        // An old prompt may use the section headings as its own: they become level 2.
        const role = cat.systemPrompt.replace(
          /^# (Role & conduct|Rules|Lessons)[ \t]*$/gm,
          '## $1',
        );
        const error = this.saveRole(cat.id, role, 'import from cats.json');
        if (error) {
          // cats.json keeps the old text (write() keeps it while the file is missing).
          console.warn(`[Pixel Agents] Cats: prompt of ${cat.id} not saved: ${error}`);
          continue;
        }
      } else {
        this.prompts.commitHandEdit(cat.id);
      }
      const { file, error } = this.prompts.read(cat.id);
      if (error) this.promptErrors.set(cat.id, error);
      else this.promptErrors.delete(cat.id);
      cat.systemPrompt = file.role;
    }
  }

  private write(): void {
    // The prompt text lives in the prompt file; a cat without a file keeps it here.
    const cats = this.cats.map(({ systemPrompt, ...rest }) =>
      this.prompts.exists(rest.id) ? rest : { ...rest, systemPrompt },
    );
    const data = {
      version: 1,
      cats,
      ...(this.ceoBlock === undefined ? {} : { catCeo: this.ceoBlock }),
    };
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
