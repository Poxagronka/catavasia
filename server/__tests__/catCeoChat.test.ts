/**
 * Chat with the Cat CEO (docs/catavasia/cat-ceo-judge.md §15): a console
 * message to the Cat CEO is a one-off judge run that answers, and may edit
 * Rules and Lessons through the review edit checks. The judge is a test seam.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ServerMessage } from '../../core/src/messages.js';
import { CEO_OFF_TEXT } from '../src/catCeo/ceoChat.js';
import type { JudgeRequest, JudgeResult } from '../src/catCeo/judgeRunner.js';
import { itemHistory } from '../src/catCeo/tidyDigest.js';
import { OfficeCatSource } from '../src/catTerminal/officeCatSource.js';
import { ClaudeAdapter } from '../src/orchestrator/claudeAdapter.js';
import { Orchestrator } from '../src/orchestrator/orchestrator.js';
import { TaskManager } from '../src/taskBoard/taskManager.js';
import { FakeCatHost, waitFor, writeFakeClaude } from './catOfficeHarness.js';

let tmp: string;
let stateDir: string;
let host: FakeCatHost;
let office: Orchestrator;
let tasks: TaskManager;
let source: OfficeCatSource;
let judged: JudgeRequest[];
let answer: (req: JudgeRequest) => JudgeResult | Promise<JudgeResult>;

const cat = (id: string, parentId: string | null) => ({
  id,
  name: id,
  role: parentId ? 'Developer' : 'Team lead',
  systemPrompt: `I am ${id}.`,
  engine: 'claude',
  model: 'sonnet',
  effort: 'medium',
  appearance: { breed: 'smokey' },
  parentId,
});

function startOffice(catCeo?: unknown): void {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, 'cats.json'),
    JSON.stringify({
      version: 1,
      cats: [cat('boss', null), cat('dev', 'boss'), cat('qa', 'boss')],
      ...(catCeo ? { catCeo } : {}),
    }),
  );
  host = new FakeCatHost();
  judged = [];
  office = new Orchestrator({
    host,
    stateDir,
    adapters: [new ClaudeAdapter(writeFakeClaude(tmp))],
    emit: (_m: ServerMessage) => {},
    turnConcurrency: 6,
    ceoJudge: async (req) => {
      judged.push(req);
      return answer(req);
    },
  });
  tasks = new TaskManager({ host, stateDir, defaultCwd: tmp, flows: office });
  source = new OfficeCatSource(office, tasks);
}

/** The office agent id of the Cat CEO character. */
const ceoAgent = () => String(office.residents.agentFor('cat-ceo'));
const entries = () => source.snapshot(ceoAgent())!.entries;
const idle = () => waitFor(() => (office.ceo.chat.busy ? undefined : true));

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pa-ceo-chat-')));
  stateDir = path.join(tmp, 'state');
  answer = () => ({ ok: true, output: { reply: 'The team has 3 cats.' }, costUsd: 0.05 });
  startOffice();
});

