/**
 * The CEO's own product is Catavasia. Jobs that improve it run in a managed
 * clone of UPDATE_REPO under the state dir. Workers never edit the clone: each
 * job gets its own worktree on a task/<id>-<cat> branch (taskBoard/gitWorktree).
 */

import * as fs from 'fs';
import * as path from 'path';

import { SELF_REPO_BRANCH, SELF_REPO_DIR, SELF_REPO_GIT_TIMEOUT_MS } from '../constants.js';
import { git } from '../taskBoard/gitWorktree.js';

const inFlight = new Map<string, { run: Promise<string>; abort: AbortController }>();

/**
 * Clone `url` on first use, then bring the clone to the tip of origin/main.
 * Returns the clone's path. Calls for one state dir share one run.
 */
export function ensureSelfRepo(stateDir: string, url: string): Promise<string> {
  const dir = path.join(stateDir, SELF_REPO_DIR);
  let entry = inFlight.get(dir);
  if (!entry) {
    const abort = new AbortController();
    const run = refresh(dir, url, abort.signal).finally(() => inFlight.delete(dir));
    entry = { run, abort };
    inFlight.set(dir, entry);
  }
  return entry.run;
}

/** Kill the running clone or fetch, so the state dir can be removed at shutdown. */
export function abortSelfRepo(stateDir: string): void {
  inFlight.get(path.join(stateDir, SELF_REPO_DIR))?.abort.abort();
}

/** Network git calls never prompt for credentials and never hang. */
const net = (signal: AbortSignal) => ({
  env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  timeout: SELF_REPO_GIT_TIMEOUT_MS,
  signal,
});

async function refresh(dir: string, url: string, signal: AbortSignal): Promise<string> {
  if (!fs.existsSync(path.join(dir, '.git'))) {
    // A killed clone leaves a non-empty folder that blocks the next clone.
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    await git(
      path.dirname(dir),
      ['clone', '--depth', '1', '--branch', SELF_REPO_BRANCH, url, path.basename(dir)],
      net(signal),
    );
    return dir;
  }
  try {
    await git(dir, ['fetch', '--depth', '1', 'origin', SELF_REPO_BRANCH], net(signal));
    // Only a clean clone moves: an unexpected local change stays for a human.
    if (!(await git(dir, ['status', '--porcelain'])).trim()) {
      await git(dir, ['reset', '--hard', `origin/${SELF_REPO_BRANCH}`]);
    }
  } catch (err) {
    // A stale checkout still serves the job.
    console.error('[ceoDesk] self-repo refresh failed, using the stale clone:', err);
  }
  return dir;
}
