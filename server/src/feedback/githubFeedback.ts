/**
 * Feedback send path: create the issue with the user's local `gh` login,
 * else hand back a prefilled browser form.
 *
 * GitHub's REST "Create an issue" endpoint takes no files (only title, body,
 * labels and the like: docs.github.com/en/rest/issues/issues#create-an-issue,
 * checked 2026-10-07). So each image goes to the `feedback-assets` branch
 * through the Contents API first, and the body links its raw URL.
 *
 * Security: `gh` runs with an argument array and no shell. Every user value
 * (title, description, image bytes) travels as JSON on stdin (`--input -`),
 * never in argv or in an API path. The token stays inside `gh`: nothing here
 * reads it, and nothing reaches the webview but the issue or form URL.
 */

import { spawn } from 'child_process';
import { randomBytes } from 'crypto';
import * as os from 'os';

import {
  FEEDBACK_DESCRIPTION_MAX_CHARS,
  FEEDBACK_IMAGE_EXTENSIONS,
  FEEDBACK_IMAGE_MAX_BYTES,
  FEEDBACK_MAX_IMAGES,
  FEEDBACK_MAX_TOTAL_BYTES,
  FEEDBACK_TITLE_MAX_CHARS,
} from '../../../core/src/constants.js';
import type { FeedbackResult } from '../../../core/src/messages.js';
import {
  FEEDBACK_ASSETS_BRANCH,
  FEEDBACK_ASSETS_DIR,
  FEEDBACK_GH_TIMEOUT_MS,
  FEEDBACK_LABEL,
} from '../constants.js';
import { UPDATE_REPO } from '../update/updateChecker.js';
import { buildIssueBody, fallbackIssueUrl, type FeedbackEnvironment } from './issueBody.js';

