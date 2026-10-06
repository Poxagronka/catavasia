import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  RESTART_TOKEN_ENV,
  RESTART_WAIT_PID_ENV,
  spawnReplacement,
  takeInheritedToken,
  waitForPreviousServer,
} from '../src/update/restart.js';
import { type RunCommand, STEP_NAMES, UpdateRunner } from '../src/update/updateRunner.js';

let tmp: string;
let globalRoot: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-update-'));
  globalRoot = path.join(tmp, 'global');
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** A fake toolchain: each command succeeds unless it is the `failAt` step. */
function fakeRun(failAt?: number): { run: RunCommand; calls: string[][] } {
  const calls: string[][] = [];
  const run: RunCommand = async (cmd, args, { onLine }) => {
    const index = calls.length;
    calls.push([cmd, ...args]);
    onLine(`output of ${cmd} ${args[0]}`);
    if (index === failAt) throw new Error(`${cmd} exited with code 1`);
    if (cmd === 'npm' && args[0] === 'pack') return 'notice\ncatavasia-1.4.1-cats.20.tgz\n';
    if (cmd === 'npm' && args[0] === 'root') {
      const pkg = path.join(globalRoot, 'catavasia');
      fs.mkdirSync(path.join(pkg, 'dist'), { recursive: true });
      fs.writeFileSync(path.join(pkg, 'dist', 'cli.js'), '');
      fs.writeFileSync(path.join(pkg, 'package.json'), '{"version":"1.4.1-cats.20"}');
      return `${globalRoot}\n`;
    }
    return '';
  };
  return { run, calls };
}

function makeRunner(run: RunCommand, busy?: string) {
  const restart = vi.fn();
  const runner = new UpdateRunner({
    updateDir: path.join(tmp, 'update'),
    repoUrl: 'https://github.com/Poxagronka/catavasia.git',
    branch: 'main',
    busyReason: () => busy,
    restart,
    run,
  });
  return { runner, restart };
}

function workDirs(): string[] {
  return fs.readdirSync(path.join(tmp, 'update')).filter((f) => f.startsWith('work-'));
}

describe('UpdateRunner', () => {
  it('builds from the fixed repo, installs globally and restarts into the new CLI', async () => {
    const { run, calls } = fakeRun();
    const { runner, restart } = makeRunner(run);
    expect(runner.start()).toEqual({ ok: true });
    await runner.finished();

    const s = runner.state();
    expect(s.phase).toBe('restarting');
    expect(s.installedVersion).toBe('1.4.1-cats.20');
    expect(s.steps.every((step) => step.status === 'done')).toBe(true);
    expect(calls.map((c) => c.slice(0, 3).join(' '))).toEqual([
      'git clone --depth',
      'npm ci --include=dev',
      'npm run package',
      'npm pack --ignore-scripts',
      expect.stringMatching(/^npm install -g/),
      'npm root -g',
    ]);
    expect(calls[0]).toContain('https://github.com/Poxagronka/catavasia.git');
    expect(calls[4][3]).toMatch(/catavasia-1\.4\.1-cats\.20\.tgz$/);
    expect(restart).toHaveBeenCalledWith(path.join(globalRoot, 'catavasia', 'dist', 'cli.js'));
    expect(workDirs()).toEqual([]); // temp dir cleaned
    expect(fs.readFileSync(s.logPath!, 'utf-8')).toContain('output of npm ci');
  });

  for (let failAt = 0; failAt < STEP_NAMES.length; failAt++) {
    it(`stops at "${STEP_NAMES[failAt]}", keeps the server and cleans up`, async () => {
      const { run, calls } = fakeRun(failAt);
      const { runner, restart } = makeRunner(run);
      runner.start();
      await runner.finished();

      const s = runner.state();
      expect(s.phase).toBe('failed');
      expect(s.error).toBe(`${STEP_NAMES[failAt]} failed: ${calls[failAt][0]} exited with code 1`);
      expect(s.steps[failAt].status).toBe('failed');
      expect(s.steps.slice(failAt + 1).every((step) => step.status === 'pending')).toBe(true);
      expect(calls).toHaveLength(failAt + 1);
      expect(restart).not.toHaveBeenCalled();
      expect(workDirs()).toEqual([]);
      expect(fs.existsSync(s.logPath!)).toBe(true);
    });
  }

  it('refuses while a cat works and says why', () => {
    const { run, calls } = fakeRun();
    const { runner } = makeRunner(run, 'Cats are working on "x".');
    expect(runner.start()).toEqual({ ok: false, reason: 'Cats are working on "x".' });
    expect(runner.state().phase).toBe('idle');
    expect(calls).toEqual([]);
  });

  it('refuses a second start while one runs, and allows a retry after a failure', async () => {
    const { run } = fakeRun(1);
    const { runner } = makeRunner(run);
    runner.start();
    expect(runner.start()).toEqual({ ok: false, reason: 'An update is already running.' });
    await runner.finished();
    expect(runner.state().phase).toBe('failed');
    expect(runner.start().ok).toBe(true);
    await runner.finished();
  });

  it('fails when npm pack names no tarball', async () => {
    const run: RunCommand = async (_cmd, args) => (args[0] === 'pack' ? 'nothing' : '');
    const { runner } = makeRunner(run);
    runner.start();
    await runner.finished();
    expect(runner.state().error).toBe('Pack failed: npm pack did not name a .tgz file');
  });
});

