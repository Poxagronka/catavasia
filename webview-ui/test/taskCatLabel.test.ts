/**
 * Task card / detail "Cat" row: the profile name of the cat, "Team · <boss>"
 * for a team task, nothing for a plain run (a run has no cat).
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import { taskCatLabel } from '../src/components/taskBoard/taskFormat.js';

const cats = [
  { id: 'boss', name: 'Captain Whiskers' },
  { id: 'dev', name: 'Pixel' },
];
const flow = { root: 'boss', state: 'done' as const, nodes: [], turns: 3 };

test('a cat task shows the profile name, not the breed', () => {
  assert.equal(taskCatLabel({ target: 'dev' }, cats), 'Pixel');
});

test('a team task shows the team with its boss', () => {
  assert.equal(taskCatLabel({ target: 'team', flow }, cats), 'Team · Captain Whiskers');
  assert.equal(taskCatLabel({ target: 'team' }, []), 'Team');
});

test('a plain run, or a deleted cat, shows no cat', () => {
  assert.equal(taskCatLabel({}, cats), undefined);
  assert.equal(taskCatLabel({ target: 'gone' }, cats), undefined);
});
