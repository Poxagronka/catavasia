/**
 * The review digest (cat-ceo-judge.md §5.1): one user message that holds
 * everything the Cat CEO may know about a finished task. Server-built from
 * the task record, the event log, the worker branch diffs, the prompt files
 * and the bounded history. Every part has its own cap; the whole is capped
 * at 60,000 chars, and every secret-like run is redacted.
 */

import type { TaskLogEntry } from '../../../core/src/tasks.js';
import { CAT_CEO_DIGEST_MAX_CHARS } from '../constants.js';
import type { LoggedEvent } from '../orchestrator/machine/eventLog.js';
import type { TaskState } from '../orchestrator/machine/types.js';
import type { PromptFile } from '../orchestrator/promptFile.js';
import { redact } from './secretScan.js';

export interface DigestTask {
  id: string;
  title: string;
  prompt: string;
  target?: string;
  status: string;
  result?: string;
  error?: string;
  numTurns?: number;
  costUsd?: number;
  createdAt: number;
  finishedAt?: number;
  log: TaskLogEntry[];
  diff?: string;
}

export interface BranchDiff {
  catId: string;
  branch: string;
  stat: string;
  body: string;
}

export interface CatHistory {
  scores: Array<{ taskId: string; score: number; verdict: string }>;
  commits: Array<{ sha: string; author: string; subject: string; flag?: string }>;
}

export interface DigestInput {
  task: DigestTask;
  state: TaskState;
  events: LoggedEvent[];
  branchDiffs: BranchDiff[];
  prompts: Record<string, PromptFile>;
  history: Record<string, CatHistory>;
  /** Exact strings to redact too. */
  secrets?: string[];
}

const CAPS = {
  task: 4000,
  plan: 2000,
  assignment: 2000,
  diffs: 25_000,
  signals: 6000,
  tests: 4000,
  excerpts: 6000,
  prompts: 8000,
  history: 3000,
  role: 1000,
  excerpt: 200,
};

const TEST_CMD = /\b(test|vitest|jest|pytest|lint|typecheck|tsc|build)\b/;

/** `text` cut to `cap` chars; a cut ends with `…[cut N chars]`. */
export function cut(text: string, cap: number): string {
  if (text.length <= cap) return text;
  const note = (n: number) => `…[cut ${n} chars]`;
  const keep = Math.max(0, cap - note(text.length).length);
  return text.slice(0, keep) + note(text.length - keep);
}

const short = (sha?: string) => (sha ? sha.slice(0, 12) : 'none');

function taskPart(t: DigestTask, s: TaskState): string {
  const wall = t.finishedAt ? `${Math.round((t.finishedAt - t.createdAt) / 1000)} s` : 'unknown';
  const outcome = s.phase === 'done' ? `Result:\n${t.result ?? ''}` : `Error:\n${t.error ?? ''}`;
  return cut(
    [
      `Task ${t.id} "${t.title}"`,
      `Target: ${t.target ?? 'team'}, lead (root): ${s.rootId}, final state: ${s.phase}`,
      `Turns: ${s.turns}, cost: $${s.costUsd.toFixed(2)}, wall time: ${wall}`,
      `User prompt:\n${t.prompt}`,
      outcome,
    ].join('\n'),
    CAPS.task,
  );
}

function assignmentsPart(s: TaskState): string {
  if (!s.assignments.length) return 'No delegation: the lead did the task alone.';
  return s.assignments
    .map((a) =>
      cut(
        [
          `- ${a.id}: ${a.parent} -> ${a.child}, end state ${a.state}` +
            `${a.failed ? ' (failure report)' : ''}${a.reworkOf ? `, reworks ${a.reworkOf}` : ''}` +
            `, promptSha ${short(a.promptSha)}`,
          `  Goal: ${a.goal}`,
          `  Report: ${a.report ?? '(none)'}`,
        ].join('\n'),
        CAPS.assignment,
      ),
    )
    .join('\n');
}

/** Branch diffs share the cap by their changed-line count. */
function diffsPart(diffs: BranchDiff[], taskDiff: string | undefined): string {
  const parts = [
    ...diffs.map((d) => ({ head: `### ${d.branch} (${d.catId})\n${d.stat}`, body: d.body })),
    ...(taskDiff ? [{ head: '### Task diff (merged result)', body: taskDiff }] : []),
  ];
  if (!parts.length) return 'No diffs (no git repo, or nothing changed).';
  const lines = (b: string) => Math.max(1, b.split('\n').length);
  const total = parts.reduce((n, p) => n + lines(p.body), 0);
  return parts
    .map((p) => {
      const share = Math.floor((CAPS.diffs * lines(p.body)) / total);
      return `${p.head}\n${cut(p.body, Math.max(400, share - p.head.length))}`;
    })
    .join('\n\n');
}

function catOfName(s: TaskState, name: string): string {
  return s.cats.find((c) => c.name === name)?.id ?? name;
}

