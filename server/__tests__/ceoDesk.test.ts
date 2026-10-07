import * as fs from 'fs';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import type { CatSessionEntry, CatSessionFrame } from '../../core/src/catSession.js';
import { OfficeCatSource } from '../src/catTerminal/officeCatSource.js';
import { attachmentFile } from '../src/ceoDesk/attachments.js';
import { RESTARTED_TEXT } from '../src/ceoDesk/ceoDesk.js';
import { DESK_RULES } from '../src/ceoDesk/deskPrompt.js';
import { ADOPTED_TEXT } from '../src/ceoDesk/deskStore.js';
import { ClaudeAdapter } from '../src/orchestrator/claudeAdapter.js';
import { officeLimits } from '../src/usageLimits.js';
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
import {
  imageBlock,
  init,
  rateLimit,
  result,
  text,
  thinking,
  toolResult,
  toolUse,
} from './fixtures/sdkLines.js';

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
    // One live process served both messages, like the terminal.
    expect(ceo.sessions).toHaveLength(1);
    expect(first.resume).toBe(false);
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
      lines: [
        init(),
        text('Let me look.'),
        thinking(1500),
        toolUse('t1', 'Read', { file_path: '/tmp/x/README.md' }),
        toolResult('t1', [imageBlock()]),
        text('Asking the team.'),
        // A desk tool's raw input: callTool writes its readable row instead.
        toolUse('d1', 'mcp__desk__list_team', {}),
        text('FULL fin… (cut)'),
        result(),
      ],
    }));
    const frames: CatSessionFrame[] = [];
    env.desk.subscribe((f) => frames.push(f));
    env.desk.send('look');
    await deskIdle(env.desk);
    const rows = env.desk.snapshot().entries;
    expect(rows).toMatchObject([
      { kind: 'user', text: 'look' },
      { kind: 'text', text: 'Let me look.' },
      { kind: 'thought', ms: 1500 },
      { kind: 'tool', name: 'Read', text: '/tmp/x/README.md', images: [{ image: true }] },
      { kind: 'text', text: 'Asking the team.' },
      { kind: 'text', text: 'FULL final answer' },
    ]);
    // `at` marks each row (the dock's unread mark): unique and rising, also on the wire.
    const ats = rows.map((r) => r.at!);
    expect(ats).toEqual([...ats].sort((a, b) => a - b));
    expect(new Set(ats).size).toBe(rows.length);
    const sent = frames.flatMap((f) => (f.type === 'entries' ? f.entries : []));
    expect(sent.map((r) => r.at)).toEqual(ats);
    expect(frames.some((f) => f.type === 'status' && f.status.busy)).toBe(true);
    // The tool's result came later: an update frame replaced its row in place.
    const update = frames.find((f) => f.type === 'update');
    expect(update).toMatchObject({ entry: { kind: 'tool', at: rows[3].at } });
    // The picture is a chat attachment, served by the attachments route.
    const tool = rows[3] as Extract<CatSessionEntry, { kind: 'tool' }>;
    const [, chat, file] = /attachments\/([^/]+)\/(.+)$/.exec(tool.images![0].url)!;
    expect(attachmentFile(env.stateDir, chat, decodeURIComponent(file))?.type).toBe('image/png');
    // Context of the last request, and the subscription limits of every Claude turn.
    expect(env.desk.snapshot().status.context).toEqual({ used: 20909, window: 200000 });
    // Any Claude turn of the office (the adapter feeds officeLimits) updates the dock.
    frames.length = 0;
    officeLimits.observe(rateLimit(0.07, 0.56));
    expect(frames).toMatchObject([
      { type: 'status', status: { limits: { fiveHour: { used: 0.07 }, weekly: { used: 0.56 } } } },
    ]);
  });

  it('Stop interrupts the turn and keeps the live session for the next message', async () => {
    env = await startDeskOffice(({ req }) =>
      req.message.includes('first') ? HANG : { text: `ok ${req.message.slice(-5)}` },
    );
    const { desk, ceo } = env;
    desk.send('first');
    await waitFor(() => (desk.snapshot().status.busy ? true : undefined));
    expect(await desk.stop()).toEqual({ draft: '' });
    expect(ceo.interrupts).toBe(1);
    await deskIdle(desk);
    desk.send('third');
    await deskIdle(desk);
    const rows = desk.snapshot().entries;
    expect(rows).toContainEqual(expect.objectContaining({ kind: 'text', text: 'Stopped.' }));
    expect(texts(rows).at(-1)).toBe('ok third');
    expect(rows.some((e) => e.kind === 'error')).toBe(false);
    expect(ceo.sessions).toHaveLength(1);
    expect(ceo.closes).toBe(0);
  });

  it('a message during a turn goes in at once; Stop gives back one that did not start', async () => {
    env = await startDeskOffice(({ req }) =>
      req.message.includes('first') ? HANG : { text: `ok ${req.message.slice(-5)}` },
    );
    const { desk, ceo } = env;
    desk.send('first');
    await waitFor(() => (desk.snapshot().status.busy ? true : undefined));
    expect(desk.send('second')).toBe(0);
    expect(desk.snapshot().status.queued).toBe(0);
    expect(ceo.turns.map((t) => t.message.slice(-6))).toEqual(['\nfirst', 'second']);
    // The CLI still holds "second": it would run after the interrupt, so the
    // desk closes the process and gives the text back.
    expect(await desk.stop()).toEqual({ draft: 'second' });
    expect(ceo.closes).toBe(1);
    desk.send('third');
    await deskIdle(desk);
    expect(texts(desk.snapshot().entries).at(-1)).toBe('ok third');
    expect(ceo.turns.map((t) => t.message.slice(-5))).toEqual(['first', 'econd', 'third']);
    expect(ceo.sessions).toHaveLength(2);
    expect(ceo.sessions[1]).toMatchObject({ resume: true, sessionId: ceo.sessions[0].sessionId });
  });

  it("shows Claude's suggested next message after the turn; a new message drops it", async () => {
    env = await startDeskOffice(({ req }) => {
      // The SDK sends the suggestion after the result: after the turn ended here.
      setTimeout(() => req.onSuggestion?.('Now add tests'), 20);
      return { text: 'done' };
    });
    const { desk } = env;
    desk.send('fix the bug');
    await deskIdle(desk);
    expect(await waitFor(() => desk.snapshot().status.suggestion)).toBe('Now add tests');
    desk.send('Now add tests');
    expect(desk.snapshot().status.suggestion).toBeUndefined();
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
    expect(env.desk.snapshot().entries.at(-1)).toMatchObject({
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

    const endpoint = JSON.parse(fs.readFileSync(env.ceo.turns[0].mcpConfigFile, 'utf-8'));
    expect(endpoint.name).toBe('desk');
    // The real Claude config names the server `desk`: tool rows read mcp__desk__start_job.
    expect(Object.keys(JSON.parse(new ClaudeAdapter().mcpConfig(endpoint)).mcpServers)).toEqual([
      'desk',
    ]);
    const rows = desk.snapshot().entries;
    const started = rows.findIndex((e) => e.kind === 'tool');
    expect(rows[started]).toMatchObject({
      kind: 'tool',
      name: 'mcp__desk__start_job',
      text: "Gave the job to Oliver's team",
    });
    // The card follows the row that started the job.
    expect(rows[started + 1]).toMatchObject({ kind: 'job', job: { jobId: job.id } });
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
    expect(rows).toContainEqual(expect.objectContaining({ kind: 'error', text: RESTARTED_TEXT }));
    expect(texts(rows).at(-1)).toBe('seen true');
    // The cut first turn may have made the session: the next one starts a fresh id.
    expect(env.ceo.turns[0].resume).toBe(false);
    expect(env.ceo.turns[0].sessionId).not.toBe(state.sessionId);
  });
});

