/**
 * The Project panel of the bottom bar: the project name, the recent projects
 * (name + short path), the version-history offer for a folder without git,
 * and the path box when the server cannot show a folder window.
 */

import assert from 'node:assert/strict';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { test } from 'vitest';

import type { CeoFoldersResponse } from '../../core/src/ceoDesk.js';
import { projectName } from '../src/ceoDesk/dockState.js';
import { ProjectPanelView } from '../src/components/ProjectButton.js';

const noop = () => {};
const panel = (info: CeoFoldersResponse | null, picking = false, error: string | null = null) =>
  renderToStaticMarkup(
    createElement(ProjectPanelView, {
      info,
      picking,
      error,
      onPick: noop,
      onNew: noop,
      onHistory: noop,
      onUse: noop,
    }),
  );

test('projectName: the folder name, or No project', () => {
  assert.equal(projectName('/Users/me/code/my-site'), 'my-site');
  assert.equal(projectName('/Users/me/code/my-site/'), 'my-site');
  assert.equal(projectName('C:\\Users\\me\\shop'), 'shop');
  assert.equal(projectName(null), 'No project');
  assert.equal(projectName(undefined), 'No project');
});

test('a git project: the name, the ways to pick, the other recent projects', () => {
  const html = panel({
    folder: '/Users/me/my-site',
    git: true,
    canPick: true,
    recent: ['/Users/me/my-site', '/Users/me/work/shop'],
  });
  assert.match(html, />my-site</);
  assert.match(html, /The cats work in ~\/my-site\./);
  assert.match(html, /Choose folder…/);
  assert.match(html, /New project…/);
  assert.match(html, /No project \(sandbox\)/);
  // The current project is not repeated under Recent.
  assert.match(html, /Recent projects/);
  assert.match(html, />shop<.*~\/work\/shop/);
  assert.doesNotMatch(html, /Turn on version history/);
  assert.doesNotMatch(html, /project-path/);
  // No developer words.
  assert.doesNotMatch(html, /worktree|cwd/i);
});

test('a folder without version history gets the offer', () => {
  const html = panel({ folder: '/Users/me/notes', git: false, canPick: true, recent: [] });
  assert.match(html, /This folder has no version history/);
  assert.match(html, /Turn on version history \(git\)/);
  assert.doesNotMatch(html, /Recent projects/);
});

test('no project; no folder window: a path box; picking and errors show', () => {
  const html = panel({ folder: null, git: false, canPick: false, recent: [] }, false, 'Nope');
  assert.match(html, />No project</);
  assert.match(html, /scratch folder/);
  assert.doesNotMatch(html, /Choose folder…/);
  assert.doesNotMatch(html, /No project \(sandbox\)/);
  assert.match(html, /Type the full path of the project folder/);
  assert.match(html, />Nope</);
  const picking = panel({ folder: null, git: false, canPick: true, recent: [] }, true);
  assert.match(picking, /A folder window is open/);
  assert.match(picking, /disabled=""/);
});
