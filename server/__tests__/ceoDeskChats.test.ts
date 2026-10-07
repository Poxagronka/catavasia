import * as fs from 'fs';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NO_MEMORY_NOTE, OTHER_FOLDER_NOTE, titleFrom } from '../src/ceoDesk/chatHistory.js';
import { waitFor } from './catOfficeHarness.js';
import { deskIdle, type DeskOffice, HANG, makeRepo, startDeskOffice } from './ceoDeskHarness.js';

// Claude Code's own session title (getSessionInfo): set per test.
const sdkTitle = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  getSessionInfo: async () => (sdkTitle.value ? { customTitle: sdkTitle.value } : undefined),
}));

let env: DeskOffice | undefined;

afterEach(async () => {
  await env?.close();
  if (env) fs.rmSync(env.tmp, { recursive: true, force: true });
  env = undefined;
  sdkTitle.value = undefined;
});

const chatsDir = (stateDir: string) => path.join(stateDir, 'cat-ceo', 'chats');

describe('chat titles', () => {
  it('cuts the first message to one plain line at a word', () => {
    expect(titleFrom('  Fix the\n\nlogin   page ')).toBe('Fix the login page');
    const long = titleFrom('Please write a short story about a cat who runs a small bakery');
    expect(long).toBe('Please write a short story about a cat…');
    expect(long.length).toBeLessThanOrEqual(41);
  });

  it('names the chat from its first message; the user renames it', async () => {
    env = await startDeskOffice(() => ({ text: 'ok' }));
    const { desk } = env;
    expect(desk.snapshot().status.chat).toMatchObject({ title: '' });
    desk.send('Plan the launch party\nwith cake');
    desk.send('second message');
    await deskIdle(desk);
    const { id, title } = desk.snapshot().status.chat!;
    expect(title).toBe('Plan the launch party with cake');
    expect(desk.chats.rename(id, '  Party  ')).toBe(true);
    expect(desk.snapshot().status.chat).toEqual({ id, title: 'Party' });
    expect(desk.chats.list()).toEqual([expect.objectContaining({ id, title: 'Party' })]);
  });

  it("takes Claude Code's title after the reply; a user's name wins over it", async () => {
    sdkTitle.value = 'Launch party plan';
    env = await startDeskOffice(() => ({ text: 'ok' }));
    const { desk } = env;
    desk.send('plan the launch party with cake and music');
    await deskIdle(desk);
    await waitFor(() =>
      desk.snapshot().status.chat?.title === 'Launch party plan' ? true : undefined,
    );
    const { id } = desk.snapshot().status.chat!;
    desk.chats.rename(id, 'Mine');
    sdkTitle.value = 'Another title';
    desk.send('more');
    await deskIdle(desk);
    await new Promise((r) => setTimeout(r, 50));
    expect(desk.snapshot().status.chat?.title).toBe('Mine');
  });
});

