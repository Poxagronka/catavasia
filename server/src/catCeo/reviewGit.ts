/**
 * Git sides of a Cat CEO review: the §7.1 commit message of one cat's
 * accepted edits, and the worker branch diffs of the digest.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

import type { TaskState } from '../orchestrator/machine/types.js';
import type { StoredTask } from '../taskBoard/taskStore.js';
import type { JudgeOutput } from './judgeSchema.js';
import type { CatPatch } from './promptPatch.js';
import type { BranchDiff } from './reviewDigest.js';

const run = promisify(execFile);

const cut = (text: string, n: number) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

/** §7.1 commit message. */
export function commitMessage(
  p: CatPatch,
  task: StoredTask,
  reviewId: string,
  out: JudgeOutput,
  score: number | undefined,
): { subject: string; body: string } {
  const first = p.changes[0];
  const summary = `${first.op} ${first.itemId}${first.text ? `: ${first.text}` : ''}`;
  const kinds = new Set(
    p.changes.flatMap((c) =>
      c.anomalyIds.map((id) => out.anomalies.find((a) => a.id === id)?.kind ?? id),
    ),
  );
  const body = [
    `Task: ${task.id} "${task.title}"`,
    `Review: ${reviewId}  Score: ${score ?? '?'}/100  Verdict: ${out.verdict}`,
    'Changes:',
    ...p.changes.map(
      (c) => `- ${c.op} ${c.section} ${c.itemId}${c.text ? `: ${cut(c.text, 72)}` : ''}`,
    ),
    `Anomalies: ${[...kinds].join(', ')}`,
    '',
    'Prompt-Edit-By: cat-ceo',
    `Prompt-Review: ${reviewId}`,
  ].join('\n');
  return { subject: `cat-ceo(${p.catId}): ${cut(summary, 60)}`, body };
}

/** `git diff --stat` and body of each worker branch against the task base. */
export async function branchDiffs(state: TaskState): Promise<BranchDiff[]> {
  const repo = state.repo;
  if (!repo) return [];
  const out: BranchDiff[] = [];
  for (const a of state.assignments) {
    if (!a.branch || out.some((d) => d.branch === a.branch)) continue;
    const range = `${repo.head}...${a.branch}`;
    try {
      const git = (args: string[]) =>
        run('git', ['-C', repo.root, ...args], { maxBuffer: 8 * 1024 * 1024 }).then(
          (r) => r.stdout,
        );
      const [stat, body] = await Promise.all([
        git(['diff', '--stat', range]),
        git(['diff', '--no-color', range]),
      ]);
      out.push({ catId: a.child, branch: a.branch, stat: stat.trim(), body });
    } catch {
      /* the branch is gone: no diff */
    }
  }
  return out;
}
