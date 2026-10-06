/**
 * The Cat CEO output contract (docs/catavasia/cat-ceo-judge.md §6): the JSON
 * schema passed to `claude -p --json-schema`, and the server check of the
 * `structured_output` it returns. The CLI treats the schema as a shape hint,
 * so every rule is checked again here before anything touches a prompt file.
 */

export type Verdict = 'pass' | 'concerns' | 'fail';
export type Severity = 'low' | 'medium' | 'high';
export type EditOp = 'add' | 'replace' | 'remove';
export type Section = 'Rules' | 'Lessons';

export const ANOMALY_KINDS = [
  'needed_nudge',
  'auto_report',
  'failed_turn',
  'timeout',
  'merge_conflict',
  'out_of_scope_edit',
  'no_tests_run',
  'false_claim',
  'rework',
  'ask_unanswered',
  'excessive_turns',
  'excessive_cost',
  'auto_compacted',
  'office_tool_misuse',
  'other',
] as const;

export interface JudgeScore {
  catId: string;
  assignmentId: string;
  score: number;
  criteria?: Partial<
    Record<'goalFit' | 'verification' | 'protocol' | 'scope' | 'efficiency', number>
  >;
  bubble: string;
  evidence?: string[];
}

export interface JudgeAnomaly {
  id: string;
  catId: string;
  kind: (typeof ANOMALY_KINDS)[number];
  severity: Severity;
  evidence: string;
}

export interface JudgeEdit {
  catId: string;
  section: Section;
  op: EditOp;
  itemId?: string;
  text?: string;
  reason: string;
  anomalyIds: string[];
}

export interface JudgeOutput {
  verdict: Verdict;
  summary: string;
  scores: JudgeScore[];
  anomalies: JudgeAnomaly[];
  edits: JudgeEdit[];
}

const int = { type: 'integer' };

export const JUDGE_SCHEMA = {
  type: 'object',
  required: ['verdict', 'summary', 'scores', 'anomalies', 'edits'],
  properties: {
    verdict: { enum: ['pass', 'concerns', 'fail'] },
    summary: { type: 'string', maxLength: 300 },
    scores: {
      type: 'array',
      items: {
        type: 'object',
        required: ['catId', 'assignmentId', 'score', 'criteria', 'bubble'],
        properties: {
          catId: { type: 'string' },
          assignmentId: { type: 'string', description: '"root" for the lead\'s own work' },
          score: { type: 'integer', minimum: 0, maximum: 100 },
          criteria: {
            type: 'object',
            properties: {
              goalFit: int,
              verification: int,
              protocol: int,
              scope: int,
              efficiency: int,
            },
          },
          bubble: { type: 'string', maxLength: 40 },
          evidence: { type: 'array', items: { type: 'string', maxLength: 200 } },
        },
      },
    },
    anomalies: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'catId', 'kind', 'severity', 'evidence'],
        properties: {
          id: { type: 'string' },
          catId: { type: 'string' },
          kind: { enum: ANOMALY_KINDS },
          severity: { enum: ['low', 'medium', 'high'] },
          evidence: { type: 'string', maxLength: 400 },
        },
      },
    },
    edits: {
      type: 'array',
      items: {
        type: 'object',
        required: ['catId', 'section', 'op', 'reason', 'anomalyIds'],
        properties: {
          catId: { type: 'string' },
          section: { enum: ['Rules', 'Lessons'] },
          op: { enum: ['add', 'replace', 'remove'] },
          itemId: { type: 'string', pattern: '^[RL][0-9]+$' },
          text: { type: 'string', maxLength: 280 },
          reason: { type: 'string', maxLength: 200 },
          anomalyIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
        },
      },
    },
  },
} as const;

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

class ShapeError extends Error {}

function obj(v: unknown, at: string): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ShapeError(`${at}: not an object`);
  return v as Record<string, unknown>;
}

function str(v: unknown, at: string, max?: number): string {
  if (typeof v !== 'string') throw new ShapeError(`${at}: not a string`);
  // The model may overshoot a length cap by a little: cut, do not fail the review.
  return max === undefined ? v : v.slice(0, max);
}

function list(v: unknown, at: string): unknown[] {
  if (!Array.isArray(v)) throw new ShapeError(`${at}: not an array`);
  return v;
}

function oneOf<T extends string>(v: unknown, values: readonly T[], at: string): T {
  if (!values.includes(v as T)) throw new ShapeError(`${at}: "${String(v)}" is not allowed`);
  return v as T;
}

function score(v: unknown, at: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new ShapeError(`${at}: not a number`);
  return Math.max(0, Math.min(100, Math.round(v)));
}

/** Check the judge's structured output. Shape errors fail the review; edit rules are promptPatch's. */
export function parseJudgeOutput(raw: unknown): Result<JudgeOutput> {
  try {
    const o = obj(raw, 'output');
    const out: JudgeOutput = {
      verdict: oneOf(o.verdict, ['pass', 'concerns', 'fail'], 'verdict'),
      summary: str(o.summary, 'summary', 300),
      scores: list(o.scores, 'scores').map((s, i) => {
        const r = obj(s, `scores[${i}]`);
        const criteria = r.criteria === undefined ? undefined : obj(r.criteria, 'criteria');
        return {
          catId: str(r.catId, `scores[${i}].catId`),
          assignmentId: str(r.assignmentId, `scores[${i}].assignmentId`),
          score: score(r.score, `scores[${i}].score`),
          ...(criteria ? { criteria: criteria as JudgeScore['criteria'] } : {}),
          bubble: str(r.bubble, `scores[${i}].bubble`, 40),
          ...(r.evidence !== undefined
            ? { evidence: list(r.evidence, 'evidence').map((e) => str(e, 'evidence', 200)) }
            : {}),
        };
      }),
      anomalies: list(o.anomalies, 'anomalies').map((a, i) => {
        const r = obj(a, `anomalies[${i}]`);
        return {
          id: str(r.id, `anomalies[${i}].id`),
          catId: str(r.catId, `anomalies[${i}].catId`),
          kind: oneOf(r.kind, ANOMALY_KINDS, `anomalies[${i}].kind`),
          severity: oneOf(r.severity, ['low', 'medium', 'high'], `anomalies[${i}].severity`),
          evidence: str(r.evidence, `anomalies[${i}].evidence`, 400),
        };
      }),
      edits: list(o.edits, 'edits').map((e, i) => {
        const r = obj(e, `edits[${i}]`);
        return {
          catId: str(r.catId, `edits[${i}].catId`),
          section: oneOf(r.section, ['Rules', 'Lessons'], `edits[${i}].section`),
          op: oneOf(r.op, ['add', 'replace', 'remove'], `edits[${i}].op`),
          ...(r.itemId !== undefined ? { itemId: str(r.itemId, `edits[${i}].itemId`) } : {}),
          // No cut here: an over-long item is refused by the patch check, not shortened.
          ...(r.text !== undefined ? { text: str(r.text, `edits[${i}].text`) } : {}),
          reason: str(r.reason, `edits[${i}].reason`, 200),
          anomalyIds: list(r.anomalyIds, `edits[${i}].anomalyIds`).map((x) => str(x, 'anomalyId')),
        };
      }),
    };
    return { ok: true, value: out };
  } catch (err) {
    if (err instanceof ShapeError) return { ok: false, error: err.message };
    throw err;
  }
}