afterEach(async () => {
  await Promise.all([...office.ceo.running]);
  tasks.dispose();
  office.dispose();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('Cat CEO chat', () => {
  it('answers a message with no live task instead of "Unknown target: cat-ceo"', async () => {
    await expect(source.send(ceoAgent(), 'How big is the team?')).resolves.toBeUndefined();
    await idle();
    expect(tasks.list()).toHaveLength(0);
    expect(judged).toHaveLength(1);
    const texts = entries().map((e) => e.text);
    expect(texts).toContain('How big is the team?');
    expect(texts.some((t) => t.includes('The team has 3 cats.'))).toBe(true);
    expect(texts.join('\n')).not.toContain('Unknown target');
  });

  it('runs in the Cat CEO slot with the roster, prompts, reviews and the recent chat', async () => {
    let working: boolean | undefined;
    answer = () => {
      working = office.residents.message().characters.find((c) => c.catId === 'cat-ceo')?.working;
      expect(source.snapshot(ceoAgent())!.status).toMatchObject({
        busy: true,
        busyText: expect.stringContaining('thinking'),
      });
      return { ok: true, output: { reply: `Answer ${judged.length}.` } };
    };
    await source.send(ceoAgent(), 'Who is the boss?');
    await idle();
    await source.send(ceoAgent(), 'And who reports to them?');
    await idle();
    expect(working).toBe(true);
    expect(office.residents.message().characters.find((c) => c.catId === 'cat-ceo')?.working).toBe(
      false,
    );
    const [, second] = judged;
    expect(second.systemPrompt).toContain('You are the Cat CEO');
    expect(second.systemPrompt).toContain('# Chat rules');
    expect(second.schema).toMatchObject({ required: ['reply'] });
    expect(second.digest).toContain('## Team roster');
    expect(second.digest).toContain('- dev "dev": Developer; reports to boss');
    expect(second.digest).toContain('## Cat qa (qa)');
    expect(second.digest).toContain('I am qa.');
    expect(second.digest).toContain('User: Who is the boss?\nCat CEO: Answer 1.');
    expect(second.digest).toMatch(/## The user's new message\nAnd who reports to them\?$/);
    expect(source.snapshot(ceoAgent())!.status).toMatchObject({ busy: false });
    // The Cat CEO has no wheel.
    await expect(source.beginWheel(ceoAgent())).rejects.toMatchObject({ code: 400 });
  });

  it('applies valid edits like review edits, one commit per cat, with chat trailers', async () => {
    answer = () => ({
      ok: true,
      output: {
        reply: 'Done: dev runs the tests now, and qa knows about the display.',
        edits: [
          {
            catId: 'dev',
            section: 'Rules',
            op: 'add',
            text: 'Run npm test before you report.',
            reason: 'the user asked',
            dictated: true,
          },
          {
            catId: 'qa',
            section: 'Lessons',
            op: 'add',
            text: 'The e2e suite needs a display.',
            reason: 'the user asked',
            dictated: false,
          },
        ],
      },
    });
    await source.send(ceoAgent(), 'Add to dev\'s rules: "Run npm test before you report."');
    await idle();
    const dev = office.cats.prompts.read('dev').file;
    expect(dev.rules).toHaveLength(1);
    expect(dev.rules[0].text).toMatch(
      /^Run npm test before you report\. \(chat ch-[0-9a-f]{8}, \d{4}-\d{2}-\d{2}\)$/,
    );
    expect(office.cats.prompts.read('qa').file.lessons[0].id).toBe('L1');
    const [devCommit] = office.cats.prompts.log('dev');
    expect(devCommit.subject).toMatch(/^cat-ceo\(dev\): chat — add R1: Run npm test before you/);
    expect(devCommit.body).toContain('Prompt-Edit-By: cat-ceo');
    expect(devCommit.body).toMatch(/Prompt-Chat: ch-[0-9a-f]{8}/);
    expect(devCommit.body).toContain('Prompt-User-Items: R1');
    expect(office.cats.prompts.log('qa')[0].body).not.toContain('Prompt-User-Items');
    // Dictated items are the user's; the Cat CEO's own text is its own.
    expect(itemHistory('dev', office.cats.prompts).get('R1')?.owner).toBe('user');
    expect(itemHistory('qa', office.cats.prompts).get('L1')?.owner).toBe('cat-ceo');
    // Chat commits leave the review limit alone and use their own.
    expect(office.ceo.commitsLeft('dev')).toBe(2);
    expect(office.ceo.chat.commitsLeft('dev')).toBe(9);
    const rows = entries();
    expect(rows.at(-2)).toMatchObject({ kind: 'text', text: expect.stringContaining('Done') });
    expect(rows.at(-1)).toMatchObject({ kind: 'edits', catIds: ['dev', 'qa'] });
    expect(rows.at(-1)!.text).toContain('dev: add Rules R1');
  });

  it('refuses invalid edits with reasons and commits nothing', async () => {
    answer = () => ({
      ok: true,
      output: {
        reply: 'I tried.',
        edits: [
          { catId: 'cat-ceo', section: 'Rules', op: 'add', text: 'Be nice.', reason: 'r' },
          { catId: 'ghost', section: 'Rules', op: 'add', text: 'Boo.', reason: 'r' },
          { catId: 'dev', section: 'Rules', op: 'remove', itemId: 'R9', reason: 'r' },
          { catId: 'dev', section: 'Lessons', op: 'add', text: 'two\nlines', reason: 'r' },
          {
            catId: 'qa',
            section: 'Lessons',
            op: 'add',
            text: 'Use token ghp_abcdefghijklmnopqrstuvwxyz0123456789 for pushes.',
            reason: 'r',
          },
        ],
      },
    });
    const before = office.cats.prompts.log('dev').length;
    await source.send(ceoAgent(), 'Change things');
    await idle();
    expect(office.cats.prompts.log('dev')).toHaveLength(before);
    expect(office.cats.prompts.read('qa').file.lessons).toHaveLength(0);
    const row = entries().at(-1)!;
    expect(row).toMatchObject({ kind: 'edits', catIds: [] });
    expect(row.text).toContain('the Cat CEO never edits its own prompt');
    expect(row.text).toContain("ghost is not in this task's team");
    expect(row.text).toContain('R9 does not exist');
    expect(row.text).toContain('text is more than one line');
    expect(row.text).toContain('text looks like a secret');
  });

  it('says the Cat CEO is off instead of failing', async () => {
    const agent = ceoAgent();
    source.snapshot(agent);
    expect(office.editProfiles({ type: 'setCatCeoSettings', enabled: false })).toBeUndefined();
    // The character is gone, but the open chat still reaches the Cat CEO.
    await expect(source.send(agent, 'Are you there?')).resolves.toBeUndefined();
    expect(judged).toHaveLength(0);
    expect(source.snapshot(agent)!.entries.at(-1)).toEqual({
      kind: 'error',
      text: CEO_OFF_TEXT,
    });
  });

  it('stops when the Cat CEO is turned off while the judge runs', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    answer = async () => {
      await gate;
      return {
        ok: true,
        output: {
          reply: 'Too late.',
          edits: [
            {
              catId: 'dev',
              section: 'Rules',
              op: 'add',
              text: 'Late rule.',
              reason: 'r',
              dictated: true,
            },
          ],
        },
      };
    };
    const agent = ceoAgent();
    await source.send(agent, 'Add to dev\'s rules: "Late rule."');
    expect(office.editProfiles({ type: 'setCatCeoSettings', enabled: false })).toBeUndefined();
    release();
    await idle();
    expect(source.snapshot(agent)!.entries.at(-1)).toEqual({ kind: 'error', text: CEO_OFF_TEXT });
    expect(office.cats.prompts.read('dev').file.rules).toHaveLength(0);
  });

  it('counts an item as dictated only when the message holds it', async () => {
    answer = () => ({
      ok: true,
      output: {
        reply: 'Added.',
        edits: [
          {
            catId: 'dev',
            section: 'Rules',
            op: 'add',
            text: 'Lint before you push.',
            reason: 'r',
            dictated: true,
          },
        ],
      },
    });
    await source.send(ceoAgent(), 'Please make dev more careful.');
    await idle();
    const [commit] = office.cats.prompts.log('dev');
    expect(commit.body).not.toContain('Prompt-User-Items');
    expect(itemHistory('dev', office.cats.prompts).get('R1')?.owner).toBe('cat-ceo');
  });

  it('drops broken rows of the saved history', () => {
    const file = path.join(stateDir, 'cat-ceo', 'chat.json');
    const rows = [
      null,
      { kind: 'user' },
      { kind: 'edits', text: 'x' },
      { kind: 'user', text: 'ok', at: 1 },
    ];
    fs.writeFileSync(file, JSON.stringify({ version: 1, messages: rows }));
    office.dispose();
    startOffice();
    expect(entries()).toEqual([{ kind: 'user', text: 'ok' }]);
  });

  it('shows a readable error when the run fails, and takes the next message', async () => {
    answer = () => ({ ok: false, error: 'exit code 1: boom', costUsd: 0.01 });
    await source.send(ceoAgent(), 'Hello?');
    await idle();
    expect(entries().at(-1)).toEqual({
      kind: 'error',
      text: 'The Cat CEO could not answer: exit code 1: boom ($0.010)',
    });
    answer = () => ({ ok: true, output: { reply: 42 } });
    await source.send(ceoAgent(), 'Hello again?');
    await idle();
    expect(entries().at(-1)!.text).toContain('bad chat output: reply: not a text');
    expect(
      entries()
        .map((e) => e.text)
        .join('\n'),
    ).not.toContain('Unknown target');
  });

  it('refuses a second message while the first waits for its answer', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    answer = async () => {
      await gate;
      return { ok: true, output: { reply: 'Slow answer.' } };
    };
    await source.send(ceoAgent(), 'First');
    await expect(source.send(ceoAgent(), 'Second')).rejects.toMatchObject({ code: 409 });
    release();
    await idle();
    expect(entries().map((e) => e.text)).toEqual(['First', 'Slow answer.']);
  });

  it('keeps the chat history across a restart, capped at 200 messages', async () => {
    const file = path.join(stateDir, 'cat-ceo', 'chat.json');
    const old = Array.from({ length: 199 }, (_, i) => ({ kind: 'user', text: `m${i}`, at: i }));
    fs.writeFileSync(file, JSON.stringify({ version: 1, messages: old }));
    office.dispose();
    startOffice();
    expect(entries()).toHaveLength(199);
    await source.send(ceoAgent(), 'One more');
    await idle();
    const saved = JSON.parse(fs.readFileSync(file, 'utf-8')).messages as Array<{ text: string }>;
    expect(saved).toHaveLength(200);
    expect(saved[0].text).toBe('m1');
    expect(saved.at(-1)!.text).toBe('The team has 3 cats.');
    office.dispose();
    startOffice();
    expect(entries().at(-2)).toEqual({ kind: 'user', text: 'One more' });
  });

  it('never says "Unknown target" for an id that is not a team cat', async () => {
    await expect(source.send('999', 'hi')).rejects.toMatchObject({
      code: 404,
      message: 'No session for this cat',
    });
  });
});

describe('Cat CEO chat through the CLI', () => {
  it('spawns claude -p with the judge flags and the chat schema', async () => {
    const log = path.join(tmp, 'args.json');
    const bin = path.join(tmp, 'fake-judge');
    fs.writeFileSync(
      bin,
      `#!/usr/bin/env node
if (process.argv.includes('--help')) { console.log('--model <model>'); process.exit(0); }
let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  require('fs').writeFileSync(${JSON.stringify(log)}, JSON.stringify({ args: process.argv.slice(2), input }));
  console.log(JSON.stringify({ type: 'result', is_error: false, total_cost_usd: 0.02,
    structured_output: { reply: 'Hello from the CLI.' } }));
});
`,
      { mode: 0o755 },
    );
    office.dispose();
    fs.writeFileSync(
      path.join(stateDir, 'cats.json'),
      JSON.stringify({ version: 1, cats: [cat('boss', null), cat('dev', 'boss')] }),
    );
    office = new Orchestrator({
      host: new FakeCatHost(),
      stateDir,
      adapters: [new ClaudeAdapter(bin)],
      emit: () => {},
      turnConcurrency: 6,
    });
    source = new OfficeCatSource(office, tasks);
    await source.send(ceoAgent(), 'Hi');
    await idle();
    expect(entries().at(-1)).toEqual({ kind: 'text', text: 'Hello from the CLI.' });
    const { args, input } = JSON.parse(fs.readFileSync(log, 'utf-8')) as {
      args: string[];
      input: string;
    };
    const flag = (name: string) => args[args.indexOf(name) + 1];
    expect(args[0]).toBe('-p');
    expect(flag('--settings')).toBe('{"language":"en"}');
    expect(flag('--model')).toBe('opus');
    expect(flag('--effort')).toBe('high');
    expect(flag('--tools')).toBe('');
    expect(args).toContain('--no-session-persistence');
    expect(JSON.parse(flag('--json-schema'))).toMatchObject({ required: ['reply'] });
    expect(flag('--append-system-prompt')).toContain('# Chat rules');
    expect(input).toContain("## The user's new message\nHi");
  });
});
