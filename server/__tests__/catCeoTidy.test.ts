/**
 * Cat CEO tidy runs (docs/catavasia/cat-ceo-judge.md §14): one commit per
 * tidy with its trailers, the triggers (cap, reviews, sweep, manual), the
 * limits (one automatic tidy per cat per day, skip when nothing changed, the
 * guard block), the regression guard on a tidy commit, and the token-gated
 * "Tidy now" message of the office.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { EDIT_RIGHTS_HINT } from '../../core/src/constants.js';
import type { PromptHistory, ServerMessage } from '../../core/src/messages.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import { CEO_DEFAULTS, type CeoSettings } from '../src/catCeo/ceoSettings.js';
import type { JudgeResult } from '../src/catCeo/judgeRunner.js';
import { runGuard } from '../src/catCeo/regressionGuard.js';
import { type ReviewRecord, ReviewStore } from '../src/catCeo/reviewStore.js';
import { CatTidy } from '../src/catCeo/tidy.js';
import { TIDY_RULES, TIDY_SCHEMA } from '../src/catCeo/tidySchema.js';
import { handleClientMessage } from '../src/clientMessageHandler.js';
import { ClaudeAdapter } from '../src/orchestrator/claudeAdapter.js';
import { Orchestrator } from '../src/orchestrator/orchestrator.js';
import type { PromptFile } from '../src/orchestrator/promptFile.js';
import { PromptRepo } from '../src/orchestrator/promptRepo.js';
import { FakeCatHost, writeFakeClaude } from './catOfficeHarness.js';

const DAY = 24 * 60 * 60 * 1000;
const OUT = {
  summary: 'R2 and R3 say the same; R4 is stale.',
  ops: [
    { op: 'merge', section: 'Rules', itemIds: ['R2', 'R3'], text: 'Run npm test.', reason: 'dup' },
    { op: 'remove', section: 'Rules', itemIds: ['R4'], reason: 'stale' },
    { op: 'remove', section: 'Rules', itemIds: ['R1'], reason: 'unused' },
  ],
};

const rules = (n: number, from = 1) =>
  Array.from({ length: n }, (_, i) => ({ id: `R${from + i}`, text: `rule number ${from + i}` }));

let tmp: string;
let repo: PromptRepo;
let store: ReviewStore;
let now: number;
let settings: CeoSettings;
let emitted: ServerMessage[];
let judged: Array<{ rules: string; digest: string; schema: object }>;
let output: unknown;
let jobs: Array<Promise<void>>;
let tidy: CatTidy;
let room: number;

const FILE: PromptFile = {
  role: 'I am murka.',
  rules: [
    { id: 'R1', text: 'Write short commit messages.' },
    { id: 'R2', text: 'Run npm test before you report. (task t1, 2026-10-01)' },
    { id: 'R3', text: 'Always run the tests before the report. (task t2, 2026-10-02)' },
    { id: 'R4', text: 'Use the old build script. (task t3, 2026-10-03)' },
  ],
  lessons: [],
};

/** R1 is the user's (created by the user); R2-R4 are the judge's. */
function seed(catId = 'murka', on = repo): void {
  on.write(catId, { role: 'I am murka.', rules: rules(1), lessons: [] }, `user(${catId}): create`);
  on.write(catId, FILE, `cat-ceo(${catId}): add R2`, 'Prompt-Edit-By: cat-ceo');
}

function review(catId: string, score: number, promptSha?: string, at = now): ReviewRecord {
  return {
    reviewId: `rv-${Math.random()}`,
    taskId: 't',
    title: 't',
    at,
    verdict: 'pass',
    summary: 's',
    scores: [{ catId, assignmentId: 'a', score, bubble: 'b', ...(promptSha ? { promptSha } : {}) }],
    anomalies: [],
    edits: [],
    rejected: [],
  };
}

