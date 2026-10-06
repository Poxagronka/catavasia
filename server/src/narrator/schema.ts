/**
 * Haiku summary contract: the JSON schema passed to `--json-schema`, the
 * static system prompt, the batch prompt, and the server-side validator.
 *
 * The validator is the trust boundary. Haiku invented a "file saved" line in
 * research (orchestration-spec.md, section C), so every sentence of a summary
 * must be supported by the input lines of its conversation, or it is dropped.
 */

import { NARRATOR_SUMMARY_MAX_CHARS } from '../../../core/src/narrator.js';

/** One conversation queued for a summary. */
export interface SummaryItem {
  conversationId: string;
  catIds: number[];
  /** Input lines, oldest first ("Mochi → Leo: check the tests"). */
  lines: string[];
}

export const SUMMARY_JSON_SCHEMA = {
  type: 'object',
  properties: {
    summaries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          conversationId: { type: 'string' },
          summary: { type: 'string' },
        },
        required: ['conversationId', 'summary'],
        additionalProperties: false,
      },
    },
  },
  required: ['summaries'],
  additionalProperties: false,
} as const;

/**
 * Static, byte-identical on every call so the prompt prefix can cache.
 * Never interpolate run data here: data goes into the user prompt.
 */
export const SUMMARY_SYSTEM_PROMPT = [
  'You narrate an office game where cat agents write code.',
  'Input: blocks "conversationId=<id>", each followed by the event lines of one conversation.',
  'For each block write one short summary in English: who asked or answered what.',
  `Each summary is at most ${NARRATOR_SUMMARY_MAX_CHARS} characters, one or two sentences, present or past tense.`,
  'Mention only facts from the lines of that block. Do not invent results, files, numbers, saves, commits or successes.',
  'Do not write file names, commands, paths, flags or code. No emoji and no checkmarks.',
  'A light, playful cat tone is fine, but every summary stays factual.',
  'Return JSON by the schema: {"summaries":[{"conversationId":"<id>","summary":"<text>"}]}. One item per conversationId.',
].join('\n');

/** The per-batch user prompt: compact lines grouped by conversation. */
export function buildSummaryPrompt(items: SummaryItem[]): string {
  return items
    .map((it) => [`conversationId=${it.conversationId}`, ...it.lines].join('\n'))
    .join('\n\n');
}

// ── Claim checks ──

/**
 * A claim word in a summary needs an evidence word in the input lines.
 * Stems are lower-case and match anywhere in a word.
 */
const CLAIMS: Array<{ claim: RegExp; evidence: RegExp }> = [
  { claim: /\bsav(e|ed|es|ing)\b|\bwr(ote|itten)\b/, evidence: /sav|writ|wrote/ },
  { claim: /commit/, evidence: /commit/ },
  { claim: /\bpush/, evidence: /push/ },
  { claim: /merg/, evidence: /merg/ },
  { claim: /test/, evidence: /test|spec/ },
  { claim: /\bpass(ed|es|ing)?\b|\bgreen\b|succe/, evidence: /pass|green|succe|\bok\b/ },
  { claim: /\bfail|\bbr(oke|oken|eak)|\berror|\bcrash/, evidence: /fail|brok|break|error|crash/ },
  { claim: /\bfix/, evidence: /fix/ },
  {
    claim: /\bdone\b|finish|complet|\bready\b/,
    evidence: /\bdone\b|finish|complet|ready|result/,
  },
  { claim: /delet|remov/, evidence: /delet|remov/ },
  { claim: /creat|\badd(ed|s)?\b/, evidence: /creat|\badd|\bnew\b/ },
  { claim: /deploy|releas|\bship(ped|s)?\b/, evidence: /deploy|releas|\bship/ },
];

const CHECKMARK_RE = /[✓✔✅☑]/;
const NUMBER_RE = /\d+(?:[.,]\d+)?/g;
const FILE_RE = /[\w-]+\.[a-z]{1,5}\b/gi;
const LATIN_RE = /[a-z]/i;
/** Any letter outside the Latin script (Cyrillic, CJK, ...). */
const NON_LATIN_RE = /(?!\p{Script=Latin})\p{L}/u;

/** True when every claim, number and file name in the sentence is in the source. */
function isSupported(sentence: string, source: string): boolean {
  const s = sentence.toLowerCase();
  if (CHECKMARK_RE.test(s)) return false;
  for (const { claim, evidence } of CLAIMS) {
    if (claim.test(s) && !evidence.test(source)) return false;
  }
  for (const n of s.match(NUMBER_RE) ?? []) if (!source.includes(n)) return false;
  for (const f of s.match(FILE_RE) ?? []) if (!source.includes(f.toLowerCase())) return false;
  return true;
}

/**
 * Keep only the supported sentences of a summary. Returns '' when nothing is
 * left or the text is not English. Cuts to NARRATOR_SUMMARY_MAX_CHARS with an ellipsis.
 */
export function filterSummary(summary: string, sourceLines: string[]): string {
  const source = sourceLines.join('\n').toLowerCase();
  const sentences = summary.split(/(?<=[.!?…])\s+/);
  const kept = sentences
    .map((x) => x.trim())
    .filter((x) => x && isSupported(x, source))
    .join(' ');
  if (!kept || !LATIN_RE.test(kept) || NON_LATIN_RE.test(kept)) return '';
  return kept.length > NARRATOR_SUMMARY_MAX_CHARS
    ? `${kept.slice(0, NARRATOR_SUMMARY_MAX_CHARS - 1)}…`
    : kept;
}

/** Validated summary, ready to broadcast. */
export interface ValidSummary {
  conversationId: string;
  catIds: number[];
  summary: string;
}

/**
 * Parse the `claude -p --output-format json` stdout and validate it against the
 * schema and the batch. Throws on output that is not the expected envelope.
 * Drops entries for unknown or repeated conversations and unsupported claims.
 */
export function parseSummaryOutput(stdout: string, batch: SummaryItem[]): ValidSummary[] {
  const envelope = JSON.parse(stdout) as Record<string, unknown>;
  if (envelope.is_error === true)
    throw new Error(`claude reported an error: ${String(envelope.result)}`);
  let data = envelope.structured_output;
  if (data === undefined && typeof envelope.result === 'string') data = JSON.parse(envelope.result);
  const list = (data as { summaries?: unknown } | null)?.summaries;
  if (!Array.isArray(list)) throw new Error('Summary output has no summaries array');

  const byId = new Map(batch.map((it) => [it.conversationId, it]));
  const out: ValidSummary[] = [];
  for (const entry of list as Array<Record<string, unknown>>) {
    if (typeof entry?.conversationId !== 'string' || typeof entry.summary !== 'string') continue;
    const item = byId.get(entry.conversationId);
    if (!item) continue;
    byId.delete(entry.conversationId);
    const summary = filterSummary(entry.summary, item.lines);
    if (summary) out.push({ conversationId: item.conversationId, catIds: item.catIds, summary });
  }
  return out;
}