export interface GhResult {
  /** Exit code; -1 when `gh` could not start (not installed) or timed out. */
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs `gh <args>` with `stdin`. Tests inject a fake: they never run the real `gh`. */
export type GhRunner = (args: string[], stdin?: string) => Promise<GhResult>;

export const runGh: GhRunner = (args, stdin) =>
  new Promise((resolve) => {
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const child = spawn('gh', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: FEEDBACK_GH_TIMEOUT_MS,
      // Never wait on an interactive prompt or print an update notice.
      env: { ...process.env, GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1' },
    });
    child.stdout.on('data', (b: Buffer) => out.push(b));
    child.stderr.on('data', (b: Buffer) => err.push(b));
    child.stdin.on('error', () => {}); // EPIPE when gh is missing or exits early.
    child.on('error', (e) => resolve({ code: -1, stdout: '', stderr: e.message }));
    child.on('close', (code) =>
      resolve({
        code: code ?? -1,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
      }),
    );
    child.stdin.end(stdin ?? '');
  });

class GhError extends Error {
  constructor(
    message: string,
    readonly notFound = false,
  ) {
    super(message);
  }
}

/** `gh api` with a JSON body on stdin. Returns the parsed reply. */
async function api(
  gh: GhRunner,
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const input = body === undefined ? [] : ['--input', '-'];
  const r = await gh(
    ['api', '--method', method, path, ...input],
    body === undefined ? undefined : JSON.stringify(body),
  );
  if (r.code !== 0) {
    const text = (r.stderr || r.stdout).trim().split('\n')[0] || `gh api ${path} failed`;
    throw new GhError(text, /HTTP 404/.test(r.stderr));
  }
  return r.stdout.trim() ? (JSON.parse(r.stdout) as Record<string, unknown>) : {};
}

interface ValidImage {
  name: string;
  ext: string;
  /** Normalized base64 (decoded and encoded again). */
  base64: string;
}

interface ValidFeedback {
  title: string;
  description: string;
  images: ValidImage[];
}

/** The checked input, or why it is refused. The webview checks the same limits first. */
export function validateFeedback(msg: Record<string, unknown>): ValidFeedback | string {
  const title = typeof msg.title === 'string' ? msg.title.trim() : '';
  if (!title) return 'Write a title.';
  if (title.length > FEEDBACK_TITLE_MAX_CHARS)
    return `The title is longer than ${FEEDBACK_TITLE_MAX_CHARS} characters.`;
  const description = typeof msg.description === 'string' ? msg.description : '';
  if (description.length > FEEDBACK_DESCRIPTION_MAX_CHARS)
    return `The description is longer than ${FEEDBACK_DESCRIPTION_MAX_CHARS} characters.`;
  const raw = Array.isArray(msg.images) ? (msg.images as unknown[]) : [];
  if (raw.length > FEEDBACK_MAX_IMAGES) return `At most ${FEEDBACK_MAX_IMAGES} images.`;
  const images: ValidImage[] = [];
  let total = 0;
  for (const item of raw) {
    const img = (item ?? {}) as Record<string, unknown>;
    // Own keys only: 'constructor' must not resolve through the prototype.
    const ext =
      typeof img.type === 'string' && Object.hasOwn(FEEDBACK_IMAGE_EXTENSIONS, img.type)
        ? FEEDBACK_IMAGE_EXTENSIONS[img.type]
        : undefined;
    if (!ext || typeof img.data !== 'string') return 'Only PNG, JPEG, GIF and WebP images.';
    const bytes = Buffer.from(img.data, 'base64');
    if (bytes.length > FEEDBACK_IMAGE_MAX_BYTES) return 'An image is too big.';
    total += bytes.length;
    images.push({
      name: typeof img.name === 'string' ? img.name : '',
      ext,
      base64: bytes.toString('base64'),
    });
  }
  if (total > FEEDBACK_MAX_TOTAL_BYTES) return 'The images are too big together.';
  return { title, description, images };
}

/** Create FEEDBACK_ASSETS_BRANCH from the default branch when it is missing. */
async function ensureAssetsBranch(gh: GhRunner): Promise<void> {
  try {
    await api(gh, 'GET', `repos/${UPDATE_REPO}/branches/${FEEDBACK_ASSETS_BRANCH}`);
    return;
  } catch (e) {
    if (!(e instanceof GhError && e.notFound)) throw e;
  }
  const repo = await api(gh, 'GET', `repos/${UPDATE_REPO}`);
  const ref = await api(
    gh,
    'GET',
    `repos/${UPDATE_REPO}/git/ref/heads/${String(repo.default_branch)}`,
  );
  const sha = (ref.object as { sha?: string } | undefined)?.sha;
  if (!sha) throw new GhError('Could not read the default branch.');
  await api(gh, 'POST', `repos/${UPDATE_REPO}/git/refs`, {
    ref: `refs/heads/${FEEDBACK_ASSETS_BRANCH}`,
    sha,
  });
}

/** Upload each image to the assets branch. Returns the raw URLs, in order. */
async function uploadImages(
  gh: GhRunner,
  images: ValidImage[],
  now: Date,
): Promise<Array<{ name: string; url: string }>> {
  await ensureAssetsBranch(gh);
  // Our own name only: no user text in the API path.
  const stamp = `${now.toISOString().replace(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}`;
  const urls: Array<{ name: string; url: string }> = [];
  for (const [i, img] of images.entries()) {
    const file = `${FEEDBACK_ASSETS_DIR}/${stamp}-${i + 1}.${img.ext}`;
    await api(gh, 'PUT', `repos/${UPDATE_REPO}/contents/${file}`, {
      message: `feedback: add ${file}`,
      content: img.base64,
      branch: FEEDBACK_ASSETS_BRANCH,
    });
    urls.push({
      name: img.name,
      url: `https://raw.githubusercontent.com/${UPDATE_REPO}/${FEEDBACK_ASSETS_BRANCH}/${file}`,
    });
  }
  return urls;
}

async function labelExists(gh: GhRunner): Promise<boolean> {
  try {
    await api(gh, 'GET', `repos/${UPDATE_REPO}/labels/${FEEDBACK_LABEL}`);
    return true;
  } catch {
    return false; // Missing label (or no access): send the issue without it.
  }
}

export interface SubmitFeedbackOptions {
  /** The connection has the server token (CLAUDE.md: privileged messages). */
  privileged: boolean;
  env: FeedbackEnvironment;
  gh?: GhRunner;
  now?: () => Date;
}

/** Handle one submitFeedback message. Never throws. */
export async function submitFeedback(
  msg: Record<string, unknown>,
  { privileged, env, gh = runGh, now = () => new Date() }: SubmitFeedbackOptions,
): Promise<FeedbackResult> {
  const input = validateFeedback(msg);
  if (typeof input === 'string') return { type: 'feedbackResult', status: 'error', error: input };
  const fallback = (error: string): FeedbackResult => ({
    type: 'feedbackResult',
    status: 'fallback',
    url: fallbackIssueUrl(input.title, input.description, env, input.images.length),
    error,
  });
  if (!privileged) {
    return fallback('This page has no edit rights (open the tokened URL), so gh was not used.');
  }
  const auth = await gh(['auth', 'status', '--hostname', 'github.com']);
  if (auth.code !== 0) {
    return fallback(
      auth.code === -1 && /ENOENT/.test(auth.stderr)
        ? 'The GitHub CLI (gh) is not installed.'
        : 'The GitHub CLI (gh) is not logged in (run: gh auth login).',
    );
  }
  try {
    const images = input.images.length ? await uploadImages(gh, input.images, now()) : [];
    const labels = (await labelExists(gh)) ? [FEEDBACK_LABEL] : [];
    const issue = await api(gh, 'POST', `repos/${UPDATE_REPO}/issues`, {
      title: input.title,
      body: buildIssueBody(input.description, env, images),
      ...(labels.length ? { labels } : {}),
    });
    if (typeof issue.html_url !== 'string') throw new GhError('GitHub returned no issue URL.');
    return { type: 'feedbackResult', status: 'created', url: issue.html_url };
  } catch (e) {
    return fallback(`gh failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Where the app runs, for the issue's environment block. */
export function feedbackEnvironment(
  host: FeedbackEnvironment['host'],
  vscodeVersion?: string,
): FeedbackEnvironment {
  return {
    version: process.env.PIXEL_AGENTS_VERSION ?? '',
    host,
    os: `${process.platform} ${os.release()} (${process.arch})`,
    node: process.version,
    ...(vscodeVersion ? { vscodeVersion } : {}),
  };
}