const drain = async () => {
  while (jobs.length) await jobs.shift();
};
const last = () => emitted.at(-1) as Extract<ServerMessage, { type: 'promptTidy' }>;

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pa-tidy-run-')));
  repo = new PromptRepo(path.join(tmp, 'prompts'));
  store = new ReviewStore(path.join(tmp, 'reviews.json'));
  now = Date.parse('2026-10-06T10:00:00Z');
  settings = { ...CEO_DEFAULTS };
  emitted = [];
  judged = [];
  output = OUT;
  jobs = [];
  room = 10;
  tidy = new CatTidy({
    prompts: repo,
    store,
    settings: () => settings,
    catIds: () => ['murka', 'pushok'],
    enqueue: (job) => {
      jobs.push(job());
      return true;
    },
    queueRoom: () => room,
    judge: async (rulesText, digest, schema): Promise<JudgeResult> => {
      judged.push({ rules: rulesText, digest, schema });
      return { ok: true, output, costUsd: 0.04 };
    },
    emit: (m) => emitted.push(m),
    log: () => {},
    working: () => {},
    promptsChanged: () => {},
    now: () => now,
  });
  seed();
});

afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('tidy run', () => {
  it('commits one tidy with trailers; marks the user item; skips when nothing changed', async () => {
    expect(tidy.requestManual('murka')).toBeUndefined();
    await drain();
    expect(judged[0].schema).toBe(TIDY_SCHEMA);
    expect(judged[0].rules).toBe(TIDY_RULES);
    expect(judged[0].digest).toContain('owner: user');
    const [head] = repo.log('murka');
    expect(head.subject).toBe('cat-ceo(murka): tidy — merged 1, rewrote 0, removed 1');
    expect(head.body).toMatch(/^Tidy: td-[0-9a-f]+ {2}Trigger: manual$/m);
    expect(head.body).toContain('- merge Rules R2+R3 -> R5: Run npm test. (tidy td-');
    expect(head.body).toContain('Marked for the user (not applied):\n- remove Rules R1: unused');
    expect(head.body).toContain('Prompt-Edit-By: cat-ceo');
    expect(repo.read('murka').file.rules.map((r) => r.id)).toEqual(['R1', 'R5']);
    expect(repo.read('murka').file.role).toBe('I am murka.');
    expect(store.lastTidy('murka')).toMatchObject({ sha: head.sha, head: head.sha, costUsd: 0.04 });
    expect(emitted.map((m) => (m as { state?: string }).state)).toEqual(['queued', 'done']);
    expect(last()).toMatchObject({ sha: head.sha, changed: 2 });
    expect(last().text).toBe('murka: tidied 2 items, 1 marked for you ($0.040)');
    // Nothing changed since: no second run, no second cost.
    expect(tidy.requestManual('murka')).toBe('Nothing to tidy: no change since the last tidy.');
    expect(tidy.requestManual('cat-ceo')).toContain('never tidies its own prompt');
    settings = { ...settings, enabled: false };
    expect(tidy.requestManual('pushok')).toBe('Cat CEO reviews are off.');
  });

  it('applies nothing when the prompt changed during the run, and records the failure', async () => {
    output = { summary: 'x', ops: [{ op: 'remove', section: 'Rules', itemIds: ['R4'] }] };
    expect(tidy.requestManual('murka')).toBeUndefined();
    await drain();
    expect(last()).toMatchObject({ state: 'failed' });
    expect(last().text).toContain('bad tidy output: ops[0].reason: not a string');
    expect(store.tidies.at(-1)).toMatchObject({ failed: true, rows: [] });
    output = OUT;
    const before = repo.headSha('murka');
    const job = tidy.requestManual('murka');
    expect(job).toBeUndefined();
    // A hand edit lands while the judge runs (the job is still pending in `jobs`).
    const text = fs.readFileSync(repo.fileOf('murka'), 'utf-8');
    fs.writeFileSync(repo.fileOf('murka'), text.replace('short commit', 'tiny commit'));
    await drain();
    expect(last().text).toContain('the prompt changed during the tidy');
    expect(repo.log('murka')[0].subject).toBe('user(murka): manual edit');
    expect(repo.log('murka')[1].sha).toBe(before);
  });
});

