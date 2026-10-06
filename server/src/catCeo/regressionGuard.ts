/**
 * Regression guard (cat-ceo-judge.md §8): a Cat CEO prompt edit must earn its
 * place. For each Cat CEO commit C of a cat: before = the cat's last 5 scores
 * with a prompt version older than C (need 3), after = its first 3 scores with
 * a version that contains C. A mean drop of 15 or more reverts C (as `guard`)
 * and blocks Cat CEO edits of that cat for 24 h; 8-14 flags C "watch". A
 * revert that conflicts flags "manual review". User commits are never touched.
 */

import {
  CAT_CEO_GUARD_BLOCK_MS,
  CAT_CEO_GUARD_REVERT_DROP,
  CAT_CEO_GUARD_WATCH_DROP,
} from '../constants.js';
import type { ReviewStore } from './reviewStore.js';

export interface GuardRepo {
  log(catId: string): Array<{ sha: string; at: number; subject: string }>;
  contains(sha: string, ancestor: string): boolean;
  revert(catId: string, sha: string, subject: string, body?: string): string | undefined;
}

export type GuardDecision = 'wait' | 'keep' | 'watch' | 'revert';

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** The decision for one commit from the scores before and after it. */
export function guardDecision(before: number[], after: number[]): GuardDecision {
  if (before.length < 3 || after.length < 3) return 'wait';
  const drop = mean(before.slice(-5)) - mean(after.slice(0, 3));
  if (drop >= CAT_CEO_GUARD_REVERT_DROP) return 'revert';
  if (drop >= CAT_CEO_GUARD_WATCH_DROP) return 'watch';
  return 'keep';
}

/** Who made a prompt commit, from its subject prefix (`cat-ceo(murka): ...`). */
export function authorOf(subject: string): 'cat-ceo' | 'user' | 'guard' {
  if (subject.startsWith('cat-ceo(')) return 'cat-ceo';
  if (subject.startsWith('guard(')) return 'guard';
  return 'user';
}

/** Check every open Cat CEO commit of `catId`. Returns what it did, for the log and tests. */
export function runGuard(
  catId: string,
  repo: GuardRepo,
  store: ReviewStore,
  now: number,
): Array<{ sha: string; decision: GuardDecision; error?: string }> {
  const scores = store.scoresOf(catId).filter((s) => s.promptSha);
  const done: Array<{ sha: string; decision: GuardDecision; error?: string }> = [];
  for (const c of repo.log(catId)) {
    if (authorOf(c.subject) !== 'cat-ceo') continue;
    const flag = store.flag(c.sha);
    if (flag === 'reverted' || flag === 'manual review') continue;
    const after = scores.filter((s) => repo.contains(s.promptSha!, c.sha)).map((s) => s.score);
    const before = scores
      .filter((s) => s.at <= now && !repo.contains(s.promptSha!, c.sha))
      .map((s) => s.score);
    const decision = guardDecision(before, after);
    if (decision === 'watch' && flag !== 'watch') store.setFlag(c.sha, 'watch');
    if (decision === 'revert') {
      const drop = Math.round(mean(before.slice(-5)) - mean(after.slice(0, 3)));
      const error = repo.revert(
        catId,
        c.sha,
        `guard(${catId}): revert ${c.sha.slice(0, 7)} (score drop ${drop})`,
        'Prompt-Edit-By: guard',
      );
      // The user reverted C already: the guard has nothing left to do.
      const undone = !error || error.startsWith('nothing to revert');
      store.setFlag(c.sha, undone ? 'reverted' : 'manual review');
      if (!error) store.block(catId, now + CAT_CEO_GUARD_BLOCK_MS);
      done.push({ sha: c.sha, decision, ...(error ? { error } : {}) });
      continue;
    }
    done.push({ sha: c.sha, decision });
  }
  return done;
}
