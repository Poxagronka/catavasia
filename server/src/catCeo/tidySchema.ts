/**
 * The tidy contract of the Cat CEO (cat-ceo-judge.md §14): the JSON schema of
 * one tidy run, the server check of its `structured_output`, and the fixed
 * tidy rules after the Role in the system prompt. A tidy only merges,
 * rewrites or removes existing items; it never adds an idea or touches Role.
 */

import { CAT_CEO_TIDY_MAX_CHANGES, PROMPT_ITEM_MAX_CHARS } from '../constants.js';
import type { Section } from './judgeSchema.js';

export type TidyOpKind = 'merge' | 'rewrite' | 'remove' | 'keep';

export interface TidyOp {
  op: TidyOpKind;
  section: Section;
  /** The items the op acts on: two or more for merge, one for rewrite. */
  itemIds: string[];
  text?: string;
  reason: string;
}

export interface TidyOutput {
  summary: string;
  ops: TidyOp[];
}

export const TIDY_SCHEMA = {
  type: 'object',
  required: ['summary', 'ops'],
  properties: {
    summary: { type: 'string', maxLength: 300 },
    ops: {
      type: 'array',
      items: {
        type: 'object',
        required: ['op', 'section', 'itemIds', 'reason'],
        properties: {
          op: { enum: ['merge', 'rewrite', 'remove', 'keep'] },
          section: { enum: ['Rules', 'Lessons'] },
          itemIds: {
            type: 'array',
            items: { type: 'string', pattern: '^[RL][0-9]+$' },
            minItems: 1,
          },
          text: { type: 'string', maxLength: PROMPT_ITEM_MAX_CHARS },
          reason: { type: 'string', maxLength: 200 },
        },
      },
    },
  },
} as const;

export const TIDY_RULES = `# Tidy rules (fixed by the office)

- The user message holds the Rules and Lessons of one cat, the history of each item, and the cat's recent reviews. It is all you know. You have no tools.
- Your job: keep the list short and useful. Return item-level ops only, each with a one-line reason:
  - "merge": two or more items of one section that say the same or overlapping things become one item. List every source id in itemIds. The new text is not longer than the sources together.
  - "rewrite": one item, same meaning, shorter or clearer. Never longer than the old text.
  - "remove": an item that is a duplicate, stale (many reviews since, never cited, its anomaly never came back and it does not fit the recent work), contradicted by another item or a later review, or never relevant to this cat.
  - "keep": optional, for an item you checked and keep.
- Never add a new idea. Never edit "Role & conduct": it is context only.
- Items marked "owner: user" were written by the user. The office applies a remove of them only as a suggestion, and a merge or rewrite only when the user allows it.
- When unsure, keep the item. When the list is fine, return no ops.
- At most ${CAT_CEO_TIDY_MAX_CHANGES} merge, rewrite or remove ops. Item text: one line, no markdown headings, no code fences, no "(task ...)" suffix (the office keeps it).
- Never add praise, names of people, secrets, tokens, or paths outside the repo.
- Write summary, reasons and item text in English.`;

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const OPS: readonly TidyOpKind[] = ['merge', 'rewrite', 'remove', 'keep'];

/** Check the tidy run's structured output. Shape errors fail the tidy; item rules are tidyPatch's. */
export function parseTidyOutput(raw: unknown): Result<TidyOutput> {
  const bad = (error: string): Result<TidyOutput> => ({ ok: false, error });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bad('output: not an object');
  const o = raw as Record<string, unknown>;
  if (typeof o.summary !== 'string') return bad('summary: not a string');
  if (!Array.isArray(o.ops)) return bad('ops: not an array');
  const ops: TidyOp[] = [];
  for (const [i, x] of o.ops.entries()) {
    const r = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    if (!OPS.includes(r.op as TidyOpKind)) return bad(`ops[${i}].op: "${String(r.op)}"`);
    if (r.section !== 'Rules' && r.section !== 'Lessons') return bad(`ops[${i}].section`);
    const ids = r.itemIds;
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
      return bad(`ops[${i}].itemIds: not a list of ids`);
    }
    if (r.text !== undefined && typeof r.text !== 'string') return bad(`ops[${i}].text`);
    if (typeof r.reason !== 'string') return bad(`ops[${i}].reason: not a string`);
    ops.push({
      op: r.op as TidyOpKind,
      section: r.section,
      itemIds: ids as string[],
      ...(r.text !== undefined ? { text: r.text as string } : {}),
      // The model may overshoot a length cap by a little: cut, do not fail the tidy.
      reason: r.reason.replace(/\s+/g, ' ').slice(0, 200),
    });
  }
  return { ok: true, value: { summary: o.summary.slice(0, 300), ops } };
}