describe('user items merged by a tidy', () => {
  it("stay the user's: a later tidy only marks their removal", async () => {
    settings = { ...settings, tidyUserItems: true };
    output = {
      summary: 'merge',
      ops: [
        {
          op: 'merge',
          section: 'Rules',
          itemIds: ['R1', 'R2'],
          text: 'Short commits; run npm test first.',
          reason: 'r',
        },
      ],
    };
    tidy.requestManual('murka');
    await drain();
    expect(repo.log('murka')[0].body).toContain('Prompt-User-Items: R5');
    settings = { ...settings, tidyUserItems: false };
    // A user change after the tidy, so the next one is not skipped.
    const now1 = repo.read('murka').file;
    repo.write(
      'murka',
      { ...now1, lessons: [{ id: 'L1', text: 'A fact.' }] },
      'user(murka): add L1',
    );
    output = {
      summary: 'x',
      ops: [{ op: 'remove', section: 'Rules', itemIds: ['R5'], reason: 'r' }],
    };
    tidy.requestManual('murka');
    await drain();
    expect(store.lastTidy('murka')?.rows).toMatchObject([{ op: 'remove', applied: false }]);
    expect(repo.read('murka').file.rules.map((x) => x.id)).toContain('R5');
  });
});

describe('tidy triggers and limits', () => {
  it('starts at 80 % of a cap or after 10 reviews; once a day; never while blocked', async () => {
    expect(tidy.autoTrigger('murka')).toBeUndefined();
    const file = repo.read('murka').file;
    repo.write('murka', { ...file, rules: rules(9) }, 'user(murka): nine rules');
    expect(tidy.autoTrigger('murka')).toBeUndefined();
    repo.write('murka', { ...file, rules: rules(10) }, 'user(murka): ten rules');
    expect(tidy.autoTrigger('murka')).toBe('cap');
    output = { summary: 'fine', ops: [] };
    tidy.afterReview(['murka']);
    await drain();
    expect(last().text).toBe('murka: nothing to tidy ($0.040)');
    expect(store.lastTidy('murka')?.trigger).toBe('cap');
    // A change after the tidy, but the daily limit holds for automatic tidies.
    repo.write('murka', { ...file, rules: rules(11) }, 'user(murka): eleven');
    expect(tidy.autoTrigger('murka')).toBeUndefined();
    now += DAY + 1;
    expect(tidy.autoTrigger('murka')).toBe('cap');
    store.block('murka', now + 1000);
    expect(tidy.autoTrigger('murka')).toBeUndefined();
    // Ten reviews of a small file since its last tidy.
    seed('pushok');
    for (let i = 0; i < 9; i++) store.add(review('pushok', 80));
    expect(tidy.autoTrigger('pushok')).toBeUndefined();
    store.add(review('pushok', 80));
    expect(tidy.autoTrigger('pushok')).toBe('reviews');
  });

  it('sweeps every cat once a week; the first start only sets the clock', async () => {
    seed('pushok');
    tidy.sweep();
    expect(store.lastSweep).toBe(now);
    expect(jobs).toHaveLength(0);
    const start = now;
    now += 7 * DAY;
    // No room beside the places kept for task reviews: the sweep waits, its clock too.
    room = 3;
    tidy.sweep();
    expect(jobs).toHaveLength(0);
    expect(store.lastSweep).toBe(start);
    expect(tidy.requestManual('murka')).toBeUndefined();
    await drain();
    room = 10;
    tidy.sweep();
    // murka was tidied by hand and did not change since: only pushok.
    expect(jobs).toHaveLength(1);
    await drain();
    expect(store.lastSweep).toBe(now);
    expect(repo.log('pushok')[0].subject).toContain('cat-ceo(pushok): tidy');
    expect(store.tidies.map((t) => t.trigger)).toEqual(['manual', 'sweep']);
    tidy.sweep();
    expect(jobs).toHaveLength(0);
  });

  it('the regression guard reverts a tidy commit after a score drop', async () => {
    const old = repo.headSha('murka')!;
    for (let i = 0; i < 3; i++) store.add(review('murka', 85, old, now - DAY));
    tidy.requestManual('murka');
    await drain();
    const sha = repo.headSha('murka')!;
    for (let i = 0; i < 3; i++) store.add(review('murka', 60, sha));
    const done = runGuard('murka', repo, store, now);
    expect(done).toContainEqual({ sha, decision: 'revert' });
    expect(repo.log('murka')[0].subject).toBe(
      `guard(murka): revert ${sha.slice(0, 7)} (score drop 25)`,
    );
    expect(repo.read('murka').file.rules.map((r) => r.id)).toEqual(['R1', 'R2', 'R3', 'R4']);
    expect(store.flag(sha)).toBe('reverted');
  });
});

