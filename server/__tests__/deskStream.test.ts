import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CatSessionEntry, ContextUse } from '../../core/src/catSession.js';
import type { DeskRow } from '../src/ceoDesk/deskStore.js';
import { DeskStream, TOOL_RESULT_MAX_CHARS, type ToolImage } from '../src/ceoDesk/deskStream.js';
import { relativePaths } from '../src/taskBoard/streamJson.js';
import {
  imageBlock,
  init,
  RED_PNG,
  result,
  text,
  textDelta,
  textStart,
  thinking,
  toolResult,
  toolUse,
} from './fixtures/sdkLines.js';

const PROJECT = '/Users/me/site';

function harness(last?: ContextUse) {
  const rows: DeskRow[] = [];
  const contexts: ContextUse[] = [];
  const saved: ToolImage[][] = [];
  const drafts: string[] = [];
  let at = 0;
  const stream = new DeskStream(
    {
      add: (entry: CatSessionEntry) => {
        const row = { ...entry, at: ++at } as DeskRow;
        rows.push(row);
        return row;
      },
      update: (row) => {
        rows[rows.findIndex((r) => r.at === row.at)] = row;
      },
      saveImages: (images) => {
        saved.push(images);
        return images.map((_, n) => ({
          name: 'picture',
          size: 75,
          image: true,
          url: `/api/ceo/attachments/c-1/${n}-picture.png`,
        }));
      },
      context: (use) => contexts.push(use),
      draft: (t) => drafts.push(t),
      folders: [PROJECT],
    },
    last,
  );
  return { stream, rows, contexts, saved, drafts };
}

describe('desk stream rows', () => {
  it('a turn that reads a PNG: thought, tool row with the picture, held reply, context', () => {
    const { stream, rows, contexts, saved } = harness();
    for (const l of [
      init(),
      thinking(2848),
      toolUse('t1', 'Read', { file_path: `${PROJECT}/red.png` }),
      toolResult('t1', [imageBlock()]),
      text('Red.'),
      result(),
    ])
      stream.line(l);
    expect(rows).toMatchObject([
      { kind: 'thought', ms: 2848 },
      {
        kind: 'tool',
        name: 'Read',
        text: 'red.png',
        images: [{ url: '/api/ceo/attachments/c-1/0-picture.png' }],
      },
    ]);
    expect(saved).toEqual([[{ mediaType: 'image/png', data: RED_PNG }]]);
    // The reply waits: the turn's final text replaces it.
    expect(stream.held).toBe('Red.');
    expect(contexts.at(-1)).toEqual({ used: 20909, window: 200000 });
  });

  it('keeps the full input and a cut result; an error marks the row', () => {
    const { stream, rows } = harness();
    stream.line(toolUse('t1', 'Bash', { command: `ls ${PROJECT}/src`, description: 'List' }));
    stream.line(toolResult('t2', 'unknown id'));
    stream.line(toolResult('t1', 'x'.repeat(TOOL_RESULT_MAX_CHARS + 50), true));
    expect(rows).toHaveLength(1);
    const row = rows[0] as Extract<DeskRow, { kind: 'tool' }>;
    // The description is the call's plain line; the command its detail.
    expect(row).toMatchObject({ text: 'ls src', about: 'List' });
    expect(row.input).toBeUndefined();
    expect(row.result).toHaveLength(TOOL_RESULT_MAX_CHARS + 1);
    expect(row.isError).toBe(true);
  });

  it('text before a tool goes first; desk tools and helper threads add no rows', () => {
    const { stream, rows } = harness();
    stream.line(text('Let me look.'));
    stream.line(toolUse('d1', 'mcp__desk__start_job', { task: 'x' }));
    stream.line(toolResult('h1', 'from a helper', false, 'toolu_parent'));
    stream.line(text('Done.'));
    expect(rows).toMatchObject([{ kind: 'text', text: 'Let me look.' }]);
    expect(stream.held).toBe('Done.');
  });

  it('the window is the smaller of the model window and 200K', () => {
    const { stream, contexts } = harness({ used: 5, window: 150000 });
    stream.line(init('claude-opus-x'));
    stream.line(text('hi'));
    expect(contexts.at(-1)).toEqual({ used: 20909, window: 150000 });
    stream.line(result(1000000, 'claude-opus-x'));
    expect(contexts.at(-1)).toEqual({ used: 20909, window: 200000 });
  });
});

describe('live reply text', () => {
  afterEach(() => vi.useRealTimers());

  it('sends the growing text at most every 50 ms, then the whole block', () => {
    vi.useFakeTimers({ now: 1000 });
    const { stream, rows, drafts } = harness();
    stream.line(textStart());
    stream.line(textDelta('Hel'));
    stream.line(textDelta('lo'));
    vi.advanceTimersByTime(60);
    stream.line(textDelta(' wor'));
    expect(drafts).toEqual(['Hel', 'Hello wor']);
    // The finished block carries the whole text, even the deltas the throttle held back.
    stream.line(text('Hello world.'));
    expect(drafts.at(-1)).toBe('Hello world.');
    expect(rows).toEqual([]);
    expect(stream.held).toBe('Hello world.');
  });

  it('a new text block puts the previous text in its row first; helpers stream nothing', () => {
    const { stream, rows, drafts } = harness();
    stream.line(textStart());
    stream.line(textDelta('One.'));
    stream.line(text('One.'));
    stream.line(textStart());
    expect(rows).toMatchObject([{ kind: 'text', text: 'One.' }]);
    stream.line(textDelta('from a helper', 'toolu_parent'));
    expect(drafts).toEqual(['One.', 'One.']);
  });

  it('without partial messages the reply only waits (no draft)', () => {
    const { stream, drafts } = harness();
    stream.line(text('Red.'));
    expect(drafts).toEqual([]);
  });
});

describe('relative paths', () => {
  it('drops the project folder and shows the home folder as ~', () => {
    expect(
      relativePaths(
        `cat ${PROJECT}/a.ts /Users/me/x; ls ${PROJECT} ${PROJECT}-old`,
        [PROJECT],
        '/Users/me',
      ),
    ).toBe('cat a.ts ~/x; ls site ~/site-old');
    expect(relativePaths('C:\\p\\a.ts', ['C:\\p'], undefined)).toBe('a.ts');
    expect(relativePaths('/private/var/t/a.png', ['/var/t', '/private/var/t'], undefined)).toBe(
      'a.png',
    );
  });
});
