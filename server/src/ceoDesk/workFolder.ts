/**
 * The work folder of a CEO desk chat: the project its jobs change. A chat
 * without one runs its jobs in its sandbox (chats/<chatId>/work/). The home
 * folder itself, `/`, and the server's own state are never a work folder.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export type FolderCheck = { ok: true; path: string } | { ok: false; error: string };

/** Check a folder the user or the CEO named; `stateDir` is ~/.pixel-agents. */
export function checkWorkFolder(input: string, stateDir: string): FolderCheck {
  const raw = input.trim();
  if (!path.isAbsolute(raw)) return { ok: false, error: `Not an absolute path: ${raw}` };
  let real: string;
  try {
    real = fs.realpathSync(raw);
    if (!fs.statSync(real).isDirectory()) return { ok: false, error: `Not a folder: ${raw}` };
  } catch {
    return { ok: false, error: `Not a folder: ${raw}` };
  }
  if (real === path.parse(real).root) return { ok: false, error: 'The root folder is too broad' };
  if (real === realOrSelf(os.homedir())) {
    return { ok: false, error: 'The home folder is too broad: name a project folder' };
  }
  const state = realOrSelf(stateDir);
  if (real === state || real.startsWith(`${state}${path.sep}`)) {
    return { ok: false, error: 'That folder holds catavasia state, not a project' };
  }
  return { ok: true, path: real };
}

const RECENT_FOLDERS_MAX = 10;

/** Distinct existing folders of `cwds` (newest first), without the chat sandboxes. */
export function recentFolders(cwds: string[], sandboxRoot: string): string[] {
  const seen = new Set<string>();
  for (const cwd of cwds) {
    if (cwd.startsWith(sandboxRoot) || seen.has(cwd) || !isDir(cwd)) continue;
    seen.add(cwd);
    if (seen.size >= RECENT_FOLDERS_MAX) break;
  }
  return [...seen];
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function realOrSelf(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}
