/**
 * The text of a feedback issue: the user's description, the images as
 * markdown, and an environment block. Pure, so tests cover every branch.
 */

import { FEEDBACK_LABEL, FEEDBACK_URL_MAX_CHARS } from '../constants.js';
import { UPDATE_REPO } from '../update/updateChecker.js';

/** Where the app runs. The adapter or the CLI fills it in. */
export interface FeedbackEnvironment {
  version: string;
  host: 'VS Code extension' | 'standalone CLI';
  /** `process.platform`, `os.release()` and `process.arch`. */
  os: string;
  node: string;
  /** Only in the VS Code extension (`vscode.version`). */
  vscodeVersion?: string;
}

export function environmentBlock(env: FeedbackEnvironment): string {
  const rows = [
    `- catavasia: ${env.version || 'unknown'}`,
    `- host: ${env.host}`,
    `- OS: ${env.os}`,
    `- Node: ${env.node}`,
    ...(env.vscodeVersion ? [`- VS Code: ${env.vscodeVersion}`] : []),
  ];
  return `### Environment\n\n${rows.join('\n')}`;
}

/** Markdown image links, one per line. */
export function imageMarkdown(images: Array<{ name: string; url: string }>): string {
  return images.map((img, i) => `![${altText(img.name, i)}](${img.url})`).join('\n');
}

/** Alt text without the characters that end a markdown link label. */
function altText(name: string, index: number): string {
  return name.replace(/[[\]\n\r]/g, ' ').trim() || `image ${index + 1}`;
}

export function buildIssueBody(
  description: string,
  env: FeedbackEnvironment,
  images: Array<{ name: string; url: string }> = [],
): string {
  const parts = [description.trim() || '_No description._'];
  if (images.length) parts.push(`### Screenshots\n\n${imageMarkdown(images)}`);
  parts.push(environmentBlock(env));
  return parts.join('\n\n') + '\n\n_Sent from the catavasia Feedback button._\n';
}

const TRUNCATED = '\n\n…(truncated, the description was too long for a link)';

function newIssueUrl(title: string, body: string): string {
  const q = new URLSearchParams({ title, body, labels: FEEDBACK_LABEL });
  return `https://github.com/${UPDATE_REPO}/issues/new?${q.toString()}`;
}

/**
 * The prefilled new-issue form, at most `max` characters. A long description
 * is cut, and the environment block stays.
 */
export function fallbackIssueUrl(
  title: string,
  description: string,
  env: FeedbackEnvironment,
  imageCount: number,
  max = FEEDBACK_URL_MAX_CHARS,
): string {
  const note = imageCount
    ? `\n\n_${imageCount} image(s) to paste here: the first is on the clipboard when the browser allowed it._`
    : '';
  const body = (text: string) => buildIssueBody(text + note, env);
  const url = newIssueUrl(title, body(description));
  if (url.length <= max) return url;
  // Binary search for the longest description prefix that fits.
  let lo = 0;
  let hi = description.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (newIssueUrl(title, body(description.slice(0, mid) + TRUNCATED)).length <= max) lo = mid;
    else hi = mid - 1;
  }
  // The title is at most FEEDBACK_TITLE_MAX_CHARS, so an empty description always fits.
  return newIssueUrl(title, body(description.slice(0, lo) + TRUNCATED));
}
