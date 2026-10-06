/**
 * Validation of a Cat CEO tidy (cat-ceo-judge.md §14.3). Each op passes
 * every check, or it is refused with a reason:
 *
 * - ids exist in the op's section, and no id is in two ops;
 * - merge cites two or more source ids, rewrite exactly one, both need text;
 * - text: one line, no heading, no fence, no secret, not a duplicate of an
 *   item that stays, not longer than its sources (net size never grows);
 * - items of the user: a remove is only marked (a suggestion row), a merge
 *   or rewrite is applied only with "CEO may tidy my items", else marked;
 * - at most CAT_CEO_TIDY_MAX_CHANGES applied changes; caps of the file hold;
 * - Role & conduct stays byte-identical.
 *
 * A rewrite keeps the item id (same meaning). A merge gets a new id at the
 * place of its first source: the old ids keep their old text in the history.
 */

import type { TidyRow } from '../../../core/src/messages.js';
import { CAT_CEO_TIDY_MAX_CHANGES, PROMPT_ITEM_MAX_CHARS } from '../constants.js';
import { checkPromptFile, type PromptFile, type PromptItem } from '../orchestrator/promptFile.js';
import { isDuplicate, itemTextProblem } from './promptPatch.js';
import { findSecret } from './secretScan.js';
import { type ItemMeta, metaOf } from './tidyDigest.js';
import type { TidyOp } from './tidySchema.js';

/** The provenance suffix the server adds: `(task <id>, <date>)` or `(tidy <id>, <date>)`. */
const SUFFIX_RE = /\s*\((?:task|tidy|chat) [^,()]+, \d{4}-\d{2}-\d{2}\)\s*$/;

export interface TidyContext {
  meta: Map<string, ItemMeta>;
  /** The user allows merges and rewrites of their items. */
  userItems: boolean;
  /** Suffix of a merged item: `(tidy <tidyId>, <date>)`. */
  mergeSuffix: string;
  secrets?: string[];
}

export interface TidyPlan {
  file: PromptFile;
  /** Applied and marked changes, in op order. */
  rows: TidyRow[];
  rejected: Array<{ op: TidyOp; reason: string }>;
}

const totalChars = (f: PromptFile) =>
  [...f.rules, ...f.lessons].reduce((n, i) => n + i.text.length, 0);

const maxNum = (items: PromptItem[]) =>
  Math.max(0, ...items.map((i) => Number(i.id.slice(1)) || 0));

export function planTidy(file: PromptFile, ops: TidyOp[], ctx: TidyContext): TidyPlan {
  let work: PromptFile = { role: file.role, rules: [...file.rules], lessons: [...file.lessons] };
  const rows: TidyRow[] = [];
  const rejected: TidyPlan['rejected'] = [];
  const used = new Set<string>();
  let applied = 0;
  // New ids count up from the file's ids: an id removed in this tidy is not given again.
  const top = { rules: maxNum(file.rules), lessons: maxNum(file.lessons) };
  for (const op of ops) {
    if (op.op === 'keep') continue;
    const key = op.section === 'Rules' ? 'rules' : 'lessons';
    const refuse = (reason: string) => rejected.push({ op, reason });
    const ids = [...new Set(op.itemIds)];
    const twice = ids.find((id) => used.has(id));
    if (twice) {
      refuse(`${twice} is in another op already`);
      continue;
    }
    const sources = ids.map((id) => work[key].find((i) => i.id === id));
    const missing = ids.find((_id, n) => !sources[n]);
    if (missing) {
      refuse(`${missing} is not a ${op.section} item`);
      continue;
    }
    if (op.op === 'merge' && ids.length < 2) {
      refuse('a merge cites two or more source ids');
      continue;
    }
    if (op.op === 'rewrite' && ids.length !== 1) {
      refuse('a rewrite has exactly one item id');
      continue;
    }
    const before = sources as PromptItem[];
    let after: PromptItem | undefined;
    if (op.op !== 'remove') {
      const fresh = () => `${op.section === 'Rules' ? 'R' : 'L'}${top[key] + 1}`;
      const result = newItem(op, before, work[key], ids, ctx, fresh);
      if (typeof result === 'string') {
        refuse(result);
        continue;
      }
      after = result;
    }
    const mine = ids.some((id) => metaOf(ctx.meta, id).owner === 'user');
    const apply = !mine || (op.op !== 'remove' && ctx.userItems);
    if (apply && applied >= CAT_CEO_TIDY_MAX_CHANGES) {
      refuse(`at most ${CAT_CEO_TIDY_MAX_CHANGES} changes per tidy`);
      continue;
    }
    for (const id of ids) used.add(id);
    rows.push({
      op: op.op,
      applied: apply,
      section: op.section,
      before,
      ...(after ? { after } : {}),
      reason: op.reason,
    });
    if (!apply) continue;
    applied++;
    if (op.op === 'merge') top[key]++;
    const first = work[key].findIndex((i) => i.id === ids[0]);
    const rest = work[key].filter((i) => !ids.includes(i.id));
    if (after) rest.splice(Math.min(first, rest.length), 0, after);
    work = { ...work, [key]: rest };
  }
  const capProblem = checkPromptFile(work);
  if (capProblem) {
    return {
      file,
      rows: [],
      rejected: [...rejected, ...ops.map((op) => ({ op, reason: capProblem }))],
    };
  }
  // Net size and the locked Role hold by construction; a break here is a bug, not a model error.
  if (totalChars(work) > totalChars(file)) throw new Error('a tidy made the items longer');
  if (work.role !== file.role) throw new Error('Role & conduct changed');
  return { file: work, rows, rejected };
}

/** The merged or rewritten item, or the reason to refuse it. */
function newItem(
  op: TidyOp,
  before: PromptItem[],
  items: PromptItem[],
  ids: string[],
  ctx: TidyContext,
  freshId: () => string,
): PromptItem | string {
  const plain = (op.text ?? '').replace(SUFFIX_RE, '').trim();
  const bad = itemTextProblem(plain);
  if (bad) return bad;
  if (findSecret(plain, ctx.secrets)) return 'text looks like a secret or a private path';
  const suffix =
    op.op === 'merge' ? ` ${ctx.mergeSuffix}` : (SUFFIX_RE.exec(before[0].text)?.[0] ?? '');
  const text = `${plain}${suffix}`;
  if (text.length > PROMPT_ITEM_MAX_CHARS) {
    return `text is longer than ${PROMPT_ITEM_MAX_CHARS} characters`;
  }
  const limit = before.reduce((n, i) => n + i.text.length, 0);
  if (text.length > limit) return 'the new text is longer than the items it replaces';
  if (op.op === 'rewrite' && text === before[0].text) return 'the rewrite does not change the text';
  const others = items.filter((i) => !ids.includes(i.id));
  if (isDuplicate(text, others)) return 'the same idea is already another item';
  return { id: op.op === 'merge' ? freshId() : before[0].id, text };
}
