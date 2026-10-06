/**
 * Input of a Cat CEO tidy (cat-ceo-judge.md §14.2): the history of every
 * Rules and Lessons item from the prompts repo (who added it, when, from
 * which review, who edited it), its use in later reviews, and the cat's
 * recent review summaries. Everything is redacted like the review digest.
 */

import type { PromptAuthor } from '../../../core/src/messages.js';
import {
  CAT_CEO_TIDY_LOG_MAX,
  CAT_CEO_TIDY_SUMMARIES,
  PROMPT_LESSONS_MAX,
  PROMPT_RULES_MAX,
} from '../constants.js';
import { parsePromptFile, type PromptFile } from '../orchestrator/promptFile.js';
import { authorOf } from './regressionGuard.js';
import { cut } from './reviewDigest.js';
import type { ReviewRecord } from './reviewStore.js';
import { redact } from './secretScan.js';

export interface ItemMeta {
  /** `user`: the user added or changed the item (protected by default). */
  owner: 'user' | 'cat-ceo';
  addedBy: PromptAuthor;
  /** Undefined: the item is older than the commits read. */
  addedAt?: number;
  reviewId?: string;
  taskId?: string;
  /** Anomaly kinds of the review that added it. */
  kinds: string[];
  editedBy?: PromptAuthor;
  editedAt?: number;
}

interface HistoryRepo {
  log(catId: string): Array<{ sha: string; at: number; subject: string; body: string }>;
  textAt(catId: string, sha: string): string | undefined;
}

/** Item id -> history, from the newest CAT_CEO_TIDY_LOG_MAX commits of the cat's file. */
export function itemHistory(catId: string, repo: HistoryRepo): Map<string, ItemMeta> {
  const log = repo.log(catId);
  const window = log.slice(0, CAT_CEO_TIDY_LOG_MAX).reverse();
  const truncated = log.length > window.length;
  const meta = new Map<string, ItemMeta>();
  const lastText = new Map<string, string>();
  window.forEach((c, i) => {
    const text = repo.textAt(catId, c.sha);
    const parsed = text === undefined ? undefined : parsePromptFile(text);
    if (!parsed?.ok) return;
    const author = authorOf(c.subject);
    for (const item of [...parsed.value.rules, ...parsed.value.lessons]) {
      const seen = meta.get(item.id);
      if (!seen) {
        const older = truncated && i === 0;
        meta.set(item.id, {
          // Only an item the Cat CEO itself wrote is its own; the guard restores old text.
          owner: author === 'cat-ceo' && !older ? 'cat-ceo' : 'user',
          addedBy: author,
          ...(older ? {} : { addedAt: c.at }),
          ...trailer(c.body, /^Prompt-Review: (\S+)/m, 'reviewId'),
          ...trailer(c.body, /^Task: (\S+)/m, 'taskId'),
          kinds: /^Anomalies: (.+)$/m.exec(c.body)?.[1].split(', ') ?? [],
        });
      } else if (lastText.get(item.id) !== item.text) {
        seen.editedBy = author;
        seen.editedAt = c.at;
        if (author !== 'cat-ceo') seen.owner = 'user';
      }
      lastText.set(item.id, item.text);
    }
  });
  return meta;
}

function trailer(body: string, re: RegExp, key: 'reviewId' | 'taskId') {
  const hit = re.exec(body)?.[1];
  return hit ? { [key]: hit } : {};
}

const day = (ms: number | undefined) =>
  ms === undefined ? 'before the history' : new Date(ms).toISOString().slice(0, 10);

const mean = (xs: number[]) =>
  xs.length ? String(Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)) : '–';

/** The meta of an item; an item with no history counts as the user's. */
export function metaOf(meta: Map<string, ItemMeta>, id: string): ItemMeta {
  return meta.get(id) ?? { owner: 'user', addedBy: 'user', kinds: [] };
}

/** The tidy digest: Role as context, the cat's score trend and reviews, every item with its history. */
export function buildTidyDigest(input: {
  catId: string;
  file: PromptFile;
  meta: Map<string, ItemMeta>;
  reviews: readonly ReviewRecord[];
}): string {
  const { catId, file, meta } = input;
  const reviews = input.reviews.filter((r) => r.scores.some((s) => s.catId === catId));
  const scoresOf = (rs: ReviewRecord[]) =>
    rs.flatMap((r) => r.scores.filter((s) => s.catId === catId).map((s) => s.score));
  const itemLine = (id: string, text: string) => {
    const m = metaOf(meta, id);
    const later = reviews.filter((r) => m.addedAt !== undefined && r.at > m.addedAt);
    const before = reviews.filter((r) => m.addedAt === undefined || r.at <= m.addedAt);
    const mine = later.flatMap((r) => r.anomalies.filter((a) => a.catId === catId));
    const cited = mine.filter((a) => new RegExp(`\\b${id}\\b`).test(a.evidence)).length;
    const again = mine.filter((a) => m.kinds.includes(a.kind)).length;
    const facts = [
      `owner: ${m.owner}`,
      `added ${day(m.addedAt)} by ${m.addedBy}`,
      ...(m.taskId ? [`task ${m.taskId}`] : []),
      ...(m.kinds.length ? [`for ${m.kinds.join(', ')}`] : []),
      ...(m.editedBy ? [`edited ${day(m.editedAt)} by ${m.editedBy}`] : []),
      `reviews since ${later.length}`,
      `cited ${cited}`,
      `same anomaly again ${again}`,
      `mean score before ${mean(scoresOf(before.slice(-5)))} -> after ${mean(scoresOf(later.slice(0, 5)))}`,
    ];
    return `- ${id}: ${text}\n  (${facts.join('; ')})`;
  };
  const summaries = reviews
    .slice(-CAT_CEO_TIDY_SUMMARIES)
    .reverse()
    .map((r) => {
      const anomalies = r.anomalies
        .filter((a) => a.catId === catId)
        .map((a) => `${a.kind} (${a.severity}): ${cut(a.evidence, 120)}`);
      return `- ${day(r.at)} task ${r.taskId}, ${r.verdict}, score ${mean(scoresOf([r]))}: ${cut(r.summary, 300)}${
        anomalies.length ? `\n  anomalies: ${anomalies.join(' | ')}` : ''
      }`;
    });
  const text = [
    `# Tidy of cat ${catId}`,
    '',
    '## Role & conduct (read-only context: never edit)',
    cut(file.role, 1000),
    '',
    '## Score trend (oldest first)',
    scoresOf(reviews.slice(-10)).join(', ') || 'No reviews yet.',
    '',
    '## Recent reviews (newest first)',
    summaries.join('\n') || 'No reviews yet.',
    '',
    `## Rules (${file.rules.length} of ${PROMPT_RULES_MAX})`,
    file.rules.map((i) => itemLine(i.id, i.text)).join('\n') || 'None.',
    '',
    `## Lessons (${file.lessons.length} of ${PROMPT_LESSONS_MAX})`,
    file.lessons.map((i) => itemLine(i.id, i.text)).join('\n') || 'None.',
  ].join('\n');
  return redact(text);
}
