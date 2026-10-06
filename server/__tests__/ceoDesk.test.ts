import * as fs from 'fs';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import type { CatSessionEntry, CatSessionFrame } from '../../core/src/catSession.js';
import { OfficeCatSource } from '../src/catTerminal/officeCatSource.js';
import { RESTARTED_TEXT } from '../src/ceoDesk/ceoDesk.js';
import { DESK_RULES } from '../src/ceoDesk/deskPrompt.js';
import { waitFor } from './catOfficeHarness.js';
import {
  type CeoTurn,
  deskIdle,
  type DeskOffice,
  git,
  HANG,
  makeRepo,
  startDeskOffice,
} from './ceoDeskHarness.js';

let env: DeskOffice | undefined;

afterEach(async () => {
  await env?.close();
  if (env) fs.rmSync(env.tmp, { recursive: true, force: true });
  env = undefined;
  delete process.env.FAKE_MODE;
  delete process.env.FAKE_HANG_CAT;
});

const texts = (entries: CatSessionEntry[]) =>
  entries.filter((e) => e.kind === 'text').map((e) => (e as { text: string }).text);

describe('CEO desk turns', () => {
  it('answers a question in a resumable session with the desk persona', async () => {
    env = await startDeskOffice(({ req }) => ({
      text: req.message.includes('2+2') ? 'It is 4.' : 'Hello again.',
    }));
    const { desk, ceo, stateDir } = env;
    expect(desk.send('what is 2+2?')).toBe(0); // the turn took it at once
    await deskIdle(desk);
    desk.send('hi');
    await deskIdle(desk);

    const [first, second] = ceo.turns;
    expect(first.resume).toBe(false);
    expect(second.resume).toBe(true);
    expect(second.sessionId).toBe(first.sessionId);
    const chatId = path.basename(first.cwd);
    expect(first.cwd).toBe(path.join(stateDir, 'cat-ceo', 'chats', chatId));
    expect(second.cwd).toBe(first.cwd);
    expect(first.model).toBe('haiku');
    expect(first.message).toBe(
      '[Work folder: none (sandbox)]\n\n[Message from the user]\nwhat is 2+2?',
    );
    const persona = fs.readFileSync(first.systemPromptFile, 'utf-8');
    expect(persona).toContain(DESK_RULES);
    expect(persona).toContain('You are Cat CEO');
    expect(fs.statSync(first.mcpConfigFile).mode & 0o777).toBe(0o600);

    const snap = desk.snapshot();
    expect(snap.entries.map((e) => e.kind)).toEqual(['user', 'text', 'user', 'text']);
    expect(texts(snap.entries)).toEqual(['It is 4.', 'Hello again.']);
    expect(snap.status).toMatchObject({ busy: false, queued: 0, folder: null, costUsd: 0.02 });
    // The history survives on disk under the chat id.
    const saved = JSON.parse(
      fs.readFileSync(path.join(stateDir, 'cat-ceo', 'chats', `${chatId}.json`), 'utf-8'),
    );
    expect(saved.rows).toHaveLength(4);
  });

  it('streams tools and text, and replaces the newest text with the full final text', async () => {
    env = await startDeskOffice(() => ({
      text: 'FULL final answer',
      log: [
        { kind: 'text', text: 'Let me look.' },
        { kind: 'tool', name: 'Read', text: 'README.md' },
        { kind: 'text', text: 'FULL fin… (cut)' },
      ],
    }));
    const frames: CatSessionFrame[] = [];
    env.desk.subscribe((f) => frames.push(f));
    env.desk.send('look');
    await deskIdle(env.desk);
    const rows = env.desk.snapshot().entries;
    expect(rows).toEqual([
      { kind: 'user', text: 'look' },
      { kind: 'text', text: 'Let me look.' },
      { kind: 'tool', name: 'Read', text: 'README.md' },
      { kind: 'text', text: 'FULL final answer' },
    ]);
    expect(frames.some((f) => f.type === 'status' && f.status.busy)).toBe(true);
  });

  it('queues messages while busy; Stop kills the turn and returns queued messages', async () => {
    env = await startDeskOffice(() => HANG);
    const { desk } = env;
    desk.send('first');
    await waitFor(() => (desk.snapshot().status.busy ? true : undefined));
    expect(desk.send('second')).toBe(1);
    expect(desk.send('third')).toBe(2);
    expect(desk.snapshot().status.queued).toBe(2);
    expect(desk.stop()).toBe('second\n\nthird');
    await deskIdle(desk);
    const rows = desk.snapshot().entries;
    expect(rows.at(-1)).toEqual({ kind: 'text', text: 'Stopped.' });
    expect(rows.some((e) => e.kind === 'error')).toBe(false);
    expect(env.ceo.turns).toHaveLength(1);
  });

  it('shows a failed turn as an error row', async () => {
    env = await startDeskOffice(() => ({ ok: false, error: 'Not logged in' }));
    env.desk.send('hi');
    await deskIdle(env.desk);
    // An auth error also says how to log in (engine preflight).
    expect(env.desk.snapshot().entries.at(-1)).toMatchObject({
      kind: 'error',
      text: expect.stringMatching(
        /^The CEO could not answer: Not logged in Claude Code is not logged in\. Press Log in/,
      ),
    });
  });

  it('refuses at once when the Claude CLI is missing', async () => {
    env = await startDeskOffice(() => ({ text: 'never' }));
    env.ceo.unavailable = 'Claude Code CLI not found';
    env.desk.send('hi');
    expect(env.desk.snapshot().entries.at(-1)).toEqual({
      kind: 'error',
      text: 'The CEO cannot answer: Claude Code CLI not found.',
    });
    expect(env.ceo.turns).toHaveLength(0);
  });

  it('New chat archives the history and changes session, cwd and token', async () => {
    env = await startDeskOffice(() => ({ text: 'ok' }));
    const { desk, stateDir } = env;
    desk.send('one');
    await deskIdle(desk);
    const old = env.ceo.turns[0];
    const oldToken = JSON.parse(fs.readFileSync(old.mcpConfigFile, 'utf-8')).token as string;
    const frames: CatSessionFrame[] = [];
    desk.subscribe((f) => frames.push(f));
    const chatId = desk.newChat();
    expect(frames.at(-1)).toMatchObject({ type: 'snapshot', entries: [] });
    expect(desk.knowsToken(oldToken)).toBe(false);
    desk.send('two');
    await deskIdle(desk);
    const next = env.ceo.turns[1];
    expect(next.resume).toBe(false);
    expect(next.sessionId).not.toBe(old.sessionId);
    expect(next.cwd).toBe(path.join(stateDir, 'cat-ceo', 'chats', chatId));
    expect(
      fs.existsSync(path.join(stateDir, 'cat-ceo', 'chats', `${path.basename(old.cwd)}.json`)),
    ).toBe(true);
  });
});