describe('CEO desk jobs across a restart', () => {
  it('keeps a held notice across a restart', async () => {
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
    await waitFor(() => (jobId ? true : undefined), 30_000);
    // A new project while the turn runs: the busy session cannot take the
    // notice (a new folder needs a new process), so it waits in the queue.
    env.desk.setFolder(makeRepo(path.join(tmp, 'repo2')));
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

describe('board migration', () => {
  it('an interrupted task of the old board gets a job card with Resume and Cancel, once', async () => {
    process.env.FAKE_HANG_CAT = 'murka';
    env = await startDeskOffice(() => ({ text: 'ok' }));
    const { tmp, stateDir } = env;
    // The old board: a team task with no chat.
    const board = await env.tasks.create(
      'old board work',
      makeRepo(path.join(tmp, 'repo')),
      'team',
    );
    await waitFor(() => (env!.office.hasPendingTurn('murka') ? true : undefined), 30_000);
    await env.close();
    delete process.env.FAKE_HANG_CAT;
    // A desk saved before this version has no boardAdopted flag.
    const deskFile = path.join(stateDir, 'cat-ceo', 'desk.json');
    const { boardAdopted: _flag, ...saved } = JSON.parse(fs.readFileSync(deskFile, 'utf-8'));
    fs.writeFileSync(deskFile, JSON.stringify(saved));

    env = await startDeskOffice(() => ({ text: 'ok' }), { tmp });
    expect(env.tasks.get(board.id)?.flow?.state).toBe('interrupted');
    const rows = env.desk.snapshot().entries;
    expect(rows.slice(-2)).toMatchObject([
      { kind: 'text', text: ADOPTED_TEXT },
      { kind: 'job', job: { jobId: board.id, state: 'interrupted' } },
    ]);
    expect(env.tasks.chatJobs(saved.chatId).map((t) => t.id)).toEqual([board.id]);
    // A New chat keeps the flag: the next start adds nothing either way.
    env.desk.newChat();
    expect(JSON.parse(fs.readFileSync(deskFile, 'utf-8')).boardAdopted).toBe(true);
    await env.close();
    env = await startDeskOffice(() => ({ text: 'ok' }), { tmp });
    expect(env.desk.snapshot().entries.filter((r) => r.kind === 'job')).toHaveLength(0);
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

  it('streams the desk chat only to a socket with the token', async () => {
    env = await startDeskOffice(() => ({ text: 'ok' }));
    const url = `ws://127.0.0.1:${env.server.port}/api/cat-sessions/cat-ceo/events`;
    const open = (query: string) =>
      new Promise<{ code?: number; frame?: CatSessionFrame }>((resolve) => {
        const socket = new WebSocket(`${url}${query}`);
        socket.on('message', (data) => {
          resolve({ frame: JSON.parse(String(data)) as CatSessionFrame });
          socket.close();
        });
        socket.on('close', (code) => resolve({ code }));
      });
    expect(await open('')).toEqual({ code: 4401 });
    expect(await open('?token=wrong')).toEqual({ code: 4401 });
    expect((await open('?token=tok')).frame).toMatchObject({ type: 'snapshot', title: 'Cat CEO' });
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
    expect(good.json()).toEqual({ folder: env.tmp, git: false });
    const folders = await app.inject({ method: 'GET', url: '/api/ceo/folders', headers: auth });
    expect(folders.json()).toMatchObject({ folder: env.tmp, git: false, recent: [env.tmp] });
    const stop = await app.inject({ method: 'POST', url: '/api/ceo/stop', headers: auth });
    expect(stop.json()).toEqual({ draft: '' });
    const fresh = await app.inject({ method: 'POST', url: '/api/ceo/new', headers: auth });
    expect(fresh.json().chatId).toMatch(/^c-/);
    // The project is the office's: a New chat keeps it.
    expect(env.desk.folder).toBe(env.tmp);
  });
});

describe('CEO desk slash commands', () => {
  it('a slash command goes to Claude Code as typed, in a turn of its own', async () => {
    env = await startDeskOffice(() => ({ text: 'done' }));
    const { desk, ceo } = env;
    desk.send('/compact keep the plan');
    await deskIdle(desk);
    desk.send('hello');
    await deskIdle(desk);
    expect(ceo.turns.map((t) => t.message)).toEqual([
      '/compact keep the plan',
      '[Work folder: none (sandbox)]\n\n[Message from the user]\nhello',
    ]);
  });
});
