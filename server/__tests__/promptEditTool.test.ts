/**
 * Prompt edits from the CEO desk chat (docs/catavasia/cat-ceo-judge.md §15):
 * the desk tool edit_prompts changes one Rules or Lessons item through the
 * review edit checks and commits it as `cat-ceo(<cat>): chat — ...`.
 * list_team with a catId shows the items and their ids.
 */

import * as fs from 'fs';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { itemHistory } from '../src/catCeo/tidyDigest.js';
import { OfficeCatSource } from '../src/catTerminal/officeCatSource.js';
import { chatCommitsLeft, isChatCommit } from '../src/ceoDesk/promptEditTool.js';
import {
  type CeoTurn,
  deskIdle,
  type DeskOffice,
  startDeskOffice,
  type ToolReply,
} from './ceoDeskHarness.js';

let env: DeskOffice | undefined;

afterEach(async () => {
  await env?.close();
  if (env) fs.rmSync(env.tmp, { recursive: true, force: true });
  env = undefined;
});

type Call = [string, Record<string, unknown>];

/** One desk turn that runs `calls` and keeps their replies. */
async function turn(message: string, calls: Call[]): Promise<ToolReply[]> {
  const replies: ToolReply[] = [];
  const script = async ({ call }: CeoTurn) => {
    for (const [name, args] of calls) replies.push(await call(name, args));
    return { text: 'Done.' };
  };
  if (!env) env = await startDeskOffice(script);
  else env.ceo.script = script;
  env.desk.send(message);
  await deskIdle(env.desk);
  return replies;
}

const add = (catId: string, section: string, text: string, dictated: boolean): Call => [
  'edit_prompts',
  { catId, op: 'add', section, text, dictated },
];

const today = () => new Date().toISOString().slice(0, 10);

describe('edit_prompts', () => {
  it('applies an edit like a review edit, with the chat commit and trailers', async () => {
    const [luna, milo] = await turn('Add to Luna\'s rules: "Run npm test before you report."', [
      add('murka', 'Rules', 'Run npm test before you report.', true),
      add('pushok', 'Lessons', 'The e2e suite needs a display.', true),
    ]);
    expect(luna).toMatchObject({ isError: false, text: expect.stringContaining('Applied') });
    expect(milo.isError).toBe(false);
    const { prompts } = env!.office.cats;
    const { chatId } = JSON.parse(
      fs.readFileSync(path.join(env!.stateDir, 'cat-ceo', 'desk.json'), 'utf-8'),
    ) as { chatId: string };
    const rule = prompts.read('murka').file.rules[0];
    expect(rule.id).toBe('R1');
    expect(rule.text).toBe(`Run npm test before you report. (chat ${chatId}, ${today()})`);
    const [commit] = prompts.log('murka');
    expect(commit.subject).toMatch(/^cat-ceo\(murka\): chat — add R1: Run npm test before you/);
    expect(isChatCommit(commit.subject)).toBe(true);
    expect(commit.body).toContain('Prompt-Edit-By: cat-ceo');
    expect(commit.body).toContain(`Prompt-Chat: ${chatId}`);
    expect(commit.body).toContain('Prompt-User-Items: R1');
    // The message did not hold the second item: it is the CEO's, whatever `dictated` said.
    expect(prompts.log('pushok')[0].body).not.toContain('Prompt-User-Items');
    expect(itemHistory('murka', prompts).get('R1')?.owner).toBe('user');
    expect(itemHistory('pushok', prompts).get('L1')?.owner).toBe('cat-ceo');
    // Chat commits leave the review limit alone and use their own.
    expect(env!.office.ceo.commitsLeft('murka')).toBe(2);
    expect(chatCommitsLeft(prompts, 'murka', Date.now())).toBe(9);
    // The chat shows each edit with a Prompt history link.
    const rows = env!.desk.snapshot().entries;
    expect(rows.filter((r) => r.kind === 'edits')).toMatchObject([
      { kind: 'edits', catIds: ['murka'], text: expect.stringContaining('murka: add Rules R1') },
      { kind: 'edits', catIds: ['pushok'] },
    ]);
  });

  it('refuses invalid edits with the reason and commits nothing', async () => {
    const replies = await turn('Change things', [
      add('cat-ceo', 'Rules', 'Be nice.', false),
      add('ghost', 'Rules', 'Boo.', false),
      [
        'edit_prompts',
        { catId: 'murka', op: 'remove', section: 'Rules', itemId: 'R9', dictated: false },
      ],
      add('murka', 'Lessons', 'two\nlines', false),
      add('pushok', 'Lessons', 'Use token ghp_abcdefghijklmnopqrstuvwxyz0123456789 now.', false),
      ['edit_prompts', { catId: 'murka', op: 'rename', section: 'Rules', dictated: false }],
    ]);
    expect(replies.every((r) => r.isError)).toBe(true);
    expect(replies.map((r) => r.text)).toEqual([
      'Not applied: the Cat CEO never edits its own prompt',
      "Not applied: ghost is not in this task's team",
      'Not applied: R9 does not exist',
      'Not applied: text is more than one line',
      'Not applied: text looks like a secret or a private path',
      'op: add, replace or remove',
    ]);
    const { prompts } = env!.office.cats;
    expect(prompts.log('murka').filter((c) => isChatCommit(c.subject))).toEqual([]);
    expect(prompts.read('pushok').file.lessons).toHaveLength(0);
    expect(env!.desk.snapshot().entries.some((r) => r.kind === 'edits')).toBe(false);
  });

  it('list_team with a catId shows its Rules and Lessons with ids', async () => {
    await turn('Add "Lint before you push." to Luna', [
      add('murka', 'Rules', 'Lint before you push.', true),
    ]);
    const [items, unknown] = await turn("What are Luna's rules?", [
      ['list_team', { catId: 'murka' }],
      ['list_team', { catId: 'ghost' }],
    ]);
    expect(items.text).toMatch(/^Luna \(murka\)\nRules:\n- R1: Lint before you push\. \(chat /);
    expect(items.text).toContain('Lessons:\n(none)');
    expect(unknown).toMatchObject({ isError: true, text: expect.stringContaining('Unknown cat') });
  });
});

describe('the old judge chat is gone', () => {
  it("a message to the CEO character's agent id points to the desk chat", async () => {
    env = await startDeskOffice(() => ({ text: 'ok' }));
    const source = new OfficeCatSource(env.office, env.tasks, env.desk);
    const agent = String(env.office.residents.agentFor('cat-ceo'));
    await expect(source.send(agent, 'hi')).rejects.toMatchObject({
      code: 400,
      message: 'Talk to the CEO in the CEO chat on the right',
    });
    expect(env.ceo.turns).toHaveLength(0);
    expect(source.snapshot(agent)!.status.busy).toBe(false);
  });
});
