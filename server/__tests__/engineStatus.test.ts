/**
 * Engine status probe (src/orchestrator/engineStatus.ts): parsing of the real
 * CLI outputs (recorded 2026-10-06 with claude 2.1.291 and codex-cli 0.160.1;
 * the logged-out ones under an empty temp HOME / CODEX_HOME), a missing
 * binary, the TTL cache, and the auth-error matcher.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it, vi } from 'vitest';

import {
  actionableMessage,
  EngineStatusProbe,
  isAuthError,
  notReadyReason,
  parseClaudeAuthStatus,
  parseCodexLoginStatus,
  parseVersion,
  probeEngine,
  STATUS_TTL_MS,
} from '../src/orchestrator/engineStatus.js';

/** `claude auth status` while logged in (email and org ids redacted). */
const CLAUDE_LOGGED_IN = `{
  "loggedIn": true,
  "authMethod": "claude.ai",
  "apiProvider": "firstParty",
  "analyticsDisabled": false,
  "projectsDirectory": "/Users/u/.claude/projects",
  "configDirectory": "/Users/u/.claude",
  "email": "user@example.com",
  "orgId": "00000000-0000-0000-0000-000000000000",
  "orgName": "user@example.com's Organization",
  "subscriptionType": "max"
}`;

/** `claude auth status` under an empty HOME (exit 1). */
const CLAUDE_LOGGED_OUT = `{
  "loggedIn": false,
  "authMethod": "none",
  "apiProvider": "firstParty",
  "analyticsDisabled": false,
  "projectsDirectory": "/tmp/emptyhome/.claude/projects",
  "configDirectory": "/tmp/emptyhome/.claude"
}`;

/** The result line of `claude -p --output-format stream-json` while logged out. */
const CLAUDE_HEADLESS_LOGGED_OUT = 'Not logged in · Please run /login';

describe('parsing the CLI status output', () => {
  it('reads claude auth status: logged in, logged out, unknown', () => {
    expect(parseClaudeAuthStatus(CLAUDE_LOGGED_IN)).toEqual({
      loggedIn: true,
      detail: 'logged in (claude.ai)',
      apiKey: false,
    });
    expect(parseClaudeAuthStatus(CLAUDE_LOGGED_OUT)).toEqual({
      loggedIn: false,
      detail: 'not logged in',
    });
    // An older CLI without `auth status` prints help or an error: unknown, never "logged out".
    expect(parseClaudeAuthStatus("error: unknown command 'auth'")).toEqual({});
    expect(parseClaudeAuthStatus('')).toEqual({});
  });

  it('tells an API key login (money shown) from a subscription (money hidden)', () => {
    const auth = (authMethod: string) =>
      parseClaudeAuthStatus(JSON.stringify({ loggedIn: true, authMethod })).apiKey;
    // authMethod values of `claude auth status` in CLI 2.1.292.
    expect(auth('api_key')).toBe(true);
    expect(auth('api_key_helper')).toBe(true);
    expect(auth('third_party')).toBe(true);
    expect(auth('claude.ai')).toBe(false);
    expect(auth('oauth_token')).toBe(false);
    // A method this code does not know: unknown, so the UI hides money.
    expect(auth('something_new')).toBeUndefined();
    expect(parseClaudeAuthStatus(CLAUDE_LOGGED_OUT).apiKey).toBeUndefined();
  });

  it('reads codex login status: logged in, logged out, unknown; never shows an API key', () => {
    expect(parseCodexLoginStatus('Logged in using ChatGPT\n')).toEqual({
      loggedIn: true,
      detail: 'Logged in using ChatGPT',
      apiKey: false,
    });
    expect(parseCodexLoginStatus('Not logged in\n')).toEqual({
      loggedIn: false,
      detail: 'not logged in',
    });
    expect(parseCodexLoginStatus('Logged in using an API key - sk-proj-***ABCD')).toEqual({
      loggedIn: true,
      detail: 'Logged in using an API key',
      apiKey: true,
    });
    expect(parseCodexLoginStatus('something else')).toEqual({});
  });

  it('reads the versions', () => {
    expect(parseVersion('2.1.291 (Claude Code)\n')).toBe('2.1.291');
    expect(parseVersion('codex-cli 0.160.1\n')).toBe('0.160.1');
    expect(parseVersion('')).toBeUndefined();
  });

  it('knows an engine auth error and leaves other "logged in" texts alone', () => {
    expect(isAuthError(CLAUDE_HEADLESS_LOGGED_OUT)).toBe(true);
    expect(isAuthError('Not logged in')).toBe(true);
    expect(isAuthError('Invalid API key · Fix external API key')).toBe(true);
    expect(isAuthError('You are not logged into any GitHub hosts. Run gh auth login')).toBe(false);
    expect(isAuthError('Stripe request failed: Invalid API key provided')).toBe(false);
    expect(isAuthError('Exit code 1: no output')).toBe(false);
    expect(isAuthError(undefined)).toBe(false);
  });

  it('says what is wrong and how to fix it', () => {
    expect(notReadyReason('claude', undefined)).toBeUndefined();
    expect(notReadyReason('claude', { installed: true })).toBeUndefined();
    expect(notReadyReason('claude', { installed: true, loggedIn: false })).toBe(
      'Claude Code: not logged in',
    );
    expect(notReadyReason('codex', { installed: false })).toBe('Codex: not installed');
    expect(actionableMessage('claude', { installed: true, loggedIn: false })).toContain(
      '`claude auth login`',
    );
    expect(actionableMessage('codex', { installed: false })).toContain(
      '`npm install -g @openai/codex`',
    );
  });
});

