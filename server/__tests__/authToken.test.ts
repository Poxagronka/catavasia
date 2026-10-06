import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadOrCreateAuthToken } from '../src/authToken.js';
import { logRequest } from '../src/httpServer.js';

const posix = process.platform !== 'win32';
let dir: string;
let file: string;

beforeEach(() => {
  dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pa-auth-token-')), '.pixel-agents');
  file = path.join(dir, 'auth-token');
});

afterEach(() => {
  fs.rmSync(path.dirname(dir), { recursive: true, force: true });
});

describe('loadOrCreateAuthToken', () => {
  it('creates the token file with mode 0600', () => {
    const token = loadOrCreateAuthToken(dir);
    expect(token.length).toBeGreaterThanOrEqual(16);
    expect(fs.readFileSync(file, 'utf-8').trim()).toBe(token);
    if (posix) expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(fs.readdirSync(dir)).toEqual(['auth-token']); // no tmp file left behind
  });

  it('returns the same token on every start', () => {
    const first = loadOrCreateAuthToken(dir);
    expect(loadOrCreateAuthToken(dir)).toBe(first);
  });

  it.runIf(posix)('replaces a token whose file others can read', () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, 'fake-token-0123456789-loose', { mode: 0o644 });
    fs.chmodSync(file, 0o644);
    const token = loadOrCreateAuthToken(dir);
    expect(token).not.toBe('fake-token-0123456789-loose');
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });

  it.runIf(posix)('replaces a symlink instead of reading or writing its target', () => {
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(path.dirname(dir), 'elsewhere');
    fs.writeFileSync(target, 'fake-token-0123456789-target', { mode: 0o600 });
    fs.symlinkSync(target, file);
    const token = loadOrCreateAuthToken(dir);
    expect(token).not.toBe('fake-token-0123456789-target');
    expect(fs.lstatSync(file).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(target, 'utf-8')).toBe('fake-token-0123456789-target');
  });

  it('replaces a short or empty token', () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, 'short\n', { mode: 0o600 });
    expect(loadOrCreateAuthToken(dir)).not.toBe('short');
  });

  it('still returns a token when the file cannot be written', () => {
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    fs.writeFileSync(dir, 'not a directory');
    expect(loadOrCreateAuthToken(dir).length).toBeGreaterThanOrEqual(16);
  });
});

describe('request log', () => {
  it('never holds the token', () => {
    const line = logRequest({ method: 'GET', url: '/ws?token=fake-token-0123456789&x=1' });
    expect(line).toEqual({ method: 'GET', url: '/ws?token=[redacted]&x=1' });
    expect(
      logRequest({ method: 'POST', url: '/api/tasks?a=1&token=fake-token-0123456789' }).url,
    ).toBe('/api/tasks?a=1&token=[redacted]');
    expect(logRequest({ method: 'GET', url: '/api/health' }).url).toBe('/api/health');
  });
});
