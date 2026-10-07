import * as fs from 'fs';
import { afterEach, describe, expect, it } from 'vitest';

import type { CatProfile, ServerMessage } from '../../core/src/messages.js';
import { CatResidents } from '../src/orchestrator/catResidents.js';
import type { PermissionAnswer } from '../src/orchestrator/engineAdapter.js';
import { FakeCatHost, waitFor } from './catOfficeHarness.js';
import { deskIdle, type DeskOffice, startDeskOffice } from './ceoDeskHarness.js';

let env: DeskOffice | undefined;

afterEach(async () => {
  await env?.close();
  if (env) fs.rmSync(env.tmp, { recursive: true, force: true });
  env = undefined;
});

describe('CEO desk approvals', () => {
  it('shows a question of the CEO as a card and sends the answer back', async () => {
    let got: PermissionAnswer | undefined;
    env = await startDeskOffice(async ({ req }) => {
      got = await req.askPermission!({
        toolName: 'Bash',
        input: { command: 'rm -rf build' },
        canAlwaysAllow: true,
        signal: new AbortController().signal,
      });
      return { text: `answer: ${got}` };
    });
    env.desk.send('clean up');
    const card = await waitFor(() => env!.desk.snapshot().status.approvals?.[0]);
    expect(card).toMatchObject({
      catId: 'cat-ceo',
      who: 'Cat CEO',
      action: 'run a command',
      detail: 'rm -rf build',
      canAlwaysAllow: true,
    });
    const { app } = env.server;
    const url = `/api/ceo/approvals/${card.id}`;
    const answer = (headers: Record<string, string>, payload: unknown) =>
      app.inject({ method: 'POST', url, headers, payload: payload as object });
    expect((await answer({}, { answer: 'allow' })).statusCode).toBe(401);
    const auth = { authorization: 'Bearer tok' };
    expect((await answer(auth, { answer: 'maybe' })).statusCode).toBe(400);
    expect((await answer(auth, { answer: 'allow' })).statusCode).toBe(200);
    await deskIdle(env.desk);
    expect(got).toBe('allow');
    expect(env.desk.snapshot().status.approvals).toEqual([]);
    expect(env.desk.snapshot().entries.at(-1)).toMatchObject({ text: 'answer: allow' });
    expect((await answer(auth, { answer: 'deny' })).statusCode).toBe(404);
  });

  it('shows AskUserQuestion as a question card; the answers go back to the tool', async () => {
    let got: PermissionAnswer | undefined;
    const questions = [
      {
        question: 'Which color?',
        header: 'Color',
        options: [
          { label: 'Red', description: 'warm', preview: 'x' },
          { label: 'Blue', description: 'cool' },
        ],
        multiSelect: false,
      },
    ];
    env = await startDeskOffice(async ({ req }) => {
      got = await req.askPermission!({
        toolName: 'AskUserQuestion',
        input: { questions },
        canAlwaysAllow: true,
        signal: new AbortController().signal,
      });
      return { text: 'ok' };
    });
    env.desk.send('pick a color');
    const card = await waitFor(() => env!.desk.snapshot().status.approvals?.[0]);
    expect(card).toMatchObject({ action: 'ask you a question', detail: '', canAlwaysAllow: false });
    expect(card.questions).toEqual([
      {
        question: 'Which color?',
        header: 'Color',
        options: [
          { label: 'Red', description: 'warm' },
          { label: 'Blue', description: 'cool' },
        ],
        multiSelect: false,
      },
    ]);
    const res = await env.server.app.inject({
      method: 'POST',
      url: `/api/ceo/approvals/${card.id}`,
      headers: { authorization: 'Bearer tok' },
      payload: { answer: 'allow', answers: { 'Which color?': 'Blue, and a bit of green' } },
    });
    expect(res.statusCode).toBe(200);
    await deskIdle(env.desk);
    expect(got).toEqual({ answers: { 'Which color?': 'Blue, and a bit of green' } });
  });

  it('answers on a card without questions count as a plain Allow', async () => {
    env = await startDeskOffice(() => ({ text: 'ok' }));
    const luna = env.office.cats.list().find((c) => c.id === 'murka')!;
    const answer = env.office.askPermission(luna, {
      toolName: 'Bash',
      input: { command: 'ls' },
      canAlwaysAllow: false,
      signal: new AbortController().signal,
    });
    const card = env.desk.snapshot().status.approvals![0];
    expect(env.desk.answerApproval(card.id, { answers: { x: 'y' } })).toBe(true);
    expect(await answer).toBe('allow');
  });

  it("shows a cat's question in the CEO chat with the cat's name", async () => {
    env = await startDeskOffice(() => ({ text: 'ok' }));
    const luna = env.office.cats.list().find((c) => c.id === 'murka')!;
    const answer = env.office.askPermission(luna, {
      toolName: 'Write',
      input: { file_path: 'a.txt' },
      canAlwaysAllow: false,
      signal: new AbortController().signal,
    });
    const card = env.desk.snapshot().status.approvals![0];
    expect(card).toMatchObject({ catId: 'murka', who: 'Luna', action: 'create or replace a file' });
    expect(env.desk.answerApproval(card.id, 'deny')).toBe(true);
    expect(await answer).toBe('deny');
  });
});

describe('waiting cats in the office', () => {
  it('shows the permission bubble while a card waits, and clears it after', () => {
    const emitted: ServerMessage[] = [];
    const cat = { id: 'murka', name: 'Luna', appearance: {} } as CatProfile;
    const residents = new CatResidents(
      new FakeCatHost(),
      () => [cat],
      (m) => emitted.push(m),
    );
    const id = residents.ensure(cat);
    const bubbles = () => emitted.filter((m) => m.type.startsWith('agentToolPermission'));
    residents.setAsking(new Set(['murka']));
    residents.setAsking(new Set(['murka']));
    residents.setAsking(new Set());
    expect(bubbles()).toEqual([
      { type: 'agentToolPermission', id },
      { type: 'agentToolPermissionClear', id },
    ]);
  });
});