describe('probeEngine', () => {
  const fakeBin = (script: string): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-engine-'));
    const bin = path.join(dir, 'fake');
    fs.writeFileSync(bin, `#!/bin/sh\n${script}\n`, { mode: 0o755 });
    return bin;
  };

  it('reports a missing binary as not installed', async () => {
    const status = await probeEngine('claude', '/nonexistent/claude-binary');
    expect(status.installed).toBe(false);
    expect(notReadyReason('claude', status)).toBe('Claude Code: not installed');
  });

  it('reads version and login from a logged-out claude', async () => {
    const bin = fakeBin(
      `if [ "$1" = "--version" ]; then echo "2.1.291 (Claude Code)"; exit 0; fi\n` +
        `if [ "$1 $2" = "auth status" ]; then echo '${CLAUDE_LOGGED_OUT.replace(/\n/g, ' ')}'; exit 1; fi\nexit 2`,
    );
    expect(await probeEngine('claude', bin)).toEqual({
      installed: true,
      version: '2.1.291',
      loggedIn: false,
      detail: 'not logged in',
    });
  });

  it('reads codex login status from stderr', async () => {
    const bin = fakeBin(
      `if [ "$1" = "--version" ]; then echo "codex-cli 0.160.1"; exit 0; fi\n` +
        `if [ "$1 $2" = "login status" ]; then echo "Not logged in" >&2; exit 1; fi\nexit 2`,
    );
    expect(await probeEngine('codex', bin)).toMatchObject({ installed: true, loggedIn: false });
  });
});

describe('EngineStatusProbe', () => {
  it('caches for the TTL, re-probes when stale or forced, and tells about changes', async () => {
    let now = 0;
    let loggedIn = false;
    const probe = vi.fn(async () => ({ installed: true, loggedIn }));
    const changed = vi.fn();
    const cache = new EngineStatusProbe(probe, changed, () => now);

    expect(await cache.refresh()).toEqual({ installed: true, loggedIn: false });
    expect(await cache.refresh()).toEqual({ installed: true, loggedIn: false });
    expect(probe).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledTimes(1);

    loggedIn = true;
    expect(cache.current()?.loggedIn).toBe(false); // fresh: no probe
    now += STATUS_TTL_MS + 1;
    cache.current(); // stale: probes in the background
    await vi.waitFor(() => expect(cache.current()?.loggedIn).toBe(true));
    expect(changed).toHaveBeenCalledTimes(2);

    expect(await cache.refresh(true)).toEqual({ installed: true, loggedIn: true });
    expect(changed).toHaveBeenCalledTimes(2); // same status: no news
  });

  it('a forced probe during a running one probes again after it', async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const cache = new EngineStatusProbe(
      async () => {
        calls++;
        if (calls === 1) await gate;
        return { installed: true, loggedIn: calls > 1 };
      },
      () => {},
    );
    const first = cache.refresh();
    const forced = cache.refresh(true);
    release();
    await first;
    expect(await forced).toEqual({ installed: true, loggedIn: true });
    expect(calls).toBe(2);
  });

  it('marks the engine logged out after an auth error', async () => {
    const cache = new EngineStatusProbe(
      async () => ({ installed: true, version: '2.1.291', loggedIn: true }),
      () => {},
    );
    await cache.refresh();
    cache.markLoggedOut();
    expect(cache.current()).toEqual({
      installed: true,
      version: '2.1.291',
      loggedIn: false,
      detail: 'not logged in',
    });
  });
});
