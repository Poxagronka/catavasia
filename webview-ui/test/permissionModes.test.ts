/**
 * The permission mode picker of cats and the Cat CEO (core/src/permissionModes.ts):
 * Auto support per model and the plain line under the picker.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
  AUTO_FALLBACK_HINT,
  autoSupported,
  effectiveMode,
  PERMISSION_MODE_LABELS,
  permissionHint,
} from '../../core/src/permissionModes.js';

test('Auto runs on the models the installed CLI marks, not on Haiku or older ones', () => {
  for (const model of ['opus', 'sonnet', 'fable', 'claude-opus-4-6', 'claude-sonnet-4-6']) {
    assert.equal(autoSupported(model), true, model);
  }
  for (const model of [
    'haiku',
    'claude-haiku-4-5-20251001',
    'claude-opus-4-5-20251101',
    'claude-sonnet-4-20250514',
    'claude-3-7-sonnet-latest',
  ]) {
    assert.equal(autoSupported(model), false, model);
  }
});

test('Auto on a model without it runs as Bypass, and the picker says so', () => {
  assert.equal(effectiveMode('claude', 'haiku', 'auto'), 'bypass');
  assert.equal(effectiveMode('claude', 'haiku', undefined), 'bypass');
  assert.equal(effectiveMode('claude', 'opus', undefined), 'auto');
  assert.equal(effectiveMode('codex', 'gpt-6-luna', 'auto'), 'auto');
  assert.equal(permissionHint('claude', 'haiku', 'auto'), AUTO_FALLBACK_HINT);
  assert.match(permissionHint('claude', 'haiku', 'ask'), /asks you/i);
  assert.match(permissionHint('codex', 'gpt-6-luna', 'ask'), /cannot ask/);
  assert.deepEqual(Object.values(PERMISSION_MODE_LABELS), [
    'Auto',
    'Ask before actions',
    'Bypass',
    'Read only',
  ]);
});