describe('Tidy now in the office', () => {
  it('is token-gated, commits apart from the review limit, and shows in the history', async () => {
    const stateDir = path.join(tmp, 'state');
    fs.mkdirSync(stateDir);
    const cat = (id: string, parentId: string | null) => ({
      id,
      name: id,
      role: 'r',
      systemPrompt: `I am ${id}.`,
      engine: 'claude',
      model: 'sonnet',
      effort: 'low',
      appearance: { breed: 'snow' },
      parentId,
    });
    fs.writeFileSync(
      path.join(stateDir, 'cats.json'),
      JSON.stringify({ version: 1, cats: [cat('boss', null), cat('murka', 'boss')] }),
    );
    const office = new Orchestrator({
      host: new FakeCatHost(),
      stateDir,
      adapters: [new ClaudeAdapter(writeFakeClaude(tmp))],
      emit: (m) => emitted.push(m),
      turnConcurrency: 2,
      ceoJudge: async (req): Promise<JudgeResult> => {
        judged.push({ rules: req.systemPrompt, digest: req.digest, schema: req.schema ?? {} });
        return { ok: true, output: OUT, costUsd: 0.05 };
      },
    });
    const prompts = office.cats.prompts;
    prompts.write('murka', FILE, 'cat-ceo(murka): add R4', 'x');
    const sent: Array<Record<string, unknown>> = [];
    const ctx = {
      store: new AgentStateStore(),
      cache: null,
      orchestrator: office,
      privileged: false,
    };
    handleClientMessage({ type: 'tidyPrompt', catId: 'murka' }, (m) => sent.push(m), ctx);
    expect(sent).toMatchObject([{ type: 'catProfileRejected', error: EDIT_RIGHTS_HINT }]);
    handleClientMessage({ type: 'tidyPrompt', catId: 'murka' }, (m) => sent.push(m), {
      ...ctx,
      privileged: true,
    });
    expect(sent).toHaveLength(1);
    await Promise.all([...office.ceo.running]);
    expect(judged[0].schema).toBe(TIDY_SCHEMA);
    expect(prompts.log('murka')[0].subject).toBe(
      'cat-ceo(murka): tidy — merged 1, rewrote 0, removed 2',
    );
    // The tidy does not use the 2 review edits per day; the earlier judge add does.
    expect(office.ceo.commitsLeft('murka')).toBe(1);
    const history = office.promptRequest({ type: 'getPromptHistory', catId: 'murka' })
      .reply as PromptHistory;
    expect(history.entries[0].tidy?.map((r) => r.op)).toEqual(['merge', 'remove', 'remove']);
    expect(history.lastTidy).toMatchObject({ trigger: 'manual', costUsd: 0.05 });
    expect(office.profileMessages()).toContainEqual(
      expect.objectContaining({ type: 'catCeoSettings', tidyUserItems: false }),
    );
    expect(office.editProfiles({ type: 'setCatCeoSettings', tidyUserItems: 'yes' })).toBe(
      'tidyUserItems must be true or false',
    );
    expect(office.editProfiles({ type: 'setCatCeoSettings', tidyUserItems: true })).toBeUndefined();
    expect(office.ceo.settings.tidyUserItems).toBe(true);
    office.dispose();
  });
});
