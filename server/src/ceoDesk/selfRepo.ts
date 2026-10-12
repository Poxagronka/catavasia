/**
 * The CEO's own product is Catavasia. Jobs that improve it run in a managed
 * clone of UPDATE_REPO under the state dir. Workers never edit the clone: each
 * job gets its own worktree on a task/<id>-<cat> branch (taskBoard/gitWorktree).
 */

import * as fs from 'fs';
import * as path from 'path';

import { SELF_REPO_BRANCH, SELF_REPO_DIR } from '../constants.js';
import { git } from '../taskBoard/gitWorktree.js';

const inFlight = new Map<string, Promise<string>>();

/**
 * Clone `url` on first use, then bring the clone to the tip of origin/main.
 * Returns the clone's path. Calls for one state dir share one run.
 */
export function ensureSelfRepo(stateDir: string, url: string): Promise<string> {
  const dir = path.join(stateDir, SELF_REPO_DIR);
  let run = inFlight.get(dir);
  if (!run) {
    run = refresh(dir, url).finally(() => inFlight.delete(dir));
    inFlight.set(dir, run);
  }
  return run;
}

async function refresh(dir: string, url: string): Promise<string> {
  if (!fs.existsSync(path.join(dir, '.git'))) {
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    await git(path.dirname(dir), [
      'clone',
      '--depth',
      '1',
      '--branch',
      SELF_REPO_BRANCH,
      url,
      path.basename(dir),
    ]);
    return dir;
  }
  await git(dir, ['fetch', '--depth', '1', 'origin', SELF_REPO_BRANCH]);
  // Only a clean clone moves: an unexpected local change stays for a human.
  if (!(await git(dir, ['status', '--porcelain'])).trim()) {
    await git(dir, ['reset', '--hard', `origin/${SELF_REPO_BRANCH}`]);
  }
  return dir;
}
