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
  write(catId: string, file: PromptFile, subject: string, body?: string): string | undefined {
    const text = renderPromptFile(catId, file);
    const back = parsePromptFile(text);
    if (!back.ok) return back.error;
    if (back.value.role !== file.role.trim()) {
      return 'Role & conduct cannot hold the lines "# Rules" or "# Lessons"';
    }
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.fileOf(catId), text, { mode: 0o600 });
    this.commit(catId, subject, body);
    return undefined;
  }

  remove(catId: string, subject: string): void {
    if (!this.exists(catId)) return;
    fs.rmSync(this.fileOf(catId));
    this.commit(catId, subject);
  }

  /**
   * Replace every prompt file with `files` (others are deleted) in one commit.
   * Returns an error, and changes nothing, when a file would not parse back.
   */
  replaceAll(files: Record<string, PromptFile>, subject: string): string | undefined {
    const texts = new Map<string, string>();
    for (const [catId, file] of Object.entries(files)) {
      const text = renderPromptFile(catId, file);
      if (!parsePromptFile(text).ok) return `${catId}.md would not parse`;
      texts.set(catId, text);
    }
    fs.mkdirSync(this.dir, { recursive: true });
    for (const name of fs.readdirSync(this.dir)) {
      if (name.endsWith('.md') && !texts.has(name.slice(0, -3)))
        fs.rmSync(path.join(this.dir, name));
    }
    for (const [catId, text] of texts) fs.writeFileSync(this.fileOf(catId), text, { mode: 0o600 });
    this.commitPaths('*.md', subject);
    return undefined;
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
    return this.textAt(catId, 'HEAD');
  }

  /** The file as commit `sha` left it (undefined: not in that commit). */
  textAt(catId: string, sha: string): string | undefined {
    try {
      return this.git('show', `${sha}:${catId}.md`);
    } catch {
      return undefined;
    }
  }

  /** Commits that touched the cat's file, newest first. */
  log(catId: string): Array<{ sha: string; at: number; subject: string; body: string }> {
    let out: string;
    try {
      out = this.git('log', '--format=%H%x1f%ct%x1f%s%x1f%b%x1e', '--', `${catId}.md`);
    } catch {
      return [];
    }
    return out
      .split('\x1e')
      .map((rec) => rec.replace(/^\n/, ''))
      .filter(Boolean)
      .map((rec) => {
        const [sha, at, subject, body] = rec.split('\x1f');
        return { sha, at: Number(at) * 1000, subject, body: (body ?? '').trim() };
      });
  }

  /** The unified diff of one commit, for the cat's file only. */
  diff(catId: string, sha: string): string {
    return this.git('show', '--format=', '--no-color', sha, '--', `${catId}.md`);
  }

  /** `ancestor` is in the history of `sha` (the version `sha` contains that commit). */
  contains(sha: string, ancestor: string): boolean {
    try {
      this.git('merge-base', '--is-ancestor', ancestor, sha);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Undo commit `sha` as a new commit. Returns an error and changes nothing
   * when a later commit changed the same lines (conflict) or the result would
   * not parse.
   */
  revert(catId: string, sha: string, subject: string, body?: string): string | undefined {
    // A broken hand edit on disk is never thrown away by a revert.
    const broken = this.read(catId).error;
    if (broken) return `${broken}: fix the file or restore a version first`;
    this.commitHandEdit(catId);
    try {
      this.git('revert', '--no-commit', sha);
    } catch {
      this.abortRevert(catId);
      return 'a later change touched the same lines: revert it by hand or restore a version';
    }
    let text = '';
    try {
      text = fs.readFileSync(this.fileOf(catId), 'utf-8');
    } catch {
      /* the revert deleted the file */
    }
    const parsed = parsePromptFile(text);
    if (!parsed.ok) {
      this.abortRevert(catId);
      return `the reverted file does not parse: ${parsed.error}`;
    }
    // No pathspec: git refuses a partial commit while a revert is in progress.
    const message = body ? ['-m', subject, '-m', body] : ['-m', subject];
    try {
      this.git('commit', '-q', '--no-verify', ...message);
    } catch {
      this.abortRevert(catId);
      return 'nothing to revert: the file already has this change undone';
    }
    return undefined;
  }

  private abortRevert(catId: string): void {
    try {
      this.git('revert', '--abort');
    } catch {
      // Nothing to abort: put the file back as HEAD has it.
      this.git('checkout', 'HEAD', '--', `${catId}.md`);
    }
  }

  /**
   * Commit the cat's file when it changed (no empty commits). A git failure
   * (no git, broken repo) keeps the written file and only loses the history
   * entry: the server must start and save profiles without git.
   */
  private commit(catId: string, subject: string, body?: string): void {
    this.commitPaths(`${catId}.md`, subject, body);
  }

  private commitPaths(spec: string, subject: string, body?: string): void {
    try {
      this.ensure();
      this.git('add', '-A', '--', spec);
      const staged = this.git('diff', '--cached', '--name-only', '--', spec).trim();
      if (!staged) return;
      const message = body ? ['-m', subject, '-m', body] : ['-m', subject];
      this.git('commit', '-q', '--no-verify', ...message, '--', spec);
    } catch (err) {
      console.error(`[catavasia] Cats: prompt commit "${subject}" failed: ${String(err)}`);
    }
  }

  private git(...args: string[]): string {
    // No hooks: a global hooksPath must not add trailers or block a prompt commit.
    return execFileSync('git', ['-C', this.dir, '-c', 'core.hooksPath=/dev/null', ...args], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }
}
