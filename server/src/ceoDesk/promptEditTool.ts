/**
 * Prompt edits from the CEO desk chat (docs/catavasia/cat-ceo-judge.md §15).
 * The desk tool `edit_prompts` changes one Rules or Lessons item of a cat when
 * the user asks for it. The edit passes the review checks (promptPatch) and is
 * committed as `cat-ceo(<cat>): chat — ...`, which the regression guard tracks
 * like every Cat CEO commit. An item the user dictated is named in a
 * `Prompt-User-Items` trailer, so it stays the user's.
 */

import type { CatProfile } from '../../../core/src/messages.js';
import type { EditOp, JudgeAnomaly, JudgeEdit, Section } from '../catCeo/judgeSchema.js';
import { type CatPatch, normalizeItem, planEdits } from '../catCeo/promptPatch.js';
import { authorOf } from '../catCeo/regressionGuard.js';
import { redact } from '../catCeo/secretScan.js';
import { CAT_CEO_CHAT_EDITS_PER_DAY } from '../constants.js';
import type { PromptRepo } from '../orchestrator/promptRepo.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** One edit_prompts call. */
export interface PromptEdit {
  catId: string;
  section: Section;
  op: EditOp;
  itemId?: string;
  text?: string;
  /** The user gave this exact item: it counts as the user's item. */
  dictated: boolean;
}

export interface PromptEditHost {
  prompts: PromptRepo;
  /** The cats of the tree (the CEO is not one of them). */
  roster: CatProfile[];
  now: number;
  /** Reload the changed prompts and rebroadcast the profiles. */
  promptsChanged(catIds: string[]): void;
}

/** A chat commit of the Cat CEO (it does not count against the review edit limit). */
export function isChatCommit(subject: string): boolean {
  return /^cat-ceo\([^)]*\): chat\b/.test(subject);
}

/**
 * The edit checks of promptPatch need an anomaly of medium severity or more.
 * In the chat the user's request is that evidence; the id also tells whether
 * the user dictated the item.
 */
const USER_ITEM = 'user-dictated';
const CEO_ITEM = 'ceo-written';
const CHAT_ANOMALIES: JudgeAnomaly[] = [USER_ITEM, CEO_ITEM].map((id) => ({
  id,
  catId: '',
  kind: 'other',
  severity: 'medium',
  evidence: 'the user asked for this change in the chat',
}));

/** Chat commits still allowed for a cat now (its own limit, apart from reviews). */
export function chatCommitsLeft(prompts: PromptRepo, catId: string, now: number): number {
  const made = prompts
    .log(catId)
    .filter(
      (c) => authorOf(c.subject) === 'cat-ceo' && isChatCommit(c.subject) && c.at > now - DAY_MS,
    );
  return Math.max(0, CAT_CEO_CHAT_EDITS_PER_DAY - made.length);
}

/**
 * Check and commit one edit. `request` is the user's message of this turn:
 * `dictated` holds only when it really holds the item. Returns the commit
 * subject, or the reason the checks refused the edit.
 */
export function editPrompt(
  host: PromptEditHost,
  edit: PromptEdit,
  chatId: string,
  request: string,
): { ok: true; patch: CatPatch; subject: string } | { ok: false; error: string } {
  const { prompts } = host;
  const date = new Date(host.now).toISOString().slice(0, 10);
  const asReview: JudgeEdit = {
    catId: edit.catId,
    section: edit.section,
    op: edit.op,
    ...(edit.itemId ? { itemId: edit.itemId } : {}),
    ...(edit.text !== undefined ? { text: edit.text } : {}),
    reason: 'the user asked in the chat',
    anomalyIds: [edit.dictated && inRequest(edit, request) ? USER_ITEM : CEO_ITEM],
  };
  for (const c of host.roster) prompts.commitHandEdit(c.id);
  const { patches, rejected } = planEdits([asReview], {
    taskId: chatId,
    date,
    team: host.roster.map((c) => c.id).filter((id) => !prompts.read(id).error),
    anomalies: CHAT_ANOMALIES,
    read: (catId) => prompts.read(catId).file,
    commitsLeft: (catId) => chatCommitsLeft(prompts, catId, host.now),
    suffix: `(chat ${chatId}, ${date})`,
  });
  if (rejected.length) return { ok: false, error: rejected[0].reason };
  const patch = patches[0];
  const { subject, body } = chatMessage(patch, chatId, request);
  const error = prompts.write(patch.catId, patch.file, subject, body);
  if (error) return { ok: false, error };
  host.promptsChanged([patch.catId]);
  return { ok: true, patch, subject };
}

/** A cat's Rules and Lessons with their ids, for the CEO before it edits. */
export function promptItems(prompts: PromptRepo, cat: CatProfile): string {
  const { file, error } = prompts.read(cat.id);
  if (error) return `${cat.name} (${cat.id}): the prompt file is broken: ${error}`;
  const list = (items: Array<{ id: string; text: string }>) =>
    items.length ? items.map((i) => `- ${i.id}: ${i.text}`).join('\n') : '(none)';
  return [
    `${cat.name} (${cat.id})`,
    'Rules:',
    list(file.rules),
    'Lessons:',
    list(file.lessons),
  ].join('\n');
}

/**
 * The model's `dictated` holds only when the user's message really holds the
 * item: its text (normalized), or for a remove its id.
 */
function inRequest(edit: PromptEdit, request: string): boolean {
  if (edit.op === 'remove')
    // Only a well-formed id (R1, L3) goes into the pattern: the model sends it.
    return (
      !!edit.itemId &&
      /^[RL]\d+$/.test(edit.itemId) &&
      new RegExp(`\\b${edit.itemId}\\b`).test(request)
    );
  const text = normalizeItem(edit.text ?? '');
  return !!text && normalizeItem(request).includes(text);
}

const cut = (text: string, n: number) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

/** `cat-ceo(<cat>): chat — <first change>` with the changes and trailers. */
function chatMessage(
  p: CatPatch,
  chatId: string,
  request: string,
): { subject: string; body: string } {
  const first = p.changes[0];
  const summary = `${first.op} ${first.itemId}${first.text ? `: ${first.text}` : ''}`;
  const userIds = p.changes
    .filter((c) => c.op !== 'remove' && c.anomalyIds.includes(USER_ITEM))
    .map((c) => c.itemId);
  const body = [
    `Chat: ${chatId}`,
    `Request: ${cut(redact(request.replace(/\s+/g, ' ').trim()), 200)}`,
    'Changes:',
    ...p.changes.map(
      (c) =>
        `- ${c.op} ${c.section} ${c.itemId}${c.text ? `: ${cut(c.text, 72)}` : ''}${
          c.anomalyIds.includes(USER_ITEM) ? ' (dictated by the user)' : ''
        }`,
    ),
    '',
    'Prompt-Edit-By: cat-ceo',
    `Prompt-Chat: ${chatId}`,
    ...(userIds.length ? [`Prompt-User-Items: ${userIds.join(', ')}`] : []),
  ].join('\n');
  return { subject: `cat-ceo(${p.catId}): chat — ${cut(summary, 60)}`, body };
}
