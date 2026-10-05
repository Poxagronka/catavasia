/**
 * Regression: with the Furniture tool open but no catalog item picked, a click
 * selects placed furniture, so R / the rotate button must rotate that item.
 * `handleRotateSelected` branches on `isPlacingFurniture()`; before the fix it
 * branched on the tool alone and rotated the empty picked type (a no-op).
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import { EditorState } from '../src/office/editor/editorState.js';
import { EditTool } from '../src/office/types.js';

test('furniture tool with nothing picked is not placing (rotate targets the selection)', () => {
  const s = new EditorState();
  s.activeTool = EditTool.FURNITURE_PLACE;
  s.selectedFurnitureType = '';
  assert.equal(s.isPlacingFurniture(), false);
});

test('furniture tool with a picked item is placing (rotate targets the ghost)', () => {
  const s = new EditorState();
  s.activeTool = EditTool.FURNITURE_PLACE;
  s.selectedFurnitureType = 'DESK_FRONT';
  assert.equal(s.isPlacingFurniture(), true);
});

test('select tool is never placing', () => {
  const s = new EditorState();
  s.activeTool = EditTool.SELECT;
  s.selectedFurnitureType = 'DESK_FRONT';
  assert.equal(s.isPlacingFurniture(), false);
});