describe('CEO desk jobs', () => {
  /** On a user message start one team job; on its notice answer with the branch. */
  const deskScript = async ({ req, call }: CeoTurn) => {
    const notice = /\[Job ([0-9a-f]+) done\][\s\S]*Branch: (\S+)/.exec(req.message);
    if (notice) return { text: `Done. The work is on branch ${notice[2]}.` };
    const started = await call('start_job', { task: 'make two files' });
    return { text: `Started: ${started.text}` };
  };

  it('starts a team job in the chat folder and answers with the branch when it ends', async () => {
    env = await startDeskOffice(deskScript);
    const { desk, tasks, tmp } = env;
    const repo = makeRepo(path.join(tmp, 'repo'));
    desk.setFolder(repo);
    desk.send('please make two files');
    const job = await waitFor(() => tasks.list()[0]);
    expect(job).toMatchObject({ target: 'team', cwd: repo, branch: `task/${job.id}` });
    await waitFor(() => (env!.ceo.turns.length === 2 ? true : undefined), 30_000);
    await deskIdle(desk);

    const notice = env.ceo.turns[1].message;
    expect(notice.startsWith(`[Work folder: ${repo}]`)).toBe(true);
    expect(notice).toContain(`[Job ${job.id} done]`);
    expect(notice).toContain('all files are in: murka.txt, pushok.txt');
    expect(notice).toContain('- A murka.txt');
    expect(git(repo, 'show', `task/${job.id}:murka.txt`)).toBe('meow from murka\n');

    const rows = desk.snapshot().entries;
    const card = rows.find((e) => e.kind === 'job');
    expect(card).toMatchObject({
      kind: 'job',
      job: {
        jobId: job.id,
        state: 'done',
        leadName: 'Oliver',
        folder: repo,
        branch: `task/${job.id}`,
      },
    });
    expect((card as { text: string }).text).toContain(
      `[Job ${job.id} · Team: Oliver leads · ${repo} · done`,
    );
    expect(texts(rows).at(-1)).toBe(`Done. The work is on branch task/${job.id}.`);
    const saved = JSON.parse(fs.readFileSync(path.join(env.stateDir, 'tasks.json'), 'utf-8'));
    expect(saved.tasks[job.id].chatId).toMatch(/^c-/);
    const deskFile = JSON.parse(
      fs.readFileSync(path.join(env.stateDir, 'cat-ceo', 'desk.json'), 'utf-8'),
    );
    expect(deskFile.liveJobs).toEqual([]);
  });

  it('runs a folderless job in the chat sandbox', async () => {
    env = await startDeskOffice(deskScript);
    env.desk.send('make files');
    const job = await waitFor(() => env!.tasks.list()[0]);
    const chatId = path.basename(env.ceo.turns[0].cwd);
    expect(job.cwd).toBe(path.join(env.stateDir, 'cat-ceo', 'chats', chatId, 'work'));
    expect(job.branch).toBeUndefined();
    await waitFor(() => (env!.ceo.turns.length === 2 ? true : undefined), 30_000);
    expect(env.ceo.turns[1].message).toContain('Folder: none (sandbox, not a git repo)');
  });

  it('after a restart, tells the user about a cut turn and queues notices of jobs that ended', async () => {
    env = await startDeskOffice(() => HANG);
    const { tmp, stateDir } = env;
    const repo = makeRepo(path.join(tmp, 'repo'));
    env.desk.setFolder(repo);
    env.desk.send('hang please');
    await waitFor(() => (env!.desk.snapshot().status.busy ? true : undefined));
    // A job of this chat ran and ended while the server was down.
    const deskFile = path.join(stateDir, 'cat-ceo', 'desk.json');
    const created = await env.tasks.create('x', repo, 'team', {
      chatId: JSON.parse(fs.readFileSync(deskFile, 'utf-8')).chatId,
    });
    await waitFor(() => (env!.tasks.get(created.id)?.status === 'done' ? true : undefined), 30_000);
    await env.close();
    const state = JSON.parse(fs.readFileSync(deskFile, 'utf-8'));
    fs.writeFileSync(deskFile, JSON.stringify({ ...state, liveJobs: [created.id] }));

    env = await startDeskOffice(
      ({ req }) => ({ text: `seen ${req.message.includes(`[Job ${created.id} done]`)}` }),
      {
        tmp,
      },
    );
    await waitFor(() => (env!.ceo.turns.length === 1 ? true : undefined));
    await deskIdle(env.desk);
    const rows = env.desk.snapshot().entries;
    expect(rows).toContainEqual({ kind: 'error', text: RESTARTED_TEXT });
    expect(texts(rows).at(-1)).toBe('seen true');
    // The cut first turn may have made the session: the next one starts a fresh id.
    expect(env.ceo.turns[0].resume).toBe(false);
    expect(env.ceo.turns[0].sessionId).not.toBe(state.sessionId);
  });
});

