/**
 * Unit tests for `syncCanvasSize`.
 *
 * Assigning `canvas.width` or `canvas.height` clears the bitmap, even when the
 * value does not change. A layout edit re-runs the resize, so an unconditional
 * assignment blanks the scene until the next animation frame (visible flicker).
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import type { SizedCanvas } from '../src/office/components/canvasSize.js';
import { syncCanvasSize } from '../src/office/components/canvasSize.js';

function fakeCanvas(width: number, height: number) {
  let w = width;
  let h = height;
  const counts = { resets: 0 };
  const canvas = {
    style: { width: '', height: '' },
    get width() {
      return w;
    },
    set width(v: number) {
      counts.resets++;
      w = v;
    },
    get height() {
      return h;
    },
    set height(v: number) {
      counts.resets++;
      h = v;
    },
  };
  return { canvas: canvas as SizedCanvas, counts };
}

test('unchanged size does not reset the bitmap', () => {
  const { canvas, counts } = fakeCanvas(800, 600);
  syncCanvasSize(canvas, 400, 300, 2);
  assert.equal(counts.resets, 0);
  assert.equal(canvas.style.width, '400px');
  assert.equal(canvas.style.height, '300px');
});

test('changed size updates the backing store', () => {
  const { canvas, counts } = fakeCanvas(800, 600);
  syncCanvasSize(canvas, 500, 300, 2);
  assert.equal(canvas.width, 1000);
  assert.equal(canvas.height, 600);
  assert.equal(counts.resets, 1);
});
