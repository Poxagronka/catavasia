import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type DeskRow, DeskStore, LEGACY_DIVIDER } from '../src/ceoDesk/deskStore.js';
import { CEO_DESK_HISTORY_MAX } from '../src/constants.js';

let tmp: string;
let dir: string;

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pa-desk-store-')));
  dir = path.join(tmp, 'cat-ceo');
});

afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('CEO desk store', () => {
  it('starts a first chat with the judge chat rows (version 1) under a divider', () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'chat.json'),
      JSON.stringify({
        version: 1,
        messages: [
          { kind: 'user', text: 'old question', at: 5 },
          { kind: 'text', text: 'old answer', at: 6 },
          { kind: 'edits', text: 'Prompt edits applied', catIds: ['murka'], at: 7 },
          null,
        ],
      }),
    );
    const store = new DeskStore(dir);
    const state = store.load(100);
    expect(state).toMatchObject({ version: 2, started: false, folder: null, liveJobs: [] });
    expect(state.chatId).toMatch(/^c-[0-9a-f]{8}$/);
    expect(state.mcpToken).toHaveLength(48);
    expect(store.readHistory(state.chatId)).toEqual([
      { kind: 'text', text: LEGACY_DIVIDER, at: 100 },
      { kind: 'user', text: 'old question', at: 5 },
      { kind: 'text', text: 'old answer', at: 6 },
    ]);
    // The old file stays as it was: it is only read once.
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'chat.json'), 'utf-8')).version).toBe(1);
    // A second load keeps the same chat and does not import again.
    const again = new DeskStore(dir).load(200);
    expect(again.chatId).toBe(state.chatId);
    expect(store.readHistory(state.chatId)).toHaveLength(3);
  });

  it('keeps the newest rows by count, never cutting text', () => {
    const store = new DeskStore(dir);
    const { chatId } = store.load(1);
    const long = 'x'.repeat(100_000);
    const rows: DeskRow[] = Array.from({ length: CEO_DESK_HISTORY_MAX + 5 }, (_, i) => ({
      kind: 'text',
      text: i === CEO_DESK_HISTORY_MAX + 4 ? long : `row ${i}`,
      at: i,
    }));
    store.writeHistory(chatId, rows);
    const read = store.readHistory(chatId);
    expect(read).toHaveLength(CEO_DESK_HISTORY_MAX);
    expect(read[0]).toMatchObject({ text: 'row 5' });
    expect(read.at(-1)).toMatchObject({ text: long });
  });

  it('keeps archived chats however old: only the user deletes a chat (chat history)', () => {
    const store = new DeskStore(dir);
    store.load(Date.now());
    const old = path.join(store.chatsDir, 'c-old');
    fs.mkdirSync(path.join(old, 'attachments'), { recursive: true });
    fs.writeFileSync(`${old}.json`, '{}');
    const past = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    for (const p of [old, `${old}.json`]) fs.utimesSync(p, past, past);
    new DeskStore(dir).load(Date.now());
    expect(fs.existsSync(old)).toBe(true);
    expect(fs.existsSync(`${old}.json`)).toBe(true);
  });
});
