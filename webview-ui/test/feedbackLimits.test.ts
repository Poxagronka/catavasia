/** Feedback form: the image limits it checks on add, before Send. */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
  FEEDBACK_IMAGE_MAX_BYTES,
  FEEDBACK_MAX_IMAGES,
  FEEDBACK_MAX_TOTAL_BYTES,
} from '../../core/src/constants.js';
import { feedbackAttachError } from '../src/feedback/feedbackLimits.js';

const png = (size = 1000, name = 'a.png') => ({ name, type: 'image/png', size });

test('feedback images: a normal image joins', () => {
  assert.equal(feedbackAttachError([], [png()]), null);
  assert.equal(feedbackAttachError([png()], [{ ...png(), type: 'image/webp' }]), null);
});

test('feedback images: only PNG, JPEG, GIF and WebP', () => {
  assert.match(feedbackAttachError([], [{ ...png(), type: 'application/pdf' }]) ?? '', /not a PNG/);
  // A prototype key is not an image type.
  assert.match(feedbackAttachError([], [{ ...png(), type: 'constructor' }]) ?? '', /not a PNG/);
});

test('feedback images: at most FEEDBACK_MAX_IMAGES', () => {
  const full = Array.from({ length: FEEDBACK_MAX_IMAGES }, () => png());
  assert.match(feedbackAttachError(full, [png()]) ?? '', /At most/);
  assert.equal(feedbackAttachError(full.slice(1), [png()]), null);
});

test('feedback images: per-image and total size limits', () => {
  assert.match(
    feedbackAttachError([], [png(FEEDBACK_IMAGE_MAX_BYTES + 1, 'big.png')]) ?? '',
    /big\.png is/,
  );
  const count = Math.floor(FEEDBACK_MAX_TOTAL_BYTES / FEEDBACK_IMAGE_MAX_BYTES);
  const current = Array.from({ length: count }, () => png(FEEDBACK_IMAGE_MAX_BYTES));
  assert.match(feedbackAttachError(current, [png(1)]) ?? '', /together/);
});
