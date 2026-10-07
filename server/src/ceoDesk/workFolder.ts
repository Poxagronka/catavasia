/**
 * The office's project folder: the project the CEO's jobs change. Without one
 * jobs run in the chat sandbox (chats/<chatId>/work/). The home folder itself,
 * `/`, and the server's own state are never a project. The refusals are plain
 * words: the user reads them in the Project panel.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export type FolderCheck = { ok: true; path: string } | { ok: false; error: string };

/** Check a folder the user picked; `stateDir` is ~/.pixel-agents. */
export function checkWorkFolder(input: string, stateDir: string): FolderCheck {
  const raw = input.trim();
  if (!path.isAbsolute(raw))
    return { ok: false, error: `Type the full folder path, like /Users/me/my-site (not ${raw})` };
  let real: string;
  try {
    real = fs.realpathSync(raw);
    if (!fs.statSync(real).isDirectory())
      return { ok: false, error: `${raw} is a file, not a folder` };
  } catch {
    return { ok: false, error: `There is no folder ${raw}` };
  }
  if (real === path.parse(real).root)
    return { ok: false, error: 'That is the whole disk. Pick one project folder' };
  if (real === realOrSelf(os.homedir())) {
    return {
      ok: false,
      error: 'Pick a folder inside your home folder, not the home folder itself',
    };
  }
  const state = realOrSelf(stateDir);
  if (real === state || real.startsWith(`${state}${path.sep}`)) {
    return { ok: false, error: "That folder holds the office's own files. Pick a project folder" };
  }
  return { ok: true, path: real };
}

export const RECENT_FOLDERS_MAX = 10;
const PROJECT_NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,63}$/u;
/** New projects go here, in the home folder. */
export const PROJECTS_DIR = 'catavasia-projects';

/** The folder of a new project `name` (~/catavasia-projects/<name>), or a plain refusal. */
export function newProjectPath(name: string): FolderCheck {
  const clean = name.trim();
  if (!PROJECT_NAME.test(clean)) {
    return {
      ok: false,
      error: 'Use letters, numbers, spaces, dots, dashes or underscores (at most 64)',
    };
  }
  return { ok: true, path: path.join(os.homedir(), PROJECTS_DIR, clean) };
}

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
