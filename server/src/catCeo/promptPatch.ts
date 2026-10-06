/**
 * Edit validation of the Cat CEO (cat-ceo-judge.md §7): every proposed item
 * edit passes each check, or it is refused with a reason. The accepted edits
 * of one cat become one new prompt file (one commit). `Role & conduct` is
 * never touched: the result keeps it byte-identical.
 */

import {
  CAT_CEO_ID,
  CAT_CEO_MAX_CHANGES_PER_COMMIT,
  PROMPT_ITEM_MAX_CHARS,
  PROMPT_LESSONS_MAX,
  PROMPT_RULES_MAX,
} from '../constants.js';
import { checkPromptFile, type PromptFile, type PromptItem } from '../orchestrator/promptFile.js';
import type { JudgeAnomaly, JudgeEdit } from './judgeSchema.js';
import { findSecret } from './secretScan.js';

export interface PatchContext {
  taskId: string;
  /** `YYYY-MM-DD` of the review (item suffix). */
  date: string;
  /** Cats of the task's team: only they may be edited. */
  team: string[];
  anomalies: JudgeAnomaly[];
  /** The cat's prompt file now. */
  read(catId: string): PromptFile;
  /** Cat CEO commits still allowed for this cat today (0: none). */
  commitsLeft(catId: string): number;
  /** Exact strings that must never enter a prompt (e.g. live tokens). */
  secrets?: string[];
}

export interface AppliedChange {
  op: JudgeEdit['op'];
  section: JudgeEdit['section'];
  itemId: string;
  text?: string;
  anomalyIds: string[];
}

export interface CatPatch {
  catId: string;
  file: PromptFile;
  changes: AppliedChange[];
}

export interface RejectedEdit {
  catId: string;
  reason: string;
  edit: JudgeEdit;
}

