/**
 * The question card of Claude's AskUserQuestion: the question, its options as
 * buttons, the "Other" field, and the answers in the shape the tool takes.
 */

import assert from 'node:assert/strict';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { test } from 'vitest';

import type { CeoApproval, CeoQuestion } from '../../core/src/ceoDesk.js';
import { questionAnswers, togglePick } from '../src/ceoDesk/approvalState.js';
import { QuestionCard } from '../src/ceoDesk/QuestionCard.js';

const color: CeoQuestion = {
  question: 'Which color?',
  header: 'Color',
  options: [
    { label: 'Red', description: 'warm' },
    { label: 'Blue', description: 'cool' },
  ],
  multiSelect: false,
};
const parts: CeoQuestion = { ...color, question: 'Which parts?', multiSelect: true };

test('the card shows the question, the options as buttons, Other, Send answer and Skip', () => {
  const approval: CeoApproval = {
    id: 'q1',
    catId: 'cat-ceo',
    who: 'Cat CEO',
    action: 'ask you a question',
    detail: '',
    canAlwaysAllow: false,
    expiresAt: 0,
    questions: [color],
  };
  const html = renderToStaticMarkup(createElement(QuestionCard, { approval, questions: [color] }));
  assert.match(html, /Cat CEO<\/span> asks you/);
  assert.match(html, /Which color\?/);
  assert.match(html, /aria-pressed="false"[^>]*data-testid="question-option"[^]*Red[^]*warm/);
  assert.match(html, /placeholder="Other: type your own answer"/);
  // Nothing picked yet: Send answer waits.
  assert.match(html, /disabled=""[^>]*data-testid="question-send"/);
  assert.match(html, /data-testid="question-skip"/);
});

test('one pick replaces the other; a multi-select toggles in option order', () => {
  const none = { picked: [], other: '' };
  assert.deepEqual(togglePick(color, { picked: ['Red'], other: 'x' }, 'Blue'), {
    picked: ['Blue'],
    other: '',
  });
  const both = togglePick(parts, togglePick(parts, none, 'Blue'), 'Red');
  assert.deepEqual(both.picked, ['Red', 'Blue']);
  assert.deepEqual(togglePick(parts, both, 'Red').picked, ['Blue']);
});

test('answers: question text -> picks comma-separated, Other last; null while one is open', () => {
  assert.equal(
    questionAnswers(
      [color, parts],
      [
        { picked: ['Red'], other: '' },
        { picked: [], other: '' },
      ],
    ),
    null,
  );
  assert.deepEqual(
    questionAnswers(
      [color, parts],
      [
        { picked: [], other: ' green ' },
        { picked: ['Red', 'Blue'], other: 'gold' },
      ],
    ),
    { 'Which color?': 'green', 'Which parts?': 'Red, Blue, gold' },
  );
});
