/**
 * Cat CEO units (docs/catavasia/cat-ceo-judge.md §5-§8): output schema check,
 * edit validation (locked Role, caps, secrets, dedupe, rate limit), the
 * regression guard on a real prompts repo, the digest caps and redaction,
 * and the judge process (fake `claude` bins).
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { judgeArgs, parseJudgeStdout, runJudge } from '../src/catCeo/judgeRunner.js';
import { type JudgeAnomaly, type JudgeEdit, parseJudgeOutput } from '../src/catCeo/judgeSchema.js';
import { isDuplicate, type PatchContext, planEdits } from '../src/catCeo/promptPatch.js';
import { guardDecision, runGuard } from '../src/catCeo/regressionGuard.js';
import { buildDigest, cut } from '../src/catCeo/reviewDigest.js';
import { ReviewStore } from '../src/catCeo/reviewStore.js';
import { findSecret, redact } from '../src/catCeo/secretScan.js';
import { startTask } from '../src/orchestrator/machine/taskReducer.js';
import type { PromptFile } from '../src/orchestrator/promptFile.js';
import { PromptRepo } from '../src/orchestrator/promptRepo.js';

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-ceo-'));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const VALID = {
  verdict: 'concerns',
  summary: 'murka skipped the tests',
  scores: [
    {
      catId: 'boss',
      assignmentId: 'root',
      score: 80,
      criteria: { goalFit: 90 },
      bubble: 'solid lead',
    },
    { catId: 'murka', assignmentId: 'a1', score: 55, criteria: {}, bubble: 'forgot the tests' },
  ],
  anomalies: [
    { id: 'x1', catId: 'murka', kind: 'no_tests_run', severity: 'medium', evidence: 'no npm test' },
    { id: 'x2', catId: 'murka', kind: 'other', severity: 'low', evidence: 'chatty' },
  ],
  edits: [
    {
      catId: 'murka',
      section: 'Rules',
      op: 'add',
      text: 'Run the tests before you report.',
      reason: 'no tests ran',
      anomalyIds: ['x1'],
    },
  ],
};

describe('judge output schema', () => {
  it('accepts a valid output and cuts over-long display text', () => {
    const long = { ...VALID, summary: 's'.repeat(400) };
    const parsed = parseJudgeOutput(long);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.summary).toHaveLength(300);
  });

  it.each([
    ['a bad verdict', { ...VALID, verdict: 'great' }],
    ['scores not a list', { ...VALID, scores: {} }],
    ['an unknown anomaly kind', { ...VALID, anomalies: [{ ...VALID.anomalies[0], kind: 'lazy' }] }],
    ['an unknown section', { ...VALID, edits: [{ ...VALID.edits[0], section: 'Role & conduct' }] }],
    ['a score that is not a number', { ...VALID, scores: [{ ...VALID.scores[0], score: 'A' }] }],
  ])('refuses %s', (_name, raw) => {
    expect(parseJudgeOutput(raw).ok).toBe(false);
  });
});

const file = (over: Partial<PromptFile> = {}): PromptFile => ({
  role: 'You are Luna.\n\n# not a heading the parser knows',
  rules: [{ id: 'R1', text: 'Keep changes small.' }],
  lessons: [{ id: 'L1', text: 'The webview tests need npm run build:core first.' }],
  ...over,
});

const anomalies: JudgeAnomaly[] = [
  { id: 'x1', catId: 'murka', kind: 'no_tests_run', severity: 'medium', evidence: 'e' },
  { id: 'x2', catId: 'murka', kind: 'other', severity: 'low', evidence: 'e' },
];

function ctx(over: Partial<PatchContext> = {}, files: Record<string, PromptFile> = {}) {
  return {
    taskId: 't1',
    date: '2026-10-06',
    team: ['boss', 'murka'],
    anomalies,
    read: (catId: string) => files[catId] ?? file(),
    commitsLeft: () => 2,
    ...over,
  } satisfies PatchContext;
}

const edit = (over: Partial<JudgeEdit>): JudgeEdit => ({
  catId: 'murka',
  section: 'Rules',
  op: 'add',
  text: 'Run the tests before you report.',
  reason: 'r',
  anomalyIds: ['x1'],
  ...over,
});

describe('edit validation (§7)', () => {
  it('adds with the next id and the task suffix; Role stays byte-identical', () => {
    const { patches, rejected } = planEdits([edit({})], ctx());
    expect(rejected).toEqual([]);
    expect(patches[0].file.rules.at(-1)).toEqual({
      id: 'R2',
      text: 'Run the tests before you report. (task t1, 2026-10-06)',
    });
    expect(patches[0].file.role).toBe(file().role);
  });

  it('replace gives a new id; remove drops the item', () => {
    const { patches } = planEdits(
      [
        edit({ op: 'replace', itemId: 'R1', text: 'Touch only the files of your goal.' }),
        edit({ op: 'remove', section: 'Lessons', itemId: 'L1', text: undefined }),
      ],
      ctx(),
    );
    expect(patches[0].file.rules.map((r) => r.id)).toEqual(['R2']);
    expect(patches[0].file.lessons).toEqual([]);
    expect(patches[0].changes.map((c) => `${c.op} ${c.itemId}`)).toEqual([
      'replace R2',
      'remove L1',
    ]);
  });

  it.each([
    ['a cat outside the team', edit({ catId: 'pushok' }), 'not in this task'],
    ['the Cat CEO itself', edit({ catId: 'cat-ceo' }), 'never edits its own'],
    ['only a low anomaly', edit({ anomalyIds: ['x2'] }), 'medium or high'],
    ['a missing item id', edit({ op: 'remove', itemId: 'R9' }), 'does not exist'],
    ['an item of the other section', edit({ op: 'replace', itemId: 'L1' }), 'not a Rules item'],
    ['two lines', edit({ text: 'a\nb' }), 'more than one line'],
    ['a heading', edit({ text: '# Role & conduct' }), 'starts with #'],
    ['an HTML comment', edit({ text: 'x <!-- y' }), 'HTML comment'],
    ['a code fence', edit({ text: 'run ```npm test```' }), 'code fence'],
    ['an over-long item', edit({ text: 'x'.repeat(270) }), 'longer than 280'],
    ['an Anthropic key', edit({ text: 'Use sk-ant-api03-abcdef to call' }), 'secret'],
    ['a GitHub token', edit({ text: 'Push with ghp_abcdefghijklmnop' }), 'secret'],
    ['a home path', edit({ text: 'Read /Users/someone/notes.txt first' }), 'private path'],
    ['a duplicate idea', edit({ text: 'keep   changes SMALL!' }), 'already an item'],
  ])('refuses %s', (_name, e, reason) => {
    const { patches, rejected } = planEdits([e], ctx());
    expect(patches).toEqual([]);
    expect(rejected[0].reason).toContain(reason);
  });

  it('refuses an add over the Rules cap', () => {
    const rules = Array.from({ length: 12 }, (_, i) => ({
      id: `R${i + 1}`,
      text: `rule number ${i}`,
    }));
    const { rejected } = planEdits([edit({})], ctx({}, { murka: file({ rules }) }));
    expect(rejected[0].reason).toContain('full (12)');
  });

  it('rate limit: no commit left refuses all; at most 3 changes per commit', () => {
    expect(planEdits([edit({})], ctx({ commitsLeft: () => 0 })).rejected[0].reason).toContain(
      'rate limit',
    );
    const four = ['Alpha one.', 'Beta two.', 'Gamma three.', 'Delta four.'].map((text) =>
      edit({ text }),
    );
    const { patches, rejected } = planEdits(four, ctx());
    expect(patches[0].changes).toHaveLength(3);
    expect(rejected.map((r) => r.reason)).toEqual(['rate limit: at most 3 changes per commit']);
  });

  it('dedupe uses token Jaccard >= 0.8', () => {
    const items = [{ id: 'R1', text: 'run the unit tests before you report (task a, 2026-01-01)' }];
    expect(isDuplicate('Run the unit tests before you report!', items)).toBe(true);
    expect(isDuplicate('Write a short summary in the report.', items)).toBe(false);
  });
});

describe('secret scan', () => {
  it('finds and redacts tokens, keys, long hex runs and home paths', () => {
    expect(findSecret('AKIAABCDEFGHIJKLMNOP')).toBeDefined();
    expect(findSecret('a'.repeat(10) + '0123456789abcdef0123456789abcdef')).toBeDefined();
    expect(findSecret('plain words only')).toBeUndefined();
    expect(redact('key sk-ant-xyz and /Users/me/x')).toBe('key [redacted] and [redacted]');
    expect(redact('token tok-123456789', ['tok-123456789'])).toBe('token [redacted]');
  });
});

describe('regression guard (§8)', () => {
  it('decides on the means: revert at -15, watch at -8..-14, wait for data', () => {
    expect(guardDecision([80, 80, 80], [64, 66, 65])).toBe('revert');
    expect(guardDecision([80, 80, 80], [70, 70, 70])).toBe('watch');
    expect(guardDecision([80, 80, 80], [78, 80, 82])).toBe('keep');
    expect(guardDecision([80, 80], [10, 10, 10])).toBe('wait');
    expect(guardDecision([80, 80, 80], [10, 10])).toBe('wait');
  });

  function setup() {
    const repo = new PromptRepo(path.join(tmp, 'prompts'));
    repo.write('murka', file(), 'user(murka): create');
    const v0 = repo.headSha('murka')!;
    const withRule = file({ rules: [...file().rules, { id: 'R2', text: 'Run the tests.' }] });
    repo.write('murka', withRule, 'cat-ceo(murka): add R2', 'Prompt-Edit-By: cat-ceo');
    const c = repo.headSha('murka')!;
    const store = new ReviewStore(path.join(tmp, 'reviews.json'));
    const review = (score: number, sha: string, at: number) =>
      store.add({
        reviewId: `r${at}`,
        taskId: `t${at}`,
        title: 't',
        at,
        verdict: 'pass',
        summary: '',
        scores: [{ catId: 'murka', assignmentId: 'a1', score, bubble: '', promptSha: sha }],
        anomalies: [],
        edits: [],
        rejected: [],
      });
    return { repo, store, v0, c, review };
  }

  it('reverts a Cat CEO commit after a drop of 15 and blocks the cat for 24 h', () => {
    const { repo, store, v0, c, review } = setup();
    [80, 82, 78].forEach((s, i) => review(s, v0, i + 1));
    [60, 62, 61].forEach((s, i) => review(s, c, i + 10));
    const actions = runGuard('murka', repo, store, 100);
    expect(actions).toEqual([{ sha: c, decision: 'revert' }]);
    expect(store.flag(c)).toBe('reverted');
    expect(store.blocked('murka', 101)).toBe(true);
    expect(repo.read('murka').file.rules.map((r) => r.id)).toEqual(['R1']);
    expect(repo.log('murka')[0].subject).toMatch(
      /^guard\(murka\): revert [0-9a-f]{7} \(score drop 19\)$/,
    );
  });

  it('flags "watch" at a drop of 10; never touches user commits', () => {
    const { repo, store, v0, c, review } = setup();
    [80, 80, 80].forEach((s, i) => review(s, v0, i + 1));
    [70, 70, 70].forEach((s, i) => review(s, c, i + 10));
    expect(runGuard('murka', repo, store, 100)).toEqual([{ sha: c, decision: 'watch' }]);
    expect(store.flag(c)).toBe('watch');
    expect(store.flag(v0)).toBeUndefined();
  });

  it('a conflicting revert flags "manual review" and leaves the file', () => {
    const { repo, store, v0, c, review } = setup();
    const later = file({ rules: [...file().rules, { id: 'R2', text: 'Run all the tests.' }] });
    repo.write('murka', later, 'user(murka): edit R2');
    const head = repo.headSha('murka')!;
    [80, 80, 80].forEach((s, i) => review(s, v0, i + 1));
    [50, 50, 50].forEach((s, i) => review(s, head, i + 10));
    const [action] = runGuard('murka', repo, store, 100);
    expect(action.decision).toBe('revert');
    expect(action.error).toContain('same lines');
    expect(store.flag(c)).toBe('manual review');
    expect(repo.read('murka').file.rules[1].text).toBe('Run all the tests.');
    expect(repo.headSha('murka')).toBe(head);
  });
});

describe('review digest (§5.1)', () => {
  it('holds the parts, cuts to the cap and redacts a planted token', () => {
    const state = startTask({
      type: 'TaskStarted',
      taskId: 't1',
      rootId: 'boss',
      prompt: 'p',
      cats: [
        {
          id: 'boss',
          name: 'Oliver',
          appearance: {},
          role: '',
          systemPrompt: '',
          engine: 'claude',
          model: 'opus',
          effort: 'high',
          parentId: null,
        },
      ],
      runnable: [],
      repo: null,
      catCeo: true,
      cwd: '/tmp',
    }).state;
    const digest = buildDigest({
      task: {
        id: 't1',
        title: 'Make files',
        prompt: `Use ghp_secret123456 and look at /Users/me/repo. ${'x'.repeat(70_000)}`,
        status: 'done',
        createdAt: 0,
        log: [{ kind: 'tool', name: 'Luna: Bash', text: 'npm test' }],
      },
      state,
      events: [],
      branchDiffs: [],
      prompts: { murka: file() },
      history: { murka: { scores: [{ taskId: 't0', score: 70, verdict: 'pass' }], commits: [] } },
    });
    expect(digest.length).toBeLessThanOrEqual(60_000);
    expect(digest).not.toContain('ghp_secret');
    expect(digest).not.toContain('/Users/me');
    for (const part of [
      '## Task',
      '## Tests run',
      'Luna: npm test',
      '## Prompt files',
      't0: 70 (pass)',
    ]) {
      expect(digest).toContain(part);
    }
    expect(digest).toMatch(/…\[cut \d+ chars\]/);
    expect(cut('abcdef', 100)).toBe('abcdef');
  });
});

describe('judge process (§4)', () => {
  const bin = (body: string) => {
    const file = path.join(tmp, `claude-${Math.random().toString(36).slice(2)}`);
    fs.writeFileSync(file, `#!/usr/bin/env node\n${body}\n`, { mode: 0o755 });
    return file;
  };
  const req = (b: string) => ({
    bin: b,
    model: 'sonnet',
    effort: 'low',
    systemPrompt: 'judge',
    digest: 'digest text',
    cwd: tmp,
    budgetUsd: 1,
    timeoutMs: 10_000,
  });

  it('passes the locked-down flags and parses structured_output and the cost', async () => {
    const args = judgeArgs(req('x'));
    for (const flag of [
      '--tools',
      '--strict-mcp-config',
      '--safe-mode',
      '--no-session-persistence',
    ]) {
      expect(args).toContain(flag);
    }
    expect(args[args.indexOf('--tools') + 1]).toBe('');
    expect(args[args.indexOf('--max-budget-usd') + 1]).toBe('1');
    expect(args[args.indexOf('--settings') + 1]).toBe('{"language":"en"}');
    const out = path.join(tmp, 'stdin.txt');
    const b = bin(
      `let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{require('fs').writeFileSync(${JSON.stringify(out)},s);` +
        `console.log(JSON.stringify({type:'result',is_error:false,total_cost_usd:0.12,structured_output:${JSON.stringify(VALID)}}))})`,
    );
    const result = await runJudge(req(b));
    expect(result).toMatchObject({ ok: true, costUsd: 0.12, output: { verdict: 'concerns' } });
    expect(fs.readFileSync(out, 'utf-8')).toBe('digest text');
  });

  it('maps an exit 1 and a budget stop to errors', async () => {
    const failed = await runJudge(req(bin(`process.stderr.write('boom');process.exit(1)`)));
    expect(failed).toEqual({ ok: false, error: 'exit code 1: boom' });
    expect(
      parseJudgeStdout(
        JSON.stringify({ is_error: true, subtype: 'error_max_budget_usd', total_cost_usd: 1 }),
      ),
    ).toEqual({ ok: false, error: 'error_max_budget_usd:', costUsd: 1 });
  });
});

describe('prompts repo history', () => {
  it('logs commits with bodies and shows a diff', () => {
    const repo = new PromptRepo(path.join(tmp, 'p'));
    repo.write('murka', file(), 'user(murka): create');
    repo.write('murka', file({ rules: [] }), 'user(murka): remove R1', 'Prompt-Edit-By: user');
    const log = repo.log('murka');
    expect(log.map((c) => c.subject)).toEqual(['user(murka): remove R1', 'user(murka): create']);
    expect(log[0].body).toBe('Prompt-Edit-By: user');
    expect(repo.diff('murka', log[0].sha)).toContain('-- [R1] Keep changes small.');
    expect(
      execFileSync('git', ['-C', path.join(tmp, 'p'), 'status', '--porcelain']).toString(),
    ).toBe('');
  });
});
