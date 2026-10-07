import { describe, expect, it } from 'vitest';

import { Approvals, describeAction } from '../src/orchestrator/approvals.js';
import type { PermissionAsk } from '../src/orchestrator/engineAdapter.js';

const LUNA = { catId: 'murka', name: 'Luna' };

function ask(over: Partial<PermissionAsk> = {}): PermissionAsk {
  return {
    toolName: 'Bash',
    input: { command: 'npm test' },
    canAlwaysAllow: true,
    signal: new AbortController().signal,
    ...over,
  };
}

describe('approval cards', () => {
  it('says what the cat wants in plain words', () => {
    expect(describeAction('Bash', { command: 'npm test' })).toEqual({
      action: 'run a command',
      detail: 'npm test',
    });
    expect(describeAction('Write', { file_path: '/p/a.txt', content: 'x' })).toEqual({
      action: 'create or replace a file',
      detail: '/p/a.txt',
    });
    // Paths under the turn's folders show relative (no long temp paths on the card).
    expect(describeAction('Edit', { file_path: '/p/src/a.ts' }, ['/p']).detail).toBe('src/a.ts');
    expect(describeAction('mcp__slack__send_message', { text: 'hi' }).action).toBe(
      'use send message (slack)',
    );
    expect(describeAction('Odd', {}).action).toBe('use the Odd tool');
  });

  it('opens a card, answers it once, and closes it', async () => {
    const approvals = new Approvals();
    let changes = 0;
    approvals.events.on('change', () => changes++);
    const answer = approvals.ask(LUNA, ask());
    const [card] = approvals.list();
    expect(card).toMatchObject({
      catId: 'murka',
      who: 'Luna',
      action: 'run a command',
      detail: 'npm test',
      canAlwaysAllow: true,
    });
    expect(approvals.answer(card.id, 'always')).toBe(true);
    expect(await answer).toBe('always');
    expect(approvals.list()).toEqual([]);
    expect(approvals.answer(card.id, 'deny')).toBe(false);
    expect(changes).toBe(2);
  });

  it('shows ExitPlanMode as a plan card; a plan choice on another card is a plain answer', async () => {
    const approvals = new Approvals();
    const plan = approvals.ask(
      LUNA,
      ask({ toolName: 'ExitPlanMode', input: { plan: '# Plan\n1. Write', planFilePath: '/p.md' } }),
    );
    const card = approvals.list()[0];
    expect(card).toMatchObject({ plan: '# Plan\n1. Write', detail: '', canAlwaysAllow: false });
    approvals.answer(card.id, { mode: 'acceptEdits' });
    expect(await plan).toEqual({ mode: 'acceptEdits' });

    const bash = approvals.ask(LUNA, ask());
    approvals.answer(approvals.list()[0].id, { mode: 'acceptEdits' });
    expect(await bash).toBe('allow');
    const write = approvals.ask(LUNA, ask({ toolName: 'Write' }));
    approvals.answer(approvals.list()[0].id, { keepPlanning: 'no' });
    expect(await write).toBe('deny');
  });

  it('turns Always allow into Allow when the engine offered no rule', async () => {
    const approvals = new Approvals();
    const answer = approvals.ask(LUNA, ask({ canAlwaysAllow: false }));
    approvals.answer(approvals.list()[0].id, 'always');
    expect(await answer).toBe('allow');
  });

  it('denies a card nobody answers in time, and one whose turn ended', async () => {
    const approvals = new Approvals(20);
    expect(approvals.list()).toEqual([]);
    const late = approvals.ask(LUNA, ask());
    expect(approvals.list()[0].expiresAt).toBeGreaterThan(Date.now() - 1);
    expect(await late).toBe('deny');
    expect(approvals.list()).toEqual([]);

    const turn = new AbortController();
    const cut = new Approvals().ask(LUNA, ask({ signal: turn.signal }));
    turn.abort();
    expect(await cut).toBe('deny');
  });
});
