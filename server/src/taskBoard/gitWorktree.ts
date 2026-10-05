/**
 * Git worktree lifecycle for board tasks: one worktree per task on branch
 * `task/<id>`, committed and removed when the run ends. The branch is kept so
 * the work is never lost with the worktree.
 */

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import type { TaskChangedFile } from '../../../core/src/tasks.js';
import { TASK_DIFF_MAX_BYTES } from '../constants.js';

const GIT_MAX_BUFFER = 64 * 1024 * 1024;

/** Identity used only when the repo has no user.email configured. */
const FALLBACK_IDENTITY = [
  '-c',
  'user.name=Pixel Agents',
  '-c',
  'user.email=pixel-agents@localhost',
];

function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', ['-C', cwd, ...args], { maxBuffer: GIT_MAX_BUFFER }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`git ${args[0]} failed: ${String(stderr).trim() || err.message}`));
      } else {
        resolve(String(stdout));
      }
    });
  });
}

export interface RepoInfo {
  /** Repository top level (main worktree). */
  root: string;
  /** Commit the task branch starts from. */
  head: string;
  /** Folder path relative to root ('' when the folder is the root). */
  subdir: string;
}

/** Repo facts for `folder`, or null when it is not inside a git repo with a commit. */
export async function inspectRepo(folder: string): Promise<RepoInfo | null> {
  try {
    const root = (await git(folder, ['rev-parse', '--show-toplevel'])).trim();
    const head = (await git(folder, ['rev-parse', 'HEAD'])).trim();
    const subdir = path.relative(fs.realpathSync(root), fs.realpathSync(folder));
    return { root, head, subdir };
  } catch {
    return null;
  }
}

export async function createWorktree(
  repo: RepoInfo,
  worktreePath: string,
  branch: string,
): Promise<void> {
  fs.mkdirSync(path.dirname(worktreePath), { recursive: true });
  await git(repo.root, ['worktree', 'add', '-b', branch, worktreePath, repo.head]);
}

export interface WorktreeOutcome {
  changedFiles: TaskChangedFile[];
  diff: string;
  diffTruncated: boolean;
}

/**
 * Commit everything the agent left in the worktree, collect the diff against
 * the base commit, then remove the worktree. The branch stays.
 */
export async function finalizeWorktree(
  repoRoot: string,
  worktreePath: string,
  baseCommit: string,
  message: string,
): Promise<WorktreeOutcome> {
  await git(worktreePath, ['add', '-A']);
  const staged = (await git(worktreePath, ['diff', '--cached', '--name-only'])).trim();
  if (staged) {
    const hasIdentity = await git(worktreePath, ['config', 'user.email']).then(
      (v) => v.trim() !== '',
      () => false,
    );
    const identity = hasIdentity ? [] : FALLBACK_IDENTITY;
    await git(worktreePath, [...identity, 'commit', '--no-verify', '-q', '-m', message]);
  }
  const nameStatus = await git(worktreePath, ['diff', '--name-status', baseCommit, 'HEAD']);
  const changedFiles = nameStatus
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split('\t');
      return { status: status.charAt(0), path: rest[rest.length - 1] ?? '' };
    });
  let diff = await git(worktreePath, ['diff', baseCommit, 'HEAD']);
  const diffTruncated = Buffer.byteLength(diff) > TASK_DIFF_MAX_BYTES;
  if (diffTruncated) diff = diff.slice(0, TASK_DIFF_MAX_BYTES);
  await git(repoRoot, ['worktree', 'remove', '--force', worktreePath]);
  return { changedFiles, diff, diffTruncated };
}
