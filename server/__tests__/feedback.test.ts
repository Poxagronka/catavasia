/**
 * Feedback send path: the issue body, the browser fallback link, and the
 * gh-or-fallback decision. `gh` is always a fake: no test runs the real
 * `gh` or reaches GitHub.
 */

import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { describe, expect, it, vi } from 'vitest';

vi.mock('child_process', () => ({ spawn: vi.fn() }));

import { spawn } from 'child_process';

import {
  FEEDBACK_IMAGE_MAX_BYTES,
  FEEDBACK_MAX_IMAGES,
  FEEDBACK_TITLE_MAX_CHARS,
} from '../../core/src/constants.js';
import { FEEDBACK_ASSETS_BRANCH, FEEDBACK_URL_MAX_CHARS } from '../src/constants.js';
import {
  type GhResult,
  type GhRunner,
  runGh,
  submitFeedback,
  validateFeedback,
} from '../src/feedback/githubFeedback.js';
import {
  buildIssueBody,
  environmentBlock,
  fallbackIssueUrl,
  type FeedbackEnvironment,
} from '../src/feedback/issueBody.js';
import { UPDATE_REPO } from '../src/update/updateChecker.js';

const ENV: FeedbackEnvironment = {
  version: '1.4.1-cats.69',
  host: 'VS Code extension',
  os: 'darwin 25.0.0 (arm64)',
  node: 'v22.14.0',
  vscodeVersion: '1.105.0',
};

const PNG_BASE64 = Buffer.from('fake png bytes').toString('base64');

interface Call {
  args: string[];
  stdin?: string;
}

/** A fake `gh`: answers by the API path, records every call. */
function fakeGh(answer: (args: string[]) => Partial<GhResult>): GhRunner & { calls: Call[] } {
  const calls: Call[] = [];
  const gh = async (args: string[], stdin?: string): Promise<GhResult> => {
    calls.push({ args, stdin });
    return { code: 0, stdout: '', stderr: '', ...answer(args) };
  };
  return Object.assign(gh, { calls });
}

const ok = (body: unknown): Partial<GhResult> => ({ stdout: JSON.stringify(body) });
const notFound: Partial<GhResult> = { code: 1, stderr: 'gh: Not Found (HTTP 404)' };
const ISSUE_URL = `https://github.com/${UPDATE_REPO}/issues/123`;

/** gh that is logged in, has the branch and the label, and creates the issue. */
function happyGh(over: (args: string[]) => Partial<GhResult> | undefined = () => undefined) {
  return fakeGh((args) => {
    const special = over(args);
    if (special) return special;
    const path = args[3] ?? '';
    if (path.endsWith('/issues')) return ok({ html_url: ISSUE_URL });
    return ok({});
  });
}

const now = () => new Date('2026-10-07T12:00:00.000Z');

describe('issue body', () => {
  it('adds the environment block with the VS Code version when known', () => {
    const block = environmentBlock(ENV);
    expect(block).toContain('- catavasia: 1.4.1-cats.69');
    expect(block).toContain('- host: VS Code extension');
    expect(block).toContain('- OS: darwin 25.0.0 (arm64)');
    expect(block).toContain('- VS Code: 1.105.0');
    const standalone = environmentBlock({
      ...ENV,
      host: 'standalone CLI',
      vscodeVersion: undefined,
    });
    expect(standalone).not.toContain('VS Code:');
  });

  it('embeds images as markdown and keeps alt text inside the link label', () => {
    const body = buildIssueBody('It broke', ENV, [
      { name: 'shot].png', url: 'https://raw.example/1.png' },
      { name: '', url: 'https://raw.example/2.png' },
    ]);
    expect(body).toContain('It broke');
    expect(body).toContain('![shot .png](https://raw.example/1.png)');
    expect(body).toContain('![image 2](https://raw.example/2.png)');
    expect(body.indexOf('### Screenshots')).toBeLessThan(body.indexOf('### Environment'));
  });

  it('bounds the fallback link and keeps the environment block', () => {
    const long = 'x'.repeat(50_000);
    const url = fallbackIssueUrl('Title', long, ENV, 2);
    expect(url.length).toBeLessThanOrEqual(FEEDBACK_URL_MAX_CHARS);
    expect(url.startsWith(`https://github.com/${UPDATE_REPO}/issues/new?`)).toBe(true);
    const body = new URL(url).searchParams.get('body') ?? '';
    expect(body).toContain('### Environment');
    expect(body).toContain('truncated');
    expect(body).toContain('2 image(s)');
    // Multi-byte text grows when encoded: still bounded.
    const emoji = fallbackIssueUrl('T'.repeat(FEEDBACK_TITLE_MAX_CHARS), '猫'.repeat(9000), ENV, 0);
    expect(emoji.length).toBeLessThanOrEqual(FEEDBACK_URL_MAX_CHARS);
  });

  it('keeps a short description whole', () => {
    const url = fallbackIssueUrl('Title', 'Short', ENV, 0);
    const body = new URL(url).searchParams.get('body') ?? '';
    expect(body).toContain('Short');
    expect(body).not.toContain('truncated');
  });
});

