/**
 * Task card / detail "Cat" row: the profile name of the cat, "Team · <boss>"
 * for a team task, the breed name only for a plain run.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import { taskCatLabel } from '../src/components/taskBoard/taskFormat.js';
import { CAT_NAMES } from '../src/constants.js';

const cats = [
  { id: 'boss', name: 'Captain Whiskers' },
  { id: 'dev', name: 'Pixel' },
];
const flow = { root: 'boss', state: 'done' as const, nodes: [], turns: 3 };

test('a cat task shows the profile name, not the breed', () => {
  assert.equal(taskCatLabel({ palette: 1, target: 'dev' }, cats), 'Pixel');
});

test('a team task shows the team with its boss', () => {
  assert.equal(taskCatLabel({ palette: 0, target: 'team', flow }, cats), 'Team · Captain Whiskers');
  assert.equal(taskCatLabel({ palette: 0, target: 'team' }, []), 'Team');
});

test('a plain run, or a deleted cat, falls back to the breed name', () => {
  assert.equal(taskCatLabel({ palette: 2 }, cats), CAT_NAMES[2]);
  assert.equal(taskCatLabel({ palette: 2, target: 'gone' }, cats), CAT_NAMES[2]);
  assert.equal(taskCatLabel({}, cats), 'Cat');
});