describe('restart keeps the token', () => {
  it('passes the token to the new process in its env, never in argv', () => {
    const child = { unref: vi.fn() };
    const spawnFn = vi.fn(() => child);
    spawnReplacement({
      cliPath: '/g/catavasia/dist/cli.js',
      port: 3100,
      host: '127.0.0.1',
      token: 'secret-token-0123456789',
      logPath: path.join(tmp, 'restart.log'),
      spawnFn: spawnFn as never,
    });
    const [cmd, argv, opts] = spawnFn.mock.calls[0] as unknown as [
      string,
      string[],
      { env: NodeJS.ProcessEnv; detached: boolean; stdio: unknown[] },
    ];
    expect(cmd).toBe(process.execPath);
    expect(argv).toEqual(['/g/catavasia/dist/cli.js', '--port', '3100', '--host', '127.0.0.1']);
    expect(argv.join(' ')).not.toContain('secret');
    expect(opts.env[RESTART_TOKEN_ENV]).toBe('secret-token-0123456789');
    expect(opts.env[RESTART_WAIT_PID_ENV]).toBe(String(process.pid));
    expect(opts.detached).toBe(true);
    expect(opts.stdio[1]).toBe('ignore'); // stdout carries the tokened URL
    expect(child.unref).toHaveBeenCalled();
  });

  it('the new process takes the token and removes it from its env', () => {
    const env: NodeJS.ProcessEnv = { [RESTART_TOKEN_ENV]: 'secret-token-0123456789' };
    expect(takeInheritedToken(env)).toBe('secret-token-0123456789');
    expect(env[RESTART_TOKEN_ENV]).toBeUndefined();
    expect(takeInheritedToken({})).toBeUndefined();
    expect(takeInheritedToken({ [RESTART_TOKEN_ENV]: 'short' })).toBeUndefined();
  });

  it('waits until the old server pid is gone', async () => {
    let alive = 3;
    const isRunning = vi.fn(() => alive-- > 0);
    const env: NodeJS.ProcessEnv = { [RESTART_WAIT_PID_ENV]: '4242' };
    await waitForPreviousServer(isRunning, env, 5000);
    expect(isRunning).toHaveBeenCalledWith(4242);
    expect(isRunning).toHaveBeenCalledTimes(4);
    expect(env[RESTART_WAIT_PID_ENV]).toBeUndefined();
  });

  it('does not wait on a normal start', async () => {
    const isRunning = vi.fn(() => true);
    await waitForPreviousServer(isRunning, {});
    expect(isRunning).not.toHaveBeenCalled();
  });
});