describe('CEO desk jobs across a restart', () => {
  it('keeps a queued notice across a restart', async () => {
    let jobId = '';
    env = await startDeskOffice(async ({ req, call }) => {
      if (!req.message.includes('[Message from the user]')) return HANG;
      jobId = /Job ([0-9a-f]+) started/.exec(
        (await call('start_job', { task: 'make files' })).text,
      )![1];
      return HANG;
    });
    const { tmp } = env;
    env.desk.setFolder(makeRepo(path.join(tmp, 'repo')));
    env.desk.send('go');
    // The job ends while the CEO turn still runs: its notice waits in the queue.
    await waitFor(() => (env!.desk.snapshot().status.queued === 1 ? true : undefined), 30_000);
    await env.close();
    env = await startDeskOffice(() => ({ text: 'ok' }), { tmp });
    await waitFor(() =>
      env!.ceo.turns.some((t) => t.message.includes(`[Job ${jobId} done]`)) ? true : undefined,
    );
  });

  it('cancelling an interrupted job sends one cancelled notice, not an early error', async () => {
    process.env.FAKE_HANG_CAT = 'murka';
    let jobId = '';
    const script = async ({ req, call }: CeoTurn) => {
      if (req.message.includes('please cancel')) await call('cancel_job', { jobId });
      else if (req.message.includes('[Message from the user]')) {
        jobId = /Job ([0-9a-f]+) started/.exec((await call('start_job', { task: 'x' })).text)![1];
      }
      return { text: 'ok' };
    };
    env = await startDeskOffice(script);
    const { tmp } = env;
    env.desk.setFolder(makeRepo(path.join(tmp, 'repo')));
    env.desk.send('go');
    await waitFor(() => (env!.office.hasPendingTurn('murka') ? true : undefined), 30_000);
    await deskIdle(env.desk);
    await env.close();
    delete process.env.FAKE_HANG_CAT;
    env = await startDeskOffice(script, { tmp });
    expect(env.tasks.get(jobId)?.flow?.state).toBe('interrupted');
    env.desk.send('please cancel');
    await waitFor(() =>
      env!.ceo.turns.some((t) => t.message.includes(`[Job ${jobId} cancelled]`)) ? true : undefined,
    );
    expect(env.ceo.turns.filter((t) => t.message.includes(`[Job ${jobId} `))).toHaveLength(1);
  });
});

