import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { CEO_IMAGE_MAX_BYTES } from '../../core/src/ceoDesk.js';
import { attachmentFile, saveAttachments } from '../src/ceoDesk/attachments.js';
import { deskIdle, type DeskOffice, startDeskOffice } from './ceoDeskHarness.js';

const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(24, 1)]);
const JPEG = Buffer.concat([Buffer.from('ffd8ffe0', 'hex'), Buffer.alloc(24, 2)]);
const b64 = (b: Buffer) => b.toString('base64');
const upload = (name: string, data: Buffer, type = '') => ({ name, type, data: b64(data) });

let tmp: string | undefined;
let env: DeskOffice | undefined;

afterEach(async () => {
  await env?.close();
  if (env) fs.rmSync(env.tmp, { recursive: true, force: true });
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  env = undefined;
  tmp = undefined;
});

function chatDir(): string {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pa-attach-')));
  return path.join(tmp, 'cat-ceo', 'chats', 'c-ab12');
}

describe('saveAttachments', () => {
  it('saves images by their bytes and files as paths for the CEO', () => {
    const dir = chatDir();
    const saved = saveAttachments(dir, 'c-ab12', [
      upload('shot.png', PNG, 'image/png'),
      upload('photo', JPEG),
      upload('fake.png', Buffer.from('not an image'), 'image/png'),
      upload('../../etc/passwd', Buffer.from('root')),
    ]);
    if ('error' in saved) throw new Error(saved.error);
    expect(saved.attachments.map((a) => [a.name, a.image])).toEqual([
      ['shot.png', true],
      ['photo', true],
      ['fake.png', false],
      ['../../etc/passwd', false],
    ]);
    expect(saved.images).toHaveLength(2);
    expect(saved.images[1]).toMatch(/-photo\.jpg$/);
    for (const file of saved.images) expect(path.dirname(file)).toBe(path.join(dir, 'attachments'));
    expect(fs.readdirSync(path.join(dir, 'attachments'))).toHaveLength(4);
    expect(saved.lines[0]).toMatch(/^\[Attached image: \/.+-shot\.png \(shot\.png, 32 B\)\]$/);
    expect(saved.lines[3]).toMatch(/^\[Attached file: \/.+attachments\/[0-9a-f]{8}-passwd \(/);
    expect(saved.attachments[0].url).toMatch(
      /^\/api\/ceo\/attachments\/c-ab12\/[0-9a-f]{8}-shot\.png$/,
    );
  });

  it('refuses too many files, a big image and a big message, and saves nothing', () => {
    const dir = chatDir();
    const many = Array.from({ length: 9 }, (_, n) => upload(`f${n}.txt`, Buffer.from('x')));
    expect(saveAttachments(dir, 'c-ab12', many)).toEqual({
      error: 'At most 8 files per message',
    });
    const bigImage = Buffer.concat([PNG, Buffer.alloc(CEO_IMAGE_MAX_BYTES)]);
    expect(saveAttachments(dir, 'c-ab12', [upload('big.png', bigImage)])).toEqual({
      error: 'big.png is 5.0 MB: an image can be at most 5.0 MB',
    });
    // A file that is not an image may be bigger than 5 MB, within the 25 MB total.
    const sixMb = Buffer.alloc(6 * 1024 * 1024);
    expect('error' in saveAttachments(dir, 'c-ab12', [upload('log.txt', sixMb)])).toBe(false);
    const five = Array.from({ length: 5 }, (_, n) => upload(`f${n}.bin`, sixMb));
    expect(saveAttachments(dir, 'c-ab12', five)).toEqual({
      error: 'The files are 30.0 MB: at most 25.0 MB per message',
    });
    expect(fs.readdirSync(path.join(dir, 'attachments'))).toHaveLength(1);
  });
});

describe('attachmentFile', () => {
  it('serves only stored names inside the chat folder', () => {
    const dir = chatDir();
    const saved = saveAttachments(dir, 'c-ab12', [upload('a.png', PNG), upload('b.html', PNG)]);
    if ('error' in saved) throw new Error(saved.error);
    const stateDir = tmp as string;
    const [png, html] = saved.images.map((f) => path.basename(f));
    expect(attachmentFile(stateDir, 'c-ab12', png)).toEqual({
      path: path.join(dir, 'attachments', png),
      type: 'image/png',
    });
    // The stored extension follows the bytes: an image named .html is served as an image.
    expect(html).toMatch(/\.html\.png$/);
    for (const [chat, file] of [
      ['c-ab12', '..'],
      ['c-ab12', '../desk.json'],
      ['c-ab12', 'a/b'],
      ['c-ab12', '.hidden'],
      ['c-ab12', 'missing.png'],
      ['../c-ab12', png],
      ['c-zz', png],
    ])
      expect(attachmentFile(stateDir, chat, file)).toBeNull();
  });
});

describe('desk messages with attachments', () => {
  it('sends images as blocks and files as paths; the row shows them; the route serves them', async () => {
    env = await startDeskOffice(() => ({ text: 'seen' }));
    const { app } = env.server;
    const auth = { authorization: 'Bearer tok' };
    const sent = await app.inject({
      method: 'POST',
      url: '/api/ceo/messages',
      headers: auth,
      payload: {
        text: '',
        attachments: [upload('red.png', PNG, 'image/png'), upload('notes.md', Buffer.from('# hi'))],
      },
    });
    expect(sent.statusCode).toBe(202);
    await deskIdle(env.desk);
    const req = env.ceo.turns[0];
    expect(req.images).toHaveLength(1);
    expect(req.message).toMatch(/\[Message from the user\]\n\[Attached image: .+red\.png/);
    expect(req.message).toMatch(/\[Attached file: .+-notes\.md \(notes\.md, 4 B\)\]/);
    const row = env.desk.snapshot().entries[0];
    expect(row).toMatchObject({ kind: 'user', text: '', attachments: [{ name: 'red.png' }, {}] });
    const url = (row as { attachments: Array<{ url: string }> }).attachments[0].url;
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401);
    const got = await app.inject({ method: 'GET', url: `${url}?token=tok` });
    expect(got.statusCode).toBe(200);
    expect(got.headers['content-type']).toBe('image/png');
    expect(got.rawPayload.equals(PNG)).toBe(true);
    const sneaky = await app.inject({
      method: 'GET',
      url: '/api/ceo/attachments/c-ab12/..%2F..%2Fdesk.json?token=tok',
    });
    expect(sneaky.statusCode).toBe(404);
  });

  it('refuses an empty message and a big image with the reason', async () => {
    env = await startDeskOffice(() => ({ text: 'ok' }));
    const { app } = env.server;
    const auth = { authorization: 'Bearer tok' };
    const empty = await app.inject({
      method: 'POST',
      url: '/api/ceo/messages',
      headers: auth,
      payload: { text: '  ' },
    });
    expect(empty.json()).toEqual({ error: 'Message is empty' });
    const big = await app.inject({
      method: 'POST',
      url: '/api/ceo/messages',
      headers: auth,
      payload: {
        text: 'look',
        attachments: [upload('big.png', Buffer.concat([PNG, Buffer.alloc(CEO_IMAGE_MAX_BYTES)]))],
      },
    });
    expect(big.statusCode).toBe(400);
    expect(big.json().error).toMatch(/^big\.png is 5\.0 MB/);
    expect(env.ceo.turns).toHaveLength(0);
  });

  it('gives the turn the folder, no edit tools, a budget and the user MCP servers', async () => {
    env = await startDeskOffice(() => ({ text: 'ok' }));
    env.desk.send('hi');
    await deskIdle(env.desk);
    env.desk.setFolder(env.tmp);
    env.desk.send('again');
    await deskIdle(env.desk);
    const [first, second] = env.ceo.turns;
    expect(first.userMcp).toBe(true);
    expect(first.images).toEqual([]);
    expect(first.extraArgs).toEqual([
      '--disallowedTools',
      'Edit,Write,NotebookEdit',
      '--max-budget-usd',
      '5',
    ]);
    expect(second.extraArgs?.slice(0, 2)).toEqual(['--add-dir', env.tmp]);
  });

  it('marks an auth error row so the chat offers Log in', async () => {
    env = await startDeskOffice(() => ({ ok: false, error: 'Not logged in' }));
    env.desk.send('hi');
    await deskIdle(env.desk);
    expect(env.desk.snapshot().entries.at(-1)).toMatchObject({ kind: 'error', login: true });
  });
});
