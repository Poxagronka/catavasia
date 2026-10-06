/**
 * The git side of a team task, run by the interpreter as effects:
 * a worker's own worktree, merges of report branches before a turn, and the
 * cleanup at the end (worker worktrees removed, task worktree finalized).
 */

import * as fs from 'fs';
import * as path from 'path';

import type { CatProfile } from '../../../../core/src/messages.js';
import { TASK_WORKTREES_DIR } from '../../constants.js';
import {
  commitAll,
  createWorktree,
  finalizeWorktree,
  mergeBranch,
  removeWorktree,
  type RepoInfo,
  unmergedPaths,
} from '../../taskBoard/gitWorktree.js';
import type { StoredTask } from '../../taskBoard/taskStore.js';
import { catLabel, workerBranch } from '../flowPrompts.js';
import type { TaskEvent, TaskState } from './types.js';

/** A cat's folder: its own worktree in a git repo, else the task folder. */
export async function prepareWorkspace(
  stateDir: string,
  task: StoredTask,
  repo: RepoInfo | null,
  catId: string,
): Promise<Extract<TaskEvent, { type: 'WorkspaceReady' }>> {
  if (!repo) return { type: 'WorkspaceReady', catId, cwd: task.cwd };
  const worktreePath = path.join(stateDir, TASK_WORKTREES_DIR, `${task.id}-${catId}`);
  const branch = workerBranch(task.id, catId);
  await createWorktree(repo, worktreePath, branch);
  return {
    type: 'WorkspaceReady',
    catId,
    cwd: path.join(worktreePath, repo.subdir),
    worktreePath,
    branch,
  };
}

/**
 * Merge the branches of the reports a cat received, in order. A conflict
 * stays open for the cat to resolve; the later branches wait (I5).
 */
export async function mergeReports(
  cat: CatProfile,
  worktreePath: string,
  branches: Array<{ childId: string; branch: string }>,
): Promise<Extract<TaskEvent, { type: 'MergeFinished' }>> {
  const base = { type: 'MergeFinished' as const, catId: cat.id };
  try {
    const open = await unmergedPaths(worktreePath);
    if (open.length) return { ...base, blocked: open, results: [] };
    await commitAll(worktreePath, `${catLabel(cat)}: work in progress`);
    const results: Extract<TaskEvent, { type: 'MergeFinished' }>['results'] = [];
    for (const { childId, branch } of branches) {
      const outcome = await mergeBranch(worktreePath, branch, `Merge ${branch}`);
      results.push({ childId, branch, outcome });
      if (!outcome.ok && outcome.conflicts.length) break;
    }
    return { ...base, results };
  } catch (err) {
    return { ...base, results: [], error: err instanceof Error ? err.message : String(err) };
  }
}

/** Commit and remove every worker worktree (branches stay), then finalize the task worktree. */
export async function endFlowWorkspaces(
  task: StoredTask,
  state: TaskState,
): Promise<string | undefined> {
  const errors: string[] = [];
  for (const m of Object.values(state.members)) {
    if (m.catId === state.rootId || !m.worktreePath || !state.repo) continue;
    if (!fs.existsSync(m.worktreePath)) continue;
    const cat = state.cats.find((c) => c.id === m.catId);
    try {
      await commitAll(m.worktreePath, `${cat ? catLabel(cat) : m.catId}: leftovers`);
      await removeWorktree(state.repo.root, m.worktreePath);
    } catch (err) {
      errors.push(`Worktree of ${m.catId} kept at ${m.worktreePath}: ${String(err)}`);
    }
  }
  if (task.worktreePath && task.repoRoot && task.baseCommit && fs.existsSync(task.worktreePath)) {
    try {
      const outcome = await finalizeWorktree(
        task.repoRoot,
        task.worktreePath,
        task.baseCommit,
        `task ${task.id}: ${task.title}`,
      );
      Object.assign(task, outcome);
    } catch (err) {
      errors.push(`Worktree cleanup failed (kept at ${task.worktreePath}): ${String(err)}`);
    }
  }
  return errors.length ? errors.join('\n') : undefined;
}
