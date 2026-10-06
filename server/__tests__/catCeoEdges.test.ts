/**
 * Cat CEO edge cases from review: a revert never drops a broken hand edit, a
 * commit the user already reverted is "reverted" for the guard, and a review
 * that fails before it starts ends the review region.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runGuard } from '../src/catCeo/regressionGuard.js';
import { ReviewStore } from '../src/catCeo/reviewStore.js';
import { reduce } from '../src/orchestrator/machine/taskReducer.js';
import type { TaskState } from '../src/orchestrator/machine/types.js';
import type { PromptFile } from '../src/orchestrator/promptFile.js';
import { PromptRepo } from '../src/orchestrator/promptRepo.js';

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-ceo-edge-'));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const file = (rules: PromptFile['rules']): PromptFile => ({
  role: 'You are Murka.',
  rules,
  lessons: [],
});

function repoWithCeoCommit() {
  const repo = new PromptRepo(path.join(tmp, 'prompts'));
  repo.write('murka', file([]), 'user(murka): create');
  const v0 = repo.headSha('murka')!;
  repo.write('murka', file([{ id: 'R1', text: 'Run the tests.' }]), 'cat-ceo(murka): add R1');
  return { repo, v0, c: repo.headSha('murka')! };
}

describe('Cat CEO edges', () => {
  it('a revert refuses while the file on disk does not parse, and keeps it', () => {
    const { repo, c } = repoWithCeoCommit();
    fs.writeFileSync(repo.fileOf('murka'), 'broken by hand\n');
    expect(repo.revert('murka', c, 'user(murka): revert')).toContain('fix the file');
    expect(fs.readFileSync(repo.fileOf('murka'), 'utf-8')).toBe('broken by hand\n');
  });

  it('the guard marks a commit the user already reverted as reverted', () => {
    const { repo, v0, c } = repoWithCeoCommit();
    expect(repo.revert('murka', c, 'user(murka): revert')).toBeUndefined();
    const store = new ReviewStore(path.join(tmp, 'reviews.json'));
    const add = (score: number, sha: string, at: number) =>
      store.add({
        reviewId: `r${at}`,
        taskId: `t${at}`,
        title: 't',
        at,
        verdict: 'pass',
        summary: '',
        scores: [{ catId: 'murka', assignmentId: 'a1', score, bubble: '', promptSha: sha }],
        anomalies: [],
        edits: [],
        rejected: [],
      });
    [80, 80, 80].forEach((s, i) => add(s, v0, i + 1));
    [50, 50, 50].forEach((s, i) => add(s, repo.headSha('murka')!, i + 10));
    runGuard('murka', repo, store, 100);
    expect(store.flag(c)).toBe('reverted');
  });

  it('a review that fails before it starts ends the review region', () => {
    const state = { review: 'review_pending' } as TaskState;
    expect(reduce(state, { type: 'ReviewFailed', error: 'queue full' }).state.review).toBe(
      'review_failed',
    );
  });
});