/** Lower case, punctuation dropped, spaces collapsed; the task or tidy suffix is not part of the idea. */
export function normalizeItem(text: string): string {
  return text
    .replace(/\s*\((?:task|tidy) [^,()]+, \d{4}-\d{2}-\d{2}\)\s*$/, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function jaccard(a: string, b: string): number {
  const x = new Set(a.split(' ').filter(Boolean));
  const y = new Set(b.split(' ').filter(Boolean));
  if (!x.size && !y.size) return 1;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both);
}

/** Same idea as an existing item: equal after normalizing, or token Jaccard >= 0.8. */
export function isDuplicate(text: string, items: PromptItem[]): boolean {
  const n = normalizeItem(text);
  return items.some((i) => {
    const m = normalizeItem(i.text);
    return m === n || jaccard(m, n) >= 0.8;
  });
}

function nextId(items: PromptItem[], prefix: 'R' | 'L'): string {
  const max = Math.max(0, ...items.map((i) => Number(i.id.slice(1)) || 0));
  return `${prefix}${max + 1}`;
}

/** One item line the server accepts (check 4), or the reason it does not. */
export function itemTextProblem(text: string): string | undefined {
  if (!text.trim()) return 'empty text';
  if (/[\r\n]/.test(text)) return 'text is more than one line';
  if (/^\s*#/.test(text)) return 'text starts with #';
  if (text.includes('<!--')) return 'text holds an HTML comment';
  if (text.includes('```')) return 'text holds a code fence';
  return undefined;
}

/** Check 1-7 for one edit against the cat's working copy. Returns the reason to refuse. */
function problemOf(edit: JudgeEdit, file: PromptFile, ctx: PatchContext, suffix: string) {
  if (!ctx.team.includes(edit.catId)) return `${edit.catId} is not in this task's team`;
  const strong = ctx.anomalies.filter((a) => a.severity !== 'low').map((a) => a.id);
  if (!edit.anomalyIds.some((id) => strong.includes(id))) {
    return 'an edit needs a medium or high anomaly';
  }
  const prefix = edit.section === 'Rules' ? 'R' : 'L';
  const items = edit.section === 'Rules' ? file.rules : file.lessons;
  if (edit.op !== 'add') {
    if (!edit.itemId) return `${edit.op} needs itemId`;
    if (edit.itemId[0] !== prefix) return `${edit.itemId} is not a ${edit.section} item`;
    if (!items.some((i) => i.id === edit.itemId)) return `${edit.itemId} does not exist`;
  }
  if (edit.op === 'remove') return undefined;
  const text = edit.text ?? '';
  const bad = itemTextProblem(text);
  if (bad) return bad;
  if (`${text.trim()} ${suffix}`.length > PROMPT_ITEM_MAX_CHARS) {
    return `text is longer than ${PROMPT_ITEM_MAX_CHARS} characters with the task suffix`;
  }
  const cap = edit.section === 'Rules' ? PROMPT_RULES_MAX : PROMPT_LESSONS_MAX;
  if (edit.op === 'add' && items.length >= cap) return `${edit.section} is full (${cap})`;
  const secret = findSecret(text, ctx.secrets);
  if (secret) return 'text looks like a secret or a private path';
  const others = [...file.rules, ...file.lessons].filter((i) => i.id !== edit.itemId);
  if (isDuplicate(text, others)) return 'the same idea is already an item';
  return undefined;
}

function applyOne(file: PromptFile, edit: JudgeEdit, suffix: string): AppliedChange {
  const key = edit.section === 'Rules' ? 'rules' : 'lessons';
  const prefix = edit.section === 'Rules' ? 'R' : 'L';
  const items = file[key];
  const text = edit.text ? `${edit.text.trim()} ${suffix}` : undefined;
  let itemId = edit.itemId ?? '';
  if (edit.op === 'add') {
    itemId = nextId(items, prefix);
    file[key] = [...items, { id: itemId, text: text! }];
  } else if (edit.op === 'replace') {
    // A replaced item gets a new id: the old id keeps meaning the old text in the history.
    const fresh = nextId(items, prefix);
    file[key] = items.map((i) => (i.id === itemId ? { id: fresh, text: text! } : i));
    itemId = fresh;
  } else {
    file[key] = items.filter((i) => i.id !== itemId);
  }
  return {
    op: edit.op,
    section: edit.section,
    itemId,
    ...(text ? { text } : {}),
    anomalyIds: edit.anomalyIds,
  };
}

/**
 * Validate the edits in schema order and build one new file per cat. Rate
 * limit (check 8): a cat with no commit left gets none; at most 3 changes per
 * commit; the edits beyond are refused.
 */
export function planEdits(
  edits: JudgeEdit[],
  ctx: PatchContext,
): { patches: CatPatch[]; rejected: RejectedEdit[] } {
  const suffix = `(task ${ctx.taskId}, ${ctx.date})`;
  const work = new Map<string, CatPatch>();
  const rejected: RejectedEdit[] = [];
  const refuse = (edit: JudgeEdit, reason: string) =>
    rejected.push({ catId: edit.catId, reason, edit });
  for (const edit of edits) {
    if (edit.catId === CAT_CEO_ID) {
      refuse(edit, 'the Cat CEO never edits its own prompt');
      continue;
    }
    let patch = work.get(edit.catId);
    if (!patch && ctx.team.includes(edit.catId)) {
      const now = ctx.read(edit.catId);
      patch = {
        catId: edit.catId,
        file: { role: now.role, rules: [...now.rules], lessons: [...now.lessons] },
        changes: [],
      };
    }
    const problem = patch ? problemOf(edit, patch.file, ctx, suffix) : undefined;
    if (!patch || problem) {
      refuse(edit, problem ?? `${edit.catId} is not in this task's team`);
      continue;
    }
    if (ctx.commitsLeft(edit.catId) <= 0) {
      refuse(edit, 'rate limit: no Cat CEO commit left for this cat today');
      continue;
    }
    if (patch.changes.length >= CAT_CEO_MAX_CHANGES_PER_COMMIT) {
      refuse(edit, `rate limit: at most ${CAT_CEO_MAX_CHANGES_PER_COMMIT} changes per commit`);
      continue;
    }
    const before = patch.file;
    const next: PromptFile = {
      role: before.role,
      rules: [...before.rules],
      lessons: [...before.lessons],
    };
    const change = applyOne(next, edit, suffix);
    const capProblem = checkPromptFile(next);
    if (capProblem) {
      refuse(edit, capProblem);
      continue;
    }
    patch.file = next;
    patch.changes.push(change);
    work.set(edit.catId, patch);
  }
  const patches = [...work.values()].filter((p) => p.changes.length > 0);
  for (const p of patches) {
    // Locked-section check: the Role of the new file is the Role of the old one, byte for byte.
    if (p.file.role !== ctx.read(p.catId).role) throw new Error('Role & conduct changed');
  }
  return { patches, rejected };
}
