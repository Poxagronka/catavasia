/**
 * Restart into a freshly installed version on the same port, keeping the auth
 * token so the open browser tab (its `?token=` URL) stays privileged.
 *
 * The token travels in an env var of the detached child, never in argv (argv
 * is visible to every user in `ps`). The child deletes it from its env at once
 * and waits until this process has exited, so the port and registry are free.
 * The child's stdout is discarded: the CLI prints the tokened URL there.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';

export const RESTART_TOKEN_ENV = 'CATAVASIA_RESTART_TOKEN';
export const RESTART_WAIT_PID_ENV = 'CATAVASIA_RESTART_WAIT_PID';
const WAIT_STEP_MS = 200;
const WAIT_TIMEOUT_MS = 20_000;

export interface ReplacementOptions {
  cliPath: string;
  port: number;
  host: string;
  token: string;
  /** Where the child's stderr goes. */
  logPath: string;
  spawnFn?: typeof spawn;
}

export function spawnReplacement(opts: ReplacementOptions): void {
  const errFd = fs.openSync(opts.logPath, 'a', 0o600);
  try {
    const child = (opts.spawnFn ?? spawn)(
      process.execPath,
      [opts.cliPath, '--port', String(opts.port), '--host', opts.host],
      {
        cwd: process.cwd(),
        detached: true,
        stdio: ['ignore', 'ignore', errFd],
        env: {
          ...process.env,
          [RESTART_TOKEN_ENV]: opts.token,
          [RESTART_WAIT_PID_ENV]: String(process.pid),
        },
      },
    );
    child.unref();
  } finally {
    fs.closeSync(errFd);
  }
}

/** Take the token a previous server handed over, removing it from the env so
 *  no child process (claude, git, npm) inherits it. */
export function takeInheritedToken(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const token = env[RESTART_TOKEN_ENV];
  delete env[RESTART_TOKEN_ENV];
  return token && token.length >= 16 ? token : undefined;
}

/** When started by a self-update, wait until the old server has exited. */
export async function waitForPreviousServer(
  isRunning: (pid: number) => boolean,
  env: NodeJS.ProcessEnv = process.env,
  timeoutMs = WAIT_TIMEOUT_MS,
): Promise<void> {
  const pid = Number(env[RESTART_WAIT_PID_ENV]);
  delete env[RESTART_WAIT_PID_ENV];
  if (!Number.isSafeInteger(pid) || pid <= 0) return;
  const deadline = Date.now() + timeoutMs;
  while (isRunning(pid) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS));
  }
}