describe('cat sessions of the CEO desk', () => {
  it('serves the literal cat-ceo id from the desk; an idle cat with no folder asks for the CEO', async () => {
    env = await startDeskOffice(() => ({ text: 'hello' }));
    const source = new OfficeCatSource(env.office, env.tasks, env.desk);
    await source.send('cat-ceo', 'hi');
    await deskIdle(env.desk);
    expect(source.snapshot('cat-ceo')).toMatchObject({
      title: 'Cat CEO',
      status: { busy: false, folder: null },
      entries: [
        { kind: 'user', text: 'hi' },
        { kind: 'text', text: 'hello' },
      ],
    });
    await expect(source.beginWheel('cat-ceo')).rejects.toMatchObject({ code: 400 });
    // murka is agent 2 (residents spawn in tree order).
    await expect(source.send('2', 'do it')).rejects.toMatchObject({
      code: 400,
      message: 'Ask the CEO in the chat to give this cat work',
    });
  });

  it('gates the /api/ceo routes with the token', async () => {
    env = await startDeskOffice(() => ({ text: 'ok' }));
    const { app } = env.server;
    const auth = { authorization: 'Bearer tok' };
    expect(
      (await app.inject({ method: 'POST', url: '/api/ceo/messages', payload: { text: 'hi' } }))
        .statusCode,
    ).toBe(401);
    const sent = await app.inject({
      method: 'POST',
      url: '/api/ceo/messages',
      headers: auth,
      payload: { text: 'hi' },
    });
    expect(sent.statusCode).toBe(202);
    await deskIdle(env.desk);
    const bad = await app.inject({
      method: 'PUT',
      url: '/api/ceo/folder',
      headers: auth,
      payload: { path: '/' },
    });
    expect(bad.statusCode).toBe(400);
    const good = await app.inject({
      method: 'PUT',
      url: '/api/ceo/folder',
      headers: auth,
      payload: { path: env.tmp },
    });
    expect(good.json()).toEqual({ folder: env.tmp });
    const folders = await app.inject({ method: 'GET', url: '/api/ceo/folders', headers: auth });
    expect(folders.json()).toEqual({ folder: env.tmp, recent: [] });
    const stop = await app.inject({ method: 'POST', url: '/api/ceo/stop', headers: auth });
    expect(stop.json()).toEqual({ draft: '' });
    const fresh = await app.inject({ method: 'POST', url: '/api/ceo/new', headers: auth });
    expect(fresh.json().chatId).toMatch(/^c-/);
    expect(env.desk.folder).toBeNull();
  });
});
