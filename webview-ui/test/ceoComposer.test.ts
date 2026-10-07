/**
 * The CEO composer basics from the terminal: the Shift+Tab mode cycle, the
 * plan card's answers, the Up arrow history, and the `@` mention.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import type { CatSessionEntry } from '../../core/src/catSession.js';
import type { PermissionMode } from '../../core/src/messages.js';
import {
  nextMode,
  PERMISSION_MODE_LABELS,
  PERMISSION_MODES,
} from '../../core/src/permissionModes.js';
import { planAnswer } from '../src/ceoDesk/approvalState.js';
import {
  type HistoryState,
  historyStep,
  NOT_BROWSING,
  sentMessages,
} from '../src/ceoDesk/useComposerHistory.js';
import { insertMention, mentionQuery } from '../src/ceoDesk/useMentionMenu.js';

test('the dock offers Accept edits and Plan mode, with the CLI names', () => {
  assert.deepEqual(PERMISSION_MODES, ['auto', 'ask', 'acceptEdits', 'plan', 'bypass', 'readOnly']);
  assert.equal(PERMISSION_MODE_LABELS.acceptEdits, 'Accept edits');
  assert.equal(PERMISSION_MODE_LABELS.plan, 'Plan mode');
});

test("Shift+Tab cycles in the CLI's order, then Auto; Bypass and Read only are never next", () => {
  const walk = (from: PermissionMode, model: string, steps: number) => {
    const seen: PermissionMode[] = [];
    let mode = from;
    for (let n = 0; n < steps; n++) seen.push((mode = nextMode(mode, model)));
    return seen;
  };
  assert.deepEqual(walk('ask', 'opus', 4), ['acceptEdits', 'plan', 'auto', 'ask']);
  // A model without Auto skips it.
  assert.deepEqual(walk('ask', 'haiku', 3), ['acceptEdits', 'plan', 'ask']);
  assert.equal(nextMode('bypass', 'opus'), 'ask');
  assert.equal(nextMode('readOnly', 'opus'), 'ask');
  assert.equal(nextMode('auto', 'haiku'), 'ask');
});

test('each plan choice is its wire answer: Approve with the mode, Keep planning with the words', () => {
  assert.deepEqual(planAnswer('acceptEdits', 'ignored'), { answer: 'allow', mode: 'acceptEdits' });
  assert.deepEqual(planAnswer('ask', ''), { answer: 'allow', mode: 'ask' });
  assert.deepEqual(planAnswer('keepPlanning', '  Add tests '), {
    answer: 'deny',
    feedback: 'Add tests',
  });
  assert.deepEqual(planAnswer('keepPlanning', ''), { answer: 'deny', feedback: '' });
});

test('sentMessages: the user rows of the chat, newest first', () => {
  const entries: CatSessionEntry[] = [
    { kind: 'user', text: 'one' },
    { kind: 'text', text: 'reply' },
    { kind: 'user', text: '/compact' },
    { kind: 'user', text: '' },
  ];
  assert.deepEqual(sentMessages(entries), ['/compact', 'one']);
});

test('the arrows walk the sent messages and give back the draft', () => {
  const sent = ['newest', 'older\nsecond line', 'oldest'];
  let at: HistoryState = NOT_BROWSING;
  let draft = 'my draft';
  const press = (key: 'ArrowUp' | 'ArrowDown', caret = 0) => {
    const next = historyStep(sent, at, key, draft, caret);
    if (next) ({ at, draft } = next);
    return next !== null;
  };
  assert.equal(press('ArrowDown'), false, 'Down does nothing before Up');
  assert.equal(press('ArrowUp'), true);
  assert.equal(draft, 'newest');
  // A recalled message with two lines: Up still walks on.
  press('ArrowUp');
  assert.equal(draft, 'older\nsecond line');
  press('ArrowUp', sent[1].length);
  assert.equal(draft, 'oldest');
  assert.equal(press('ArrowUp'), false, 'no message is older');
  press('ArrowDown');
  press('ArrowDown');
  press('ArrowDown');
  assert.equal(draft, 'my draft');
  assert.deepEqual(at, { index: -1, saved: 'my draft' });
});

test('Up on the second line of the draft moves the caret, not the history', () => {
  const draft = 'line one\nline two';
  assert.equal(historyStep(['x'], NOT_BROWSING, 'ArrowUp', draft, draft.length), null);
  assert.equal(historyStep(['x'], NOT_BROWSING, 'ArrowUp', draft, 3)?.draft, 'x');
  assert.equal(historyStep([], NOT_BROWSING, 'ArrowUp', '', 0), null);
});

test('mentionQuery: an `@` word at the caret; never an e-mail address', () => {
  assert.deepEqual(mentionQuery('@', 1), { start: 0, query: '' });
  assert.deepEqual(mentionQuery('look at @src/ma', 15), { start: 8, query: 'src/ma' });
  assert.deepEqual(mentionQuery('look at @src/ma and more', 15), { start: 8, query: 'src/ma' });
  assert.equal(mentionQuery('mail me@example.com', 19), null);
  assert.equal(mentionQuery('@done then', 10), null);
});

test('insertMention: `@path ` takes the place of the typed mention', () => {
  assert.deepEqual(insertMention('look at @ma and more', 8, 11, 'src/main.ts'), {
    text: 'look at @src/main.ts  and more',
    caret: 21,
  });
});
