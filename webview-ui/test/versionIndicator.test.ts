/**
 * The bottom-right version label shows the full installed version it gets
 * (e.g. v1.4.1-cats.37), never a major.minor truncation.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { test } from 'vitest';

import { VersionIndicator } from '../src/components/VersionIndicator.js';

const render = (currentVersion: string) =>
  renderToStaticMarkup(createElement(VersionIndicator, { currentVersion, onOpenChangelog() {} }));

test('the label renders the full version string', () => {
  const html = render('1.4.1-cats.37');
  assert.match(html, />v1\.4\.1-cats\.37</);
});

test('no version renders no label', () => {
  assert.equal(render(''), '');
});