describe('chat history', () => {
  it('lists chats newest first, an old archived chat too; opening one resumes its session', async () => {
    env = await startDeskOffice(() => ({ text: 'ok' }), {
      // A chat archived before the history existed: rows only, no index entry.
      seed: (stateDir) => {
        fs.mkdirSync(chatsDir(stateDir), { recursive: true });
        fs.writeFileSync(
          path.join(chatsDir(stateDir), 'c-0ld0ld00.json'),
          JSON.stringify({
            version: 2,
            rows: [
              { kind: 'user', text: 'An old question', at: 1000 },
              { kind: 'text', text: 'An old answer', at: 1001 },
            ],
          }),
        );
      },
    });
    const { desk, ceo } = env;
    desk.send('first chat');
    await deskIdle(desk);
    const first = desk.snapshot().status.chat!.id;
    desk.newChat();
    desk.send('second chat');
    await deskIdle(desk);
    const second = desk.snapshot().status.chat!.id;

    expect(desk.chats.list().map((c) => [c.id, c.title])).toEqual([
      [second, 'second chat'],
      [first, 'first chat'],
      ['c-0ld0ld00', 'An old question'],
    ]);

    expect(desk.chats.open(first)).toBe(true);
    const snap = desk.snapshot();
    expect(snap.status.chat).toEqual({ id: first, title: 'first chat' });
    expect(snap.entries.map((e) => e.kind)).toEqual(['user', 'text']);
    desk.send('and more');
    await deskIdle(desk);
    const [one, , three] = ceo.turns;
    expect(three.resume).toBe(true);
    expect(three.sessionId).toBe(one.sessionId);
    expect(three.cwd).toBe(one.cwd);
    // The second chat stays in the list with its own title.
    expect(desk.chats.list().map((c) => c.title)).toEqual([
      'first chat',
      'second chat',
      'An old question',
    ]);
  });

  it('an old chat without a session, or from another project, says the next message starts fresh', async () => {
    env = await startDeskOffice(() => ({ text: 'ok' }), {
      seed: (stateDir) => {
        fs.mkdirSync(chatsDir(stateDir), { recursive: true });
        fs.writeFileSync(
          path.join(chatsDir(stateDir), 'c-0ld0ld00.json'),
          JSON.stringify({ version: 2, rows: [{ kind: 'user', text: 'old', at: 1000 }] }),
        );
      },
    });
    const { desk, ceo, tmp } = env;
    desk.chats.open('c-0ld0ld00');
    expect(desk.snapshot().entries.at(-1)).toEqual(
      expect.objectContaining({ kind: 'note', text: NO_MEMORY_NOTE }),
    );
    desk.send('hello again');
    await deskIdle(desk);
    expect(ceo.turns[0].resume).toBe(false);

    // The chat answered in the sandbox; now the office has a project.
    desk.newChat();
    desk.setFolder(makeRepo(path.join(tmp, 'site')));
    desk.chats.open('c-0ld0ld00');
    expect(desk.snapshot().entries.at(-1)).toEqual(
      expect.objectContaining({ kind: 'note', text: OTHER_FOLDER_NOTE }),
    );
    // Opening it again does not repeat the note.
    desk.newChat();
    desk.chats.open('c-0ld0ld00');
    expect(desk.snapshot().entries.filter((e) => e.kind === 'note')).toHaveLength(2);
    desk.send('in the project');
    await deskIdle(desk);
    const last = ceo.turns.at(-1)!;
    expect(last.resume).toBe(false);
    expect(last.sessionId).not.toBe(ceo.turns[0].sessionId);
    expect(last.cwd).toBe(path.join(tmp, 'site'));
  });

  it('opening another chat stops the running answer in its own chat', async () => {
    env = await startDeskOffice(({ req }) =>
      req.message.includes('slow') ? HANG : { text: 'ok' },
    );
    const { desk } = env;
    desk.send('quick');
    await deskIdle(desk);
    const quick = desk.snapshot().status.chat!.id;
    desk.newChat();
    desk.send('slow one');
    await waitFor(() => (desk.snapshot().status.busy ? true : undefined));
    const slow = desk.snapshot().status.chat!.id;
    desk.chats.open(quick);
    await deskIdle(desk);
    desk.chats.open(slow);
    // The cut first turn left no session to resume: the note says so.
    expect(desk.snapshot().entries.map((e) => ('text' in e ? e.text : e.kind))).toEqual([
      'slow one',
      'Stopped.',
      NO_MEMORY_NOTE,
    ]);
  });

  it('a killed turn does not touch its chat when the user opens it again at once', async () => {
    env = await startDeskOffice(({ req }) =>
      req.message.includes('slow') ? HANG : { text: 'ok' },
    );
    const { desk, ceo } = env;
    desk.send('quick');
    await deskIdle(desk);
    const quick = desk.snapshot().status.chat!.id;
    desk.newChat();
    desk.send('slow one');
    await waitFor(() => (desk.snapshot().status.busy ? true : undefined));
    const slow = desk.snapshot().status.chat!.id;
    desk.chats.open(quick);
    desk.chats.open(slow); // before the killed turn has ended
    await deskIdle(desk);
    desk.send('again');
    await deskIdle(desk);
    // The cut first turn left no session: the next turn starts a new one.
    const last = ceo.turns.at(-1)!;
    expect(last.resume).toBe(false);
    expect(last.sessionId).not.toBe(ceo.turns[1].sessionId);
  });

  it('deletes a chat with its files; deleting the open chat starts a new one', async () => {
    env = await startDeskOffice(() => ({ text: 'ok' }));
    const { desk, stateDir } = env;
    desk.send('to delete');
    await deskIdle(desk);
    const gone = desk.snapshot().status.chat!.id;
    fs.mkdirSync(path.join(chatsDir(stateDir), gone, 'attachments'), { recursive: true });
    desk.newChat();
    desk.send('to keep');
    await deskIdle(desk);
    const kept = desk.snapshot().status.chat!.id;

    expect(desk.chats.remove(gone)).toBe(true);
    expect(fs.existsSync(path.join(chatsDir(stateDir), `${gone}.json`))).toBe(false);
    expect(fs.existsSync(path.join(chatsDir(stateDir), gone))).toBe(false);
    expect(desk.chats.list().map((c) => c.id)).toEqual([kept]);
    expect(desk.chats.remove(gone)).toBe(false);
    expect(desk.chats.open(gone)).toBe(false);

    expect(desk.chats.remove(kept)).toBe(true);
    expect(desk.snapshot().status.chat?.id).not.toBe(kept);
    expect(desk.snapshot().entries).toEqual([]);
    expect(desk.chats.list()).toEqual([]);
  });

  it('serves the chat routes with the token; a bad id is refused', async () => {
    env = await startDeskOffice(() => ({ text: 'ok' }));
    const { desk, server } = env;
    desk.send('over http');
    await deskIdle(desk);
    const id = desk.snapshot().status.chat!.id;
    const base = `http://127.0.0.1:${server.port}/api/ceo/chats`;
    const bearer = { Authorization: 'Bearer tok' };
    const auth = { ...bearer, 'Content-Type': 'application/json' };
    expect((await fetch(base)).status).toBe(401);
    const list = (await (await fetch(base, { headers: auth })).json()) as { chats: unknown[] };
    expect(list.chats).toEqual([expect.objectContaining({ id, title: 'over http' })]);
    const rename = (title: string, at = id) =>
      fetch(`${base}/${at}`, { method: 'PUT', headers: auth, body: JSON.stringify({ title }) });
    expect((await rename('Renamed')).status).toBe(200);
    expect((await rename('   ')).status).toBe(400);
    expect((await rename('x', '..%2Fevil')).status).toBe(400);
    expect((await rename('x', 'c-nothere')).status).toBe(404);
    expect(desk.snapshot().status.chat?.title).toBe('Renamed');
    const open = await fetch(`${base}/c-nothere/open`, { method: 'POST', headers: bearer });
    expect(open.status).toBe(404);
    const del = await fetch(`${base}/${id}`, { method: 'DELETE', headers: bearer });
    expect(del.status).toBe(200);
    expect(desk.chats.list()).toEqual([]);
  });
});
