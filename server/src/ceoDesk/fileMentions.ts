/**
 * Files of the chat's folder for the CEO dock's `@` menu. In a git repo:
 * tracked and untracked files that .gitignore does not hide (`git ls-files`
 * lists only what is under the folder); elsewhere: the folder's own entries.
 * Paths are relative to the folder. The dock inserts `@path`, and Claude Code
 * reads the file itself.
 */

import { execFile } from 'child_process';
import * as fs from 'fs';

import { CEO_MENTION_GIT_MAX_BUFFER } from '../constants.js';

/** Every file the `@` menu can offer in `cwd` (an empty list when the folder is gone). */
export function listFolderFiles(cwd: string): Promise<string[]> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['-C', cwd, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { maxBuffer: CEO_MENTION_GIT_MAX_BUFFER },
      (err, stdout) => {
        if (!err) return resolve(String(stdout).split('\0').filter(Boolean));
        try {
          const entries = fs.readdirSync(cwd, { withFileTypes: true });
          resolve(entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name)));
        } catch {
          resolve([]);
        }
      },
    );
  });
}

/**
 * How well `file` fits `query` (lower is better), or -1: the file name starts
 * with it, the name holds it, the path holds it, or its letters come in order
 * (fuzzy).
 */
function score(file: string, query: string): number {
  const path = file.toLowerCase();
  const name = path.slice(path.lastIndexOf('/', path.length - 2) + 1);
  if (name.startsWith(query)) return 0;
  if (name.includes(query)) return 1;
  if (path.includes(query)) return 2;
  let at = 0;
  for (const ch of path) if (ch === query[at]) at++;
  return at === query.length ? 3 : -1;
}

/** The files that fit `query`, best first (then shorter paths, then A to Z), at most `max`. */
export function matchFiles(files: string[], query: string, max: number): string[] {
  const q = query.toLowerCase();
  return files
    .map((file) => ({ file, rank: score(file, q) }))
    .filter((m) => m.rank >= 0)
    .sort(
      (a, b) => a.rank - b.rank || a.file.length - b.file.length || a.file.localeCompare(b.file),
    )
    .slice(0, max)
    .map((m) => m.file);
}
