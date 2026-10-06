/**
 * The Cat CEO in the office (docs/catavasia/cat-ceo-judge.md): a finished
 * team task enters the review region of the state machine, the judge (a test
 * seam here) scores it, its Rules edit is committed in the prompts repo, and
 * the prompt history API reverts, restores and edits items. The Cat CEO is a
 * resident character, and it cannot be deleted while it is on.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { EDIT_RIGHTS_HINT } from '../../core/src/constants.js';
import type { PromptHistory, ServerMessage } from '../../core/src/messages.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import type { JudgeRequest, JudgeResult } from '../src/catCeo/judgeRunner.js';
import { handleClientMessage } from '../src/clientMessageHandler.js';
import { createHttpServer, type HttpServerHandle } from '../src/httpServer.js';
import { ClaudeAdapter } from '../src/orchestrator/claudeAdapter.js';
import { EventLog } from '../src/orchestrator/machine/eventLog.js';
import { reduce, startTask } from '../src/orchestrator/machine/taskReducer.js';
import type { TaskState } from '../src/orchestrator/machine/types.js';
import { Orchestrator } from '../src/orchestrator/orchestrator.js';
import { TaskManager } from '../src/taskBoard/taskManager.js';
import { FakeCatHost, waitFor, writeFakeClaude } from './catOfficeHarness.js';

let tmp: string;
let stateDir: string;
let host: FakeCatHost;
let emitted: ServerMessage[];
let office: Orchestrator;
let tasks: TaskManager;
let server: HttpServerHandle;
let judged: JudgeRequest[];

const cat = (id: string, parentId: string | null, breed: string) => ({
  id,
  name: id,
  role: parentId ? 'Developer' : 'Team lead',
  systemPrompt: `I am ${id}.`,
  engine: 'claude',
  model: 'sonnet',
  effort: 'medium',
  appearance: { breed },
  parentId,
});

const OUTPUT = {
  verdict: 'concerns',
  summary: 'murka did not run the tests',
  scores: [
    { catId: 'boss', assignmentId: 'root', score: 82, criteria: {}, bubble: 'clean split' },
    { catId: 'murka', assignmentId: 'a1', score: 58, criteria: {}, bubble: 'forgot the tests' },
    { catId: 'pushok', assignmentId: 'a2', score: 90, criteria: {}, bubble: 'neat' },
  ],
  anomalies: [
    { id: 'x1', catId: 'murka', kind: 'no_tests_run', severity: 'medium', evidence: 'no test run' },
  ],
  edits: [
    {
      catId: 'murka',
      section: 'Rules',
      op: 'add',
      text: 'Run the tests in your folder before you report.',
      reason: 'no tests ran',
      anomalyIds: ['x1'],
    },
    { catId: 'cat-ceo', section: 'Rules', op: 'add', text: 'x', reason: 'r', anomalyIds: ['x1'] },
  ],
};

async function startOffice(catCeo?: unknown): Promise<void> {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, 'cats.json'),
    JSON.stringify({
      version: 1,
      cats: [
        cat('boss', null, 'marmalade'),
        cat('murka', 'boss', 'smokey'),
        cat('pushok', 'boss', 'snow'),
      ],
      ...(catCeo ? { catCeo } : {}),
    }),
  );
  host = new FakeCatHost();
  emitted = [];
  judged = [];
  office = new Orchestrator({
    host,
    stateDir,
    adapters: [new ClaudeAdapter(writeFakeClaude(tmp))],
    emit: (m) => emitted.push(m),
    turnConcurrency: 6,
    ceoJudge: async (req): Promise<JudgeResult> => {
      judged.push(req);
      return { ok: true, output: OUTPUT, costUsd: 0.21 };
    },
  });
  server = await createHttpServer({
    embedded: true,
    token: 'tok',
    store: new AgentStateStore(),
    orchestrator: office,
  });
  office.setServerUrl(`http://127.0.0.1:${server.port}`);
  tasks = new TaskManager({ host, stateDir, flows: office });
}

function makeRepo(): string {
  const repo = path.join(tmp, 'repo');
  fs.mkdirSync(repo);
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args]);
  git('init', '-q');
  fs.writeFileSync(path.join(repo, 'README.md'), 'hello\n');
  git('add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init');
  return repo;
}

const promptsDir = () => path.join(stateDir, 'prompts');
const gitLog = (format: string) =>
  execFileSync('git', ['-C', promptsDir(), 'log', `--format=${format}`, '--', 'murka.md'], {
    encoding: 'utf-8',
  });

async function reviewedTask() {
  const { id } = await tasks.create('make two files', makeRepo(), 'team');
  return waitFor(() => {
    const task = tasks.get(id);
    return task?.review?.state === 'reviewed' || task?.review?.state === 'failed'
      ? task
      : undefined;
  });
}

const request = (msg: Record<string, unknown>) => office.promptRequest(msg);
const history = () =>
  (request({ type: 'getPromptHistory', catId: 'murka' }).reply as PromptHistory).entries;
const murkaRules = () => office.cats.prompts.read('murka').file.rules.map((r) => r.id);

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pa-ceo-office-')));
  stateDir = path.join(tmp, 'state');
  process.env.FAKE_LOG = path.join(tmp, 'fake.log');
  await startOffice();
});

afterEach(async () => {
  await Promise.all([...office.ceo.running]);
  tasks.dispose();
  await server.app.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('Cat CEO review', () => {
  it('is a resident above the tree: settings message, character, not deletable while on', () => {
    expect(host.spawned).toHaveLength(4);
    expect(office.profileMessages()).toContainEqual(
      expect.objectContaining({
        type: 'catCeoSettings',
        enabled: true,
        name: 'Cat CEO',
        model: 'opus',
      }),
    );
    const chars = office.residents.message().characters.map((c) => c.catId);
    expect(chars).toContain('cat-ceo');
    expect(office.editProfiles({ type: 'deleteCatProfile', id: 'cat-ceo' })).toContain(
      'cannot be deleted',
    );
    expect(office.targets().map((t) => t.id)).not.toContain('cat-ceo');
    expect(
      office.editProfiles({ type: 'setCatCeoSettings', enabled: false, model: 'sonnet' }),
    ).toBe(undefined);
    // Off turns the reviews off; the CEO stays in the office (it runs the CEO desk).
    expect(host.removed).toHaveLength(0);
    expect(office.editProfiles({ type: 'deleteCatProfile', id: 'cat-ceo' })).toBe(
      'cat-ceo is the id of the Cat CEO',
    );
    const saved = JSON.parse(fs.readFileSync(path.join(stateDir, 'cats.json'), 'utf-8'));
    expect(saved.catCeo).toMatchObject({ enabled: false, model: 'sonnet' });
    expect(office.editProfiles({ type: 'setCatCeoSettings', model: 'gpt-9' })).toContain('model');
  });

  it('reviews a done task from the review region and commits one Rules edit', async () => {
    const task = await reviewedTask();
    expect(task.review).toMatchObject({
      state: 'reviewed',
      verdict: 'concerns',
      minScore: 58,
      maxScore: 90,
      costUsd: 0.21,
    });
    // One judge run, with the digest and the locked Role in its system prompt.
    expect(judged).toHaveLength(1);
    expect(judged[0].digest).toContain('## Assignments');
    expect(judged[0].digest).toContain('a1: boss -> murka');
    expect(judged[0].systemPrompt).toContain('You are the Cat CEO');
    // The edit: one commit with the §7.1 message; the self-edit is refused.
    expect(murkaRules()).toEqual(['R1']);
    const subjects = gitLog('%s').trim().split('\n');
    expect(subjects[0]).toMatch(/^cat-ceo\(murka\): add R1: Run the tests in your folder/);
    expect(subjects[0].length).toBeLessThanOrEqual('cat-ceo(murka): '.length + 60);
    const body = gitLog('%b');
    expect(body).toContain(`Task: ${task.id} "make two files"`);
    expect(body).toContain('Score: 58/100  Verdict: concerns');
    expect(body).toContain('Prompt-Edit-By: cat-ceo');
    const finished = emitted.find((m) => m.type === 'reviewFinished');
    expect(finished).toMatchObject({
      taskId: task.id,
      edits: [{ catId: 'murka', items: ['R1'] }],
      rejectedEdits: [{ catId: 'cat-ceo', reason: 'the Cat CEO never edits its own prompt' }],
    });
    expect(emitted.findIndex((m) => m.type === 'reviewStarted')).toBeLessThan(
      emitted.indexOf(finished!),
    );
    // The scores keep the prompt version each cat used.
    const record = office.ceo.store.reviews[0];
    expect(record.scores.find((s) => s.catId === 'murka')?.promptSha).toMatch(/^[0-9a-f]{40}$/);
    // The review region is in the event log; a replay still gives the snapshot.
    const log = EventLog.of(stateDir, task.id);
    const types = log.events().map((e) => e.event.type);
    expect(types.slice(-2)).toEqual(['ReviewStarted', 'ReviewFinished']);
    let replayed: TaskState | undefined;
    for (const { event } of log.events()) {
      replayed =
        event.type === 'TaskStarted' ? startTask(event).state : reduce(replayed!, event).state;
    }
    expect(replayed?.review).toBe('reviewed');
    expect(replayed).toEqual(log.snapshot()?.state);
    // The Cats menu got the new rule.
    const loaded = emitted.filter((m) => m.type === 'catProfilesLoaded').at(-1);
    expect(JSON.stringify(loaded)).toContain('Run the tests in your folder');
  });

  it('prompt history: list, diff, revert, restore, remove and edit items', async () => {
    await reviewedTask();
    const [ceoEntry] = history();
    expect(ceoEntry).toMatchObject({
      author: 'cat-ceo',
      subject: expect.stringContaining('cat-ceo(murka)'),
    });
    expect(ceoEntry.taskId).toBeDefined();
    const diff = request({ type: 'getPromptDiff', catId: 'murka', sha: ceoEntry.sha }).reply;
    expect(diff).toMatchObject({ type: 'promptDiff' });
    expect((diff as { diff: string }).diff).toContain('+- [R1] Run the tests');

    expect(
      request({ type: 'revertPromptEdit', catId: 'murka', sha: ceoEntry.sha }).error,
    ).toBeUndefined();
    expect(murkaRules()).toEqual([]);
    expect(history()[0]).toMatchObject({
      author: 'user',
      subject: `user(murka): revert ${ceoEntry.sha.slice(0, 7)}`,
    });

    expect(
      request({ type: 'restorePromptVersion', catId: 'murka', sha: ceoEntry.sha }).error,
    ).toBeUndefined();
    expect(murkaRules()).toEqual(['R1']);

    expect(
      request({
        type: 'savePromptItem',
        catId: 'murka',
        section: 'Lessons',
        text: 'Tests live in test/.',
      }).error,
    ).toBeUndefined();
    expect(
      request({
        type: 'savePromptItem',
        catId: 'murka',
        section: 'Rules',
        itemId: 'R1',
        text: 'Run npm test.',
      }).error,
    ).toBeUndefined();
    expect(
      request({ type: 'removePromptItem', catId: 'murka', itemId: 'R1' }).error,
    ).toBeUndefined();
    const file = office.cats.prompts.read('murka').file;
    expect(file).toMatchObject({
      rules: [],
      lessons: [{ id: 'L1', text: 'Tests live in test/.' }],
    });
    expect(file.role).toBe('I am murka.');
    expect(
      history()
        .slice(0, 3)
        .map((e) => e.subject),
    ).toEqual(['user(murka): remove R1', 'user(murka): edit R1', 'user(murka): add L1']);

    expect(request({ type: 'revertPromptEdit', catId: 'murka', sha: 'HEAD' }).error).toBe(
      'unknown commit',
    );
    expect(request({ type: 'removePromptItem', catId: 'murka', itemId: 'R7' }).error).toBe(
      'R7 does not exist',
    );
    expect(
      request({ type: 'savePromptItem', catId: 'murka', section: 'Rules', text: '# Role' }).error,
    ).toBe('text starts with #');
    expect(request({ type: 'getPromptHistory', catId: 'nobody' }).error).toBe(
      'cat nobody does not exist',
    );
  });

  it('needs the server token for prompt history', () => {
    const sent: Array<Record<string, unknown>> = [];
    const ctx = {
      store: new AgentStateStore(),
      cache: null,
      orchestrator: office,
      privileged: false,
    };
    handleClientMessage({ type: 'getPromptHistory', catId: 'murka' }, (m) => sent.push(m), ctx);
    handleClientMessage(
      { type: 'removePromptItem', catId: 'murka', itemId: 'R1' },
      (m) => sent.push(m),
      ctx,
    );
    expect(sent.map((m) => m.type)).toEqual(['catProfileRejected', 'catProfileRejected']);
    expect(sent.map((m) => m.error)).toEqual([EDIT_RIGHTS_HINT, EDIT_RIGHTS_HINT]);
    handleClientMessage({ type: 'getPromptHistory', catId: 'murka' }, (m) => sent.push(m), {
      ...ctx,
      privileged: true,
    });
    expect(sent.at(-1)).toMatchObject({ type: 'promptHistory', catId: 'murka' });
  });

  it('skips the review while the Cat CEO is off', async () => {
    await server.app.close();
    tasks.dispose();
    fs.rmSync(stateDir, { recursive: true, force: true });
    await startOffice({ enabled: false });
    const { id } = await tasks.create('make two files', makeRepo(), 'team');
    const task = await waitFor(() => {
      const t = tasks.get(id);
      return t && t.status !== 'running' ? t : undefined;
    });
    expect(task.status).toBe('done');
    expect(task.review).toBeUndefined();
    expect(EventLog.of(stateDir, id).snapshot()?.state.review).toBe('review_skipped');
    expect(judged).toEqual([]);
  });
});
