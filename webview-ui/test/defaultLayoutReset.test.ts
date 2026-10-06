/**
 * The Settings "Reset layout to default" button and the editor "Default" button
 * share DefaultLayoutReset. The reset (which sends resetLayoutToDefault) must
 * run only after the user answers Yes in the inline confirm.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import type { ReactElement } from 'react';
import { test } from 'vitest';

import { DefaultLayoutReset } from '../src/components/DefaultLayoutReset.js';

type Props = { onClick?: () => void; children?: unknown };

/** Find the first element whose children equal `text` (depth-first, no rendering needed). */
function findByText(node: unknown, text: string): ReactElement<Props> | undefined {
  if (!node || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findByText(child, text);
      if (hit) return hit;
    }
    return undefined;
  }
  const el = node as ReactElement<Props>;
  if (el.props?.children === text) return el;
  return findByText(el.props?.children, text);
}

function setup() {
  const sent: string[] = [];
  let confirming = false;
  const render = () =>
    DefaultLayoutReset({
      label: 'Reset layout to default',
      confirming,
      onConfirmingChange: (v) => {
        confirming = v;
      },
      onReset: () => sent.push('resetLayoutToDefault'),
    });
  return { sent, render, isConfirming: () => confirming };
}

test('Settings reset asks for confirmation before sending resetLayoutToDefault', () => {
  const s = setup();
  findByText(s.render(), 'Reset layout to default')!.props.onClick!();
  assert.equal(s.isConfirming(), true);
  assert.deepEqual(s.sent, []);

  findByText(s.render(), 'Yes')!.props.onClick!();
  assert.deepEqual(s.sent, ['resetLayoutToDefault']);
  assert.equal(s.isConfirming(), false);
});

test('Settings reset sends nothing when the user answers No', () => {
  const s = setup();
  findByText(s.render(), 'Reset layout to default')!.props.onClick!();
  findByText(s.render(), 'No')!.props.onClick!();
  assert.deepEqual(s.sent, []);
  assert.equal(s.isConfirming(), false);
});