/** Anomaly signals from the event log and the office messages of the task log. */
function signalsPart(input: DigestInput): string {
  const { state: s, events, task } = input;
  const out: string[] = [];
  const turnCat = new Map<string, string>();
  for (const { event: e } of events) {
    switch (e.type) {
      case 'TurnGranted':
        turnCat.set(e.turnId, e.catId);
        break;
      case 'TurnFinished':
        if (!e.result.ok) out.push(`failed turn: ${e.catId}: ${e.result.error ?? 'error'}`);
        break;
      case 'TimerFired':
        if (e.id.startsWith('turn:')) out.push(`timeout: ${turnCat.get(e.id.slice(5)) ?? '?'}`);
        break;
      case 'MergeFinished':
        for (const r of e.results) {
          if (!r.outcome.ok && r.outcome.conflicts.length) {
            out.push(
              `merge conflict: ${r.childId}'s branch into ${e.catId}: ${r.outcome.conflicts.join(', ')}`,
            );
          }
        }
        if (e.error) out.push(`merge error in ${e.catId}: ${e.error}`);
        break;
      case 'ToolCalled':
        if (e.name === 'delegate' && e.args.rework === true) {
          out.push(`rework: ${e.catId} sent work back to ${String(e.args.to)}`);
        }
        break;
      case 'CompactHappened':
        out.push(`auto-compaction: ${e.catId} (${e.trigger}, ${e.preTokens ?? '?'} tokens)`);
        break;
      case 'OfficeFailed':
        out.push(`office error: ${e.error}`);
        break;
    }
  }
  for (const entry of task.log) {
    if (entry.kind === 'message' && entry.name?.startsWith('office ->')) {
      out.push(`office message ${entry.name}: ${cut(entry.text, 160)}`);
    }
    if (entry.kind === 'error') out.push(`error (${entry.name ?? '?'}): ${cut(entry.text, 160)}`);
  }
  for (const m of Object.values(s.members)) {
    if (m.askedBy.length)
      out.push(`unanswered ask: ${m.catId} never replied to ${m.askedBy.join(', ')}`);
  }
  return out.length ? cut(out.join('\n'), CAPS.signals) : 'No anomaly signals.';
}

/** Bash calls that look like tests, lint or a build (the result of the call is not recorded). */
function testsPart(input: DigestInput): string {
  const runs = input.task.log
    .filter((e) => e.kind === 'tool' && e.name?.endsWith(': Bash') && TEST_CMD.test(e.text))
    .map(
      (e) => `- ${catOfName(input.state, e.name!.slice(0, -': Bash'.length))}: ${cut(e.text, 200)}`,
    );
  return runs.length ? cut(runs.join('\n'), CAPS.tests) : 'No test, lint or build command ran.';
}

function excerptsPart(input: DigestInput): string {
  const byCat = new Map<string, string[]>();
  for (const e of input.task.log) {
    if (e.kind !== 'text' || !e.name) continue;
    const catId = catOfName(input.state, e.name);
    const text = e.text.replace(/\s+/g, ' ').trim();
    byCat.set(catId, [...(byCat.get(catId) ?? []), text.slice(-CAPS.excerpt)]);
  }
  if (!byCat.size) return 'No assistant text.';
  const per = Math.floor(CAPS.excerpts / byCat.size);
  return [...byCat]
    .map(([catId, texts]) => cut(`${catId}:\n${texts.map((t) => `- ${t}`).join('\n')}`, per))
    .join('\n');
}

function promptsPart(prompts: Record<string, PromptFile>): string {
  const per = Math.floor(CAPS.prompts / Math.max(1, Object.keys(prompts).length));
  return Object.entries(prompts)
    .map(([catId, f]) => {
      const items = (xs: PromptFile['rules']) =>
        xs.length ? xs.map((i) => `- [${i.id}] ${i.text}`).join('\n') : '(none)';
      return cut(
        [
          `### ${catId}`,
          `Role & conduct (read-only, never edit): ${cut(f.role, CAPS.role)}`,
          `Rules:\n${items(f.rules)}`,
          `Lessons:\n${items(f.lessons)}`,
        ].join('\n'),
        per,
      );
    })
    .join('\n\n');
}

function historyPart(history: Record<string, CatHistory>): string {
  const rows = Object.entries(history).map(([catId, h]) => {
    const scores = h.scores.map((x) => `${x.taskId}: ${x.score} (${x.verdict})`).join('; ');
    const commits = h.commits
      .map((c) => `${short(c.sha)} ${c.author}: ${c.subject}${c.flag ? ` [${c.flag}]` : ''}`)
      .join('; ');
    return `- ${catId}: last scores: ${scores || 'none'}. Last prompt commits: ${commits || 'none'}.`;
  });
  return rows.length ? cut(rows.join('\n'), CAPS.history) : 'No history yet.';
}

export function buildDigest(input: DigestInput): string {
  const { task, state } = input;
  const text = [
    '# Review this finished team task',
    `## Task\n${taskPart(task, state)}`,
    `## Plan (the lead's brief)\n${cut(state.brief ?? '(no brief)', CAPS.plan)}`,
    `## Assignments\n${assignmentsPart(state)}`,
    `## Diffs\n${diffsPart(input.branchDiffs, task.diff)}`,
    `## Anomaly signals\n${signalsPart(input)}`,
    `## Tests run\n${testsPart(input)}`,
    `## Transcript excerpts\n${excerptsPart(input)}`,
    `## Prompt files\n${promptsPart(input.prompts)}`,
    `## History\n${historyPart(input.history)}`,
  ].join('\n\n');
  return cut(redact(text, input.secrets), CAT_CEO_DIGEST_MAX_CHARS);
}
