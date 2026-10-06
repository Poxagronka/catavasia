/**
 * `~/.pixel-agents/prompts`: the cats' prompt files in a local git repo (no
 * remote). Every change is one commit (context-policy.md §5.1). Commits by the
 * user carry the subject `user(<cat>): ...`; the Cat CEO uses its own prefix.
 *
 * Synchronous git (execFileSync): a profile edit commits before the Cats menu
 * gets its answer, and the files are tiny.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { parsePromptFile, type PromptFile, renderPromptFile } from './promptFile.js';

/** The file as the server uses it: the last good version, plus why the disk copy is not used. */
export interface PromptRead {
  file: PromptFile;
  error?: string;
}

const EMPTY: PromptFile = { role: '', rules: [], lessons: [] };

export class PromptRepo {
  constructor(readonly dir: string) {}

  /** Create the folder and its git repo once (local identity, no hooks, no signing). */
  ensure(): void {
    if (fs.existsSync(path.join(this.dir, '.git'))) return;
    fs.mkdirSync(this.dir, { recursive: true });
    this.git('init', '-q');
    this.git('config', 'user.name', 'catavasia');
    this.git('config', 'user.email', 'catavasia@localhost');
    this.git('config', 'commit.gpgsign', 'false');
  }

  fileOf(catId: string): string {
    return path.join(this.dir, `${catId}.md`);
  }

  exists(catId: string): boolean {
    return fs.existsSync(this.fileOf(catId));
  }

  /**
   * The cat's prompt. A file that does not parse is not used: the last
   * committed version is, and `error` says why.
   */
  read(catId: string): PromptRead {
    let text: string;
    try {
      text = fs.readFileSync(this.fileOf(catId), 'utf-8');
    } catch {
      return { file: EMPTY };
    }
    const parsed = parsePromptFile(text);
    if (parsed.ok) return { file: parsed.value };
    const committed = this.committedText(catId);
    const fallback = committed === undefined ? undefined : parsePromptFile(committed);
    return {
      file: fallback?.ok ? fallback.value : EMPTY,
      error: `${catId}.md: ${parsed.error}`,
    };
  }

  /** Write the file and commit it. Returns an error when the file would not parse back. */
  write(catId: string, file: PromptFile, subject: string): string | undefined {
    const text = renderPromptFile(catId, file);
    const back = parsePromptFile(text);
    if (!back.ok) return back.error;
    if (back.value.role !== file.role.trim()) {
      return 'Role & conduct cannot hold the lines "# Rules" or "# Lessons"';
    }
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.fileOf(catId), text, { mode: 0o600 });
    this.commit(catId, subject);
    return undefined;
  }

  remove(catId: string, subject: string): void {
    if (!this.exists(catId)) return;
    fs.rmSync(this.fileOf(catId));
    this.commit(catId, subject);
  }

  /** A hand edit on disk becomes a commit (only when the file still parses). */
  commitHandEdit(catId: string): void {
    if (!this.exists(catId) || this.read(catId).error) return;
    this.commit(catId, `user(${catId}): manual edit`);
  }

  /** The newest commit that touched the cat's file (the `promptSha` of a member). */
  headSha(catId: string): string | undefined {
    try {
      return this.git('log', '-1', '--format=%H', '--', `${catId}.md`).trim() || undefined;
    } catch {
      return undefined;
    }
  }

  private committedText(catId: string): string | undefined {
    try {
      return this.git('show', `HEAD:${catId}.md`);
    } catch {
      return undefined;
    }
  }

  /**
   * Commit the cat's file when it changed (no empty commits). A git failure
   * (no git, broken repo) keeps the written file and only loses the history
   * entry: the server must start and save profiles without git.
   */
  private commit(catId: string, subject: string): void {
    try {
      this.ensure();
      this.git('add', '-A', '--', `${catId}.md`);
      const staged = this.git('diff', '--cached', '--name-only', '--', `${catId}.md`).trim();
      if (!staged) return;
      this.git('commit', '-q', '--no-verify', '-m', subject, '--', `${catId}.md`);
    } catch (err) {
      console.error(`[Pixel Agents] Cats: prompt commit "${subject}" failed: ${String(err)}`);
    }
  }

  private git(...args: string[]): string {
    return execFileSync('git', ['-C', this.dir, ...args], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }
}
