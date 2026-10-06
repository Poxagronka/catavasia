/**
 * Prompt history in the Cats menu (cat-ceo-judge.md §10): the commits of one
 * cat's prompt file with their score context, the diff of one commit, and the
 * user's changes: revert a commit, restore a version, add / edit / remove a
 * Rules or Lessons item. Every change is one commit `user(<cat>): ...`.
 */

import type { PromptHistory, PromptHistoryEntry } from '../../../core/src/messages.js';
import { PROMPT_ITEM_MAX_CHARS } from '../constants.js';
import type { PromptFile, PromptItem } from '../orchestrator/promptFile.js';
import { parsePromptFile } from '../orchestrator/promptFile.js';
import type { PromptRepo } from '../orchestrator/promptRepo.js';
import { itemTextProblem } from './promptPatch.js';
import { authorOf } from './regressionGuard.js';
import type { ReviewStore } from './reviewStore.js';

const SHA_RE = /^[0-9a-f]{7,40}$/;
const TRAILER = 'Prompt-Edit-By: user';

const mean = (xs: number[]) =>
  xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : undefined;

/** The commits of a cat's prompt file, newest first, with the mean score of each version. */
function historyEntries(
  catId: string,
  prompts: PromptRepo,
  store: ReviewStore,
): PromptHistoryEntry[] {
  const scores = store.scoresOf(catId);
  const meanOf = (sha: string | undefined) =>
    sha ? mean(scores.filter((s) => s.promptSha === sha).map((s) => s.score)) : undefined;
  const log = prompts.log(catId);
  return log.map((c, i) => {
    const taskId = /^Task: (\S+)/m.exec(c.body)?.[1];
    const flag = store.flag(c.sha);
    const tidy = store.tidies.find((t) => t.sha === c.sha)?.rows;
    const before = meanOf(log[i + 1]?.sha);
    const after = meanOf(c.sha);
    return {
      sha: c.sha,
      at: c.at,
      author: authorOf(c.subject),
      subject: c.subject,
      ...(taskId ? { taskId } : {}),
      ...(flag ? { flag } : {}),
      ...(tidy ? { tidy } : {}),
      ...(before !== undefined ? { scoreBefore: before } : {}),
      ...(after !== undefined ? { scoreAfter: after } : {}),
    };
  });
}

/** The `promptHistory` message of a cat: its commits, and its newest tidy (with the marked rows). */
export function promptHistory(
  catId: string,
  prompts: PromptRepo,
  store: ReviewStore,
): PromptHistory {
  const t = [...store.tidies].reverse().find((x) => x.catId === catId && !x.failed);
  return {
    type: 'promptHistory',
    catId,
    entries: historyEntries(catId, prompts, store),
    ...(t
      ? {
          lastTidy: {
            at: t.at,
            trigger: t.trigger,
            summary: t.summary,
            ...(t.sha ? { sha: t.sha } : {}),
            ...(t.costUsd !== undefined ? { costUsd: t.costUsd } : {}),
            rows: t.rows,
          },
        }
      : {}),
  };
}

/** The sha belongs to the cat's file history (no arbitrary refs reach git). */
function knownSha(prompts: PromptRepo, catId: string, sha: unknown): string | undefined {
  if (typeof sha !== 'string' || !SHA_RE.test(sha)) return undefined;
  return prompts.log(catId).find((c) => c.sha.startsWith(sha))?.sha;
}

export function promptDiff(prompts: PromptRepo, catId: string, sha: unknown): string | undefined {
  const full = knownSha(prompts, catId, sha);
  return full ? prompts.diff(catId, full) : undefined;
}

function nextId(items: PromptItem[], prefix: string): string {
  return `${prefix}${Math.max(0, ...items.map((i) => Number(i.id.slice(1)) || 0)) + 1}`;
}

/** The current file, unless it is broken on disk (then a change would hide the break). */
function current(prompts: PromptRepo, catId: string): PromptFile | string {
  const { file, error } = prompts.read(catId);
  return error ? `${error}: fix the file or restore a version first` : file;
}

/**
 * One user change of the prompt history. Returns an error, or undefined when
 * the change is committed.
 */
export function applyPromptAction(
  prompts: PromptRepo,
  msg: Record<string, unknown>,
): string | undefined {
  const catId = String(msg.catId ?? '');
  const subject = (what: string) => `user(${catId}): ${what}`;
  switch (msg.type) {
    case 'revertPromptEdit': {
      const sha = knownSha(prompts, catId, msg.sha);
      if (!sha) return 'unknown commit';
      return prompts.revert(catId, sha, subject(`revert ${sha.slice(0, 7)}`), TRAILER);
    }
    case 'restorePromptVersion': {
      const sha = knownSha(prompts, catId, msg.sha);
      const text = sha ? prompts.textAt(catId, sha) : undefined;
      if (!sha || text === undefined) return 'unknown commit';
      const parsed = parsePromptFile(text);
      if (!parsed.ok) return `that version does not parse: ${parsed.error}`;
      if (prompts.headSha(catId) === sha && !prompts.read(catId).error) {
        return 'the file is this version already';
      }
      return prompts.write(catId, parsed.value, subject(`restore ${sha.slice(0, 7)}`), TRAILER);
    }
    case 'removePromptItem': {
      const file = current(prompts, catId);
      if (typeof file === 'string') return file;
      const itemId = String(msg.itemId ?? '');
      const key = itemId.startsWith('R') ? 'rules' : 'lessons';
      if (!file[key].some((i) => i.id === itemId)) return `${itemId} does not exist`;
      const next = { ...file, [key]: file[key].filter((i) => i.id !== itemId) };
      return prompts.write(catId, next, subject(`remove ${itemId}`), TRAILER);
    }
    case 'savePromptItem': {
      const file = current(prompts, catId);
      if (typeof file === 'string') return file;
      const text = typeof msg.text === 'string' ? msg.text.trim() : '';
      const bad = itemTextProblem(text);
      if (bad) return bad;
      if (text.length > PROMPT_ITEM_MAX_CHARS) {
        return `an item is at most ${PROMPT_ITEM_MAX_CHARS} characters`;
      }
      const key = msg.section === 'Rules' ? 'rules' : msg.section === 'Lessons' ? 'lessons' : null;
      if (!key) return 'section must be Rules or Lessons';
      const items = file[key];
      const prefix = key === 'rules' ? 'R' : 'L';
      if (msg.itemId === undefined) {
        const id = nextId(items, prefix);
        const next = { ...file, [key]: [...items, { id, text }] };
        return prompts.write(catId, next, subject(`add ${id}`), TRAILER);
      }
      const itemId = String(msg.itemId);
      if (!items.some((i) => i.id === itemId)) return `${itemId} does not exist`;
      const next = {
        ...file,
        [key]: items.map((i) => (i.id === itemId ? { id: itemId, text } : i)),
      };
      return prompts.write(catId, next, subject(`edit ${itemId}`), TRAILER);
    }
    default:
      return `unknown change ${String(msg.type)}`;
  }
}
