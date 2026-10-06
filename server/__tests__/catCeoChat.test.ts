/**
 * Chat with the Cat CEO (docs/catavasia/cat-ceo-judge.md §15): a console
 * message to the Cat CEO is a one-off judge run that answers, and may edit
 * Rules and Lessons through the review edit checks. The judge is a test seam.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ServerMessage } from '../../core/src/messages.js';
import type { JudgeRequest, JudgeResult } from '../src/catCeo/judgeRunner.js';
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
let answer: (req: JudgeRequest) => JudgeResult;

const cat = (id: string, parentId: string | null) => ({
  id,
  name: id,
  role: parentId ? 'Developer' : 'Team lead',
  systemPrompt: `I am ${id}.`,
  engine: 'claude',
  model: 'sonnet',
  effort: 'medium',
  appearance: { breed: 'tabby' },
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
});
