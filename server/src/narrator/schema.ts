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
  /** Input lines, oldest first ("Мурка → Барсик: проверь тесты"). */
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
  'Ты рассказчик в игре-офисе, где коты-агенты пишут код.',
  'На входе: блоки "conversationId=<id>" и под каждым строки событий разговора.',
  'Для каждого блока дай одно краткое резюме на русском: кто что попросил или ответил.',
  `Резюме не длиннее ${NARRATOR_SUMMARY_MAX_CHARS} символов, одно-два предложения, настоящее или прошедшее время.`,
  'Упоминай только факты из строк этого блока. Не придумывай результаты, файлы, числа, сохранения, коммиты или успехи.',
  'Не пиши команды, пути, флаги и код. Без эмодзи и галочек.',
  'Верни JSON по схеме: {"summaries":[{"conversationId":"<id>","summary":"<текст>"}]}. Один элемент на каждый conversationId.',
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
  { claim: /сохран|записал|записан/, evidence: /сохран|запис|save|writ/ },
  { claim: /коммит|закоммит/, evidence: /коммит|commit/ },
  { claim: /запуш|отправил изменен/, evidence: /пуш|push/ },
  { claim: /смерж|слил|слия|мерж/, evidence: /мерж|слия|слил|merge/ },
  { claim: /тест/, evidence: /тест|test|spec/ },
  {
    claim: /прош[её]л|прошли|зел[её]н|успешн|удач/,
    evidence: /прош|pass|green|успеш|success|ok\b|удач/,
  },
  { claim: /упал|упали|провал|сломал|ошибк/, evidence: /упал|fail|провал|слом|ошиб|error|broke/ },
  { claim: /исправ|почин|пофикс/, evidence: /исправ|почин|fix/ },
  {
    claim: /готов|заверш|закончил|сделал|выполнил/,
    evidence: /готов|заверш|законч|сдела|выполн|done|finish|complet|result|результ/,
  },
  { claim: /удалил|удал[её]н/, evidence: /удал|delet|remov/ },
  { claim: /созда/, evidence: /созда|creat|add|нов/ },
];

const CHECKMARK_RE = /[✓✔✅☑]/;
const NUMBER_RE = /\d+(?:[.,]\d+)?/g;
const FILE_RE = /[\w-]+\.[a-z]{1,5}\b/gi;
const CYRILLIC_RE = /[а-яё]/i;

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
 * left. Cuts to NARRATOR_SUMMARY_MAX_CHARS with an ellipsis.
 */
export function filterSummary(summary: string, sourceLines: string[]): string {
  const source = sourceLines.join('\n').toLowerCase();
  const sentences = summary.split(/(?<=[.!?…])\s+/);
  const kept = sentences
    .map((x) => x.trim())
    .filter((x) => x && isSupported(x, source))
    .join(' ');
  if (!kept || !CYRILLIC_RE.test(kept)) return '';
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
