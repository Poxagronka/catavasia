/**
 * Self-update install: builds the fixed repo's branch from source and installs
 * it over the global `catavasia`, the same steps a user runs by hand (clone,
 * npm ci, build, npm pack, npm install -g). Runs only when the user asks.
 * Every command is spawned without a shell. The work dir is always removed;
 * the log file stays. A failure leaves the running server untouched.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

import type { UpdateRunState } from '../../../core/src/selfUpdate.js';

/** Runs one command, streaming each output line; resolves with stdout. */
export type RunCommand = (
  cmd: string,
  args: string[],
  opts: { cwd: string; onLine: (line: string) => void },
) => Promise<string>;

export interface UpdateRunnerOptions {
  /** ~/.pixel-agents/update */
  updateDir: string;
  repoUrl: string;
  branch: string;
  /** Why an update must not start now (a cat works), or undefined. */
  busyReason: () => string | undefined;
  /** Start the installed version and stop this one. */
  restart: (cliPath: string) => void;
  run?: RunCommand;
  /** How often to re-check a busy office before the restart. */
  idlePollMs?: number;
}

export const STEP_NAMES = [
  'Download source',
  'Install dependencies',
  'Build',
  'Pack',
  'Install',
  'Locate install',
] as const;
const LOG_TAIL_LINES = 40;

export const spawnCommand: RunCommand = (cmd, args, { cwd, onLine }) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    readline.createInterface({ input: child.stdout }).on('line', onLine);
    readline.createInterface({ input: child.stderr }).on('line', onLine);
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve(stdout) : reject(new Error(`${cmd} exited with code ${code}`)),
    );
  });

export class UpdateRunner {
  private current: UpdateRunState = { phase: 'idle', steps: [], log: [] };
  private job?: Promise<void>;

  constructor(private readonly opts: UpdateRunnerOptions) {}

  state(): UpdateRunState {
    return { ...this.current, steps: this.current.steps.map((s) => ({ ...s })) };
  }

  /** Start an update, or say why not. Never throws. */
  start(): { ok: true } | { ok: false; reason: string } {
    if (this.current.phase === 'running' || this.current.phase === 'restarting') {
      return { ok: false, reason: 'An update is already running.' };
    }
    const busy = this.opts.busyReason();
    if (busy) return { ok: false, reason: busy };
    this.current = {
      phase: 'running',
      steps: STEP_NAMES.map((name) => ({ name, status: 'pending' })),
      log: [],
    };
    this.job = this.execute();
    return { ok: true };
  }

  /** Resolves when the current job ends (tests). */
  async finished(): Promise<void> {
    await this.job;
  }

  private async execute(): Promise<void> {
    const run = this.opts.run ?? spawnCommand;
    let workDir: string | undefined;
    // The step a failure belongs to: the running one, or the last one when
    // its output fails a check (no .tgz name, no installed CLI).
    let stepIndex = -1;
    const step = async (cmd: string, args: string[], cwd: string): Promise<string> => {
      const entry = this.current.steps[++stepIndex];
      entry.status = 'running';
      this.append(`$ ${cmd} ${args.join(' ')}`);
      const out = await run(cmd, args, { cwd, onLine: (line) => this.append(line) });
      entry.status = 'done';
      return out;
    };
    try {
      fs.mkdirSync(this.opts.updateDir, { recursive: true, mode: 0o700 });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      this.current.logPath = path.join(this.opts.updateDir, `update-${stamp}.log`);
      workDir = fs.mkdtempSync(path.join(this.opts.updateDir, 'work-'));
      const src = path.join(workDir, 'src');

      const { repoUrl, branch } = this.opts;
      await step('git', ['clone', '--depth', '1', '--branch', branch, repoUrl, src], workDir);
      await step('npm', ['ci', '--include=dev'], src);
      // `package` is the production build `prepack` would run; pack then skips it.
      await step('npm', ['run', 'package'], src);
      const tgz = lastLine(await step('npm', ['pack', '--ignore-scripts'], src));
      if (!tgz.endsWith('.tgz')) throw new Error('npm pack did not name a .tgz file');
      await step('npm', ['install', '-g', path.join(src, tgz)], workDir);
      const pkgDir = path.join(lastLine(await step('npm', ['root', '-g'], workDir)), 'catavasia');
      const cliPath = path.join(pkgDir, 'dist', 'cli.js');
      if (!fs.existsSync(cliPath)) throw new Error(`No installed CLI at ${cliPath}`);
      const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8')) as {
        version?: string;
      };

      // A task may have started during the build: restart only when idle.
      let busy = this.opts.busyReason();
      if (busy) this.append(`Installed. Waiting to restart: ${busy}`);
      while (busy) {
        await new Promise((resolve) => setTimeout(resolve, this.opts.idlePollMs ?? 5000));
        busy = this.opts.busyReason();
      }
      this.append(`Installed ${pkg.version ?? '(unknown version)'}. Restarting…`);
      this.current.installedVersion = pkg.version;
      this.current.phase = 'restarting';
      this.opts.restart(cliPath);
    } catch (err) {
      const failed = this.current.steps[stepIndex];
      if (failed) failed.status = 'failed';
      const message = err instanceof Error ? err.message : String(err);
      this.current.error = `${failed?.name ?? 'Update'} failed: ${message}`;
      this.current.phase = 'failed';
      this.append(this.current.error);
    } finally {
      try {
        if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
      } catch (err) {
        this.append(`Could not remove ${workDir}: ${String(err)}`);
      }
    }
  }

  private append(line: string): void {
    this.current.log.push(line);
    if (this.current.log.length > LOG_TAIL_LINES) this.current.log.shift();
    if (this.current.logPath) {
      try {
        fs.appendFileSync(this.current.logPath, line + '\n', { mode: 0o600 });
      } catch {
        // The log file is a convenience; the tail in the UI still works.
      }
    }
  }
}

function lastLine(text: string): string {
  return text.trim().split('\n').pop()?.trim() ?? '';
}