describe('validateFeedback', () => {
  const image = { name: 'a.png', type: 'image/png', data: PNG_BASE64 };

  it('refuses a missing title, too many images, a wrong or prototype type, a big image', () => {
    expect(validateFeedback({ title: '  ', description: '', images: [] })).toBe('Write a title.');
    const many = Array.from({ length: FEEDBACK_MAX_IMAGES + 1 }, () => image);
    expect(validateFeedback({ title: 't', images: many })).toMatch(/At most/);
    expect(validateFeedback({ title: 't', images: [{ ...image, type: 'text/html' }] })).toMatch(
      /Only PNG/,
    );
    expect(validateFeedback({ title: 't', images: [{ ...image, type: 'constructor' }] })).toMatch(
      /Only PNG/,
    );
    const big = Buffer.alloc(FEEDBACK_IMAGE_MAX_BYTES + 1).toString('base64');
    expect(validateFeedback({ title: 't', images: [{ ...image, data: big }] })).toMatch(/too big/);
  });

  it('accepts a valid form', () => {
    const v = validateFeedback({ title: ' Hi ', description: 'd', images: [image] });
    expect(v).toMatchObject({ title: 'Hi', description: 'd', images: [{ ext: 'png' }] });
  });
});

describe('submitFeedback', () => {
  const msg = {
    type: 'submitFeedback',
    title: 'Bug $(rm -rf ~) `x`; "q"',
    description: 'Steps && more',
    images: [{ name: 'shot.png', type: 'image/png', data: PNG_BASE64 }],
  };

  it('creates the issue with gh: uploads images, adds the label, keeps user text off argv', async () => {
    const gh = happyGh();
    const result = await submitFeedback(msg, { privileged: true, env: ENV, gh, now });
    expect(result).toEqual({ type: 'feedbackResult', status: 'created', url: ISSUE_URL });

    for (const call of gh.calls) {
      expect(call.args.join(' ')).not.toContain('rm -rf');
      expect(call.args.join(' ')).not.toContain('Steps');
    }
    const upload = gh.calls.find((c) => c.args[2] === 'PUT');
    expect(upload?.args[3]).toMatch(
      new RegExp(
        `^repos/${UPDATE_REPO}/contents/feedback/2026-10-07T12-00-00-000Z-[0-9a-f]{6}-1\\.png$`,
      ),
    );
    expect(JSON.parse(upload?.stdin ?? '{}')).toMatchObject({
      branch: FEEDBACK_ASSETS_BRANCH,
      content: PNG_BASE64,
    });
    const create = gh.calls.find((c) => c.args[3] === `repos/${UPDATE_REPO}/issues`);
    const sent = JSON.parse(create?.stdin ?? '{}');
    expect(sent.title).toBe('Bug $(rm -rf ~) `x`; "q"');
    expect(sent.labels).toEqual(['feedback']);
    expect(sent.body).toContain(
      `https://raw.githubusercontent.com/${UPDATE_REPO}/${FEEDBACK_ASSETS_BRANCH}/feedback/`,
    );
    expect(sent.body).toContain('- VS Code: 1.105.0');
  });

  it('creates the assets branch from the default branch when it is missing', async () => {
    const gh = happyGh((args) => {
      if (args[3] === `repos/${UPDATE_REPO}/branches/${FEEDBACK_ASSETS_BRANCH}`) return notFound;
      if (args[3] === `repos/${UPDATE_REPO}`) return ok({ default_branch: 'main' });
      if (args[3] === `repos/${UPDATE_REPO}/git/ref/heads/main`)
        return ok({ object: { sha: 'abc' } });
      return undefined;
    });
    await submitFeedback(msg, { privileged: true, env: ENV, gh, now });
    const create = gh.calls.find((c) => c.args[3] === `repos/${UPDATE_REPO}/git/refs`);
    expect(JSON.parse(create?.stdin ?? '{}')).toEqual({
      ref: `refs/heads/${FEEDBACK_ASSETS_BRANCH}`,
      sha: 'abc',
    });
  });

  it('sends without the label when the repo has none', async () => {
    const gh = happyGh((args) => (args[3]?.includes('/labels/') ? notFound : undefined));
    const result = await submitFeedback(
      { ...msg, images: [] },
      { privileged: true, env: ENV, gh, now },
    );
    expect(result.status).toBe('created');
    const create = gh.calls.find((c) => c.args[3] === `repos/${UPDATE_REPO}/issues`);
    expect(JSON.parse(create?.stdin ?? '{}').labels).toBeUndefined();
    expect(gh.calls.some((c) => c.args[2] === 'PUT')).toBe(false);
  });

  it('falls back to the browser form when gh is not logged in', async () => {
    const gh = fakeGh((args) => (args[0] === 'auth' ? { code: 1, stderr: 'not logged in' } : {}));
    const result = await submitFeedback(msg, { privileged: true, env: ENV, gh, now });
    expect(result.status).toBe('fallback');
    expect(result.error).toMatch(/not logged in/);
    expect(result.url).toMatch(`https://github.com/${UPDATE_REPO}/issues/new?`);
    expect(gh.calls).toHaveLength(1);
  });

  it('falls back when a gh call fails midway', async () => {
    const gh = happyGh((args) =>
      args[2] === 'PUT' ? { code: 1, stderr: 'gh: Resource not accessible (HTTP 403)' } : undefined,
    );
    const result = await submitFeedback(msg, { privileged: true, env: ENV, gh, now });
    expect(result.status).toBe('fallback');
    expect(result.error).toContain('HTTP 403');
    expect(gh.calls.some((c) => c.args[3] === `repos/${UPDATE_REPO}/issues`)).toBe(false);
  });

  it('never runs gh for a connection without the server token', async () => {
    const gh = happyGh();
    const result = await submitFeedback(msg, { privileged: false, env: ENV, gh, now });
    expect(result.status).toBe('fallback');
    expect(gh.calls).toHaveLength(0);
  });

  it('answers an invalid form with an error and runs nothing', async () => {
    const gh = happyGh();
    const result = await submitFeedback({ title: '' }, { privileged: true, env: ENV, gh, now });
    expect(result).toEqual({ type: 'feedbackResult', status: 'error', error: 'Write a title.' });
    expect(gh.calls).toHaveLength(0);
  });

  it('falls back when gh is not installed (spawn ENOENT), with no shell', async () => {
    const spawnMock = vi.mocked(spawn);
    spawnMock.mockImplementation((() => {
      const child = Object.assign(new EventEmitter(), {
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
      });
      setImmediate(() => child.emit('error', new Error('spawn gh ENOENT')));
      return child;
    }) as unknown as typeof spawn);
    const result = await submitFeedback(msg, { privileged: true, env: ENV, gh: runGh, now });
    expect(result.status).toBe('fallback');
    expect(result.error).toMatch(/not installed/);
    const [cmd, args, opts] = spawnMock.mock.calls[0];
    expect(cmd).toBe('gh');
    expect(args).toEqual(['auth', 'status', '--hostname', 'github.com']);
    expect((opts as { shell?: unknown }).shell).toBeUndefined();
  });
});
