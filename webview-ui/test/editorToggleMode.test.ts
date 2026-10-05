/**
 * Regression: with the Furniture tool open but no catalog item picked, a click
 * selects placed furniture, so T must toggle that item's state. Before the fix
 * `handleToggleState` branched on the tool alone and toggled the empty picked
 * type (a no-op). Sibling of editorRotateMode.test.ts.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { test, vi } from 'vitest';

vi.stubGlobal('window', { devicePixelRatio: 1 });
vi.mock('../src/transport/index.js', () => ({ transport: { send: () => {} } }));
vi.mock('../src/office/editor/editorActions.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  toggleFurnitureState: () => ({ toggled: true }),
}));

// A variable specifier keeps the DOM-typed hook out of this node-only tsconfig.
const hookModule = '../src/hooks/useEditorActions.js';
const { useEditorActions } = (await import(hookModule)) as {
  useEditorActions: (getOs: () => unknown, s: unknown) => { handleToggleState: () => void };
};
const { EditorState } = await import('../src/office/editor/editorState.js');
const { EditTool } = await import('../src/office/types.js');

test('T toggles the selected placed item when the Furniture tool has no pick', () => {
  const editorState = new EditorState();
  editorState.activeTool = EditTool.FURNITURE_PLACE;
  editorState.selectedFurnitureType = '';
  editorState.selectedFurnitureUid = 'pc-1';
  const rebuilt: unknown[] = [];
  const os = { getLayout: () => ({}), rebuildFromLayout: (l: unknown) => rebuilt.push(l) };

  let actions: { handleToggleState: () => void } | undefined;
  const Probe = () => {
    actions = useEditorActions(() => os, editorState);
    return null;
  };
  renderToString(createElement(Probe));
  actions!.handleToggleState();

  assert.deepEqual(rebuilt, [{ toggled: true }]);
});
