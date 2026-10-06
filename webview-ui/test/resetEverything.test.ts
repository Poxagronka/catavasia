/**
 * Settings "Reset everything": resetAllToDefault is sent only after the
 * second step, and only when the user typed RESET. The result line shows the
 * backup folder or the refusal. The local cats go back to the seed.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import type { ReactElement } from 'react';
import { test } from 'vitest';

import { createLocalCatsAdapter, localSeed } from '../src/cats/localCatsAdapter.js';
import { ResetEverything } from '../src/components/ResetEverything.js';

type Props = {
  onClick?: () => void;
  onChange?: (e: { target: { value: string } }) => void;
  disabled?: boolean;
  type?: string;
  children?: unknown;
};

/** Depth-first search over the element tree (no rendering needed). */
function find(
  node: unknown,
  hit: (el: ReactElement<Props>) => boolean,
): ReactElement<Props> | undefined {
  if (!node || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = find(child, hit);
      if (found) return found;
    }
    return undefined;
  }
  const el = node as ReactElement<Props>;
  if (hit(el)) return el;
  return find(el.props?.children, hit);
}

const byText = (node: unknown, text: string) => find(node, (el) => el.props?.children === text)!;
const text = (node: unknown): string => {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(text).join('');
  if (node && typeof node === 'object') return text((node as ReactElement<Props>).props?.children);
  return '';
};

function setup(result: { backupDir?: string; error?: string } | null = null) {
  const sent: string[] = [];
  let confirming = false;
  let typed = '';
  const render = () =>
    ResetEverything({
      confirming,
      onConfirmingChange: (v) => {
        confirming = v;
      },
      typed,
      onTypedChange: (v) => {
        typed = v;
      },
      onReset: () => sent.push('resetAllToDefault'),
      result,
    });
  const type = (value: string) =>
    find(render(), (el) => el.type === 'input')!.props.onChange!({ target: { value } });
  return { sent, render, type, isConfirming: () => confirming, typed: () => typed };
}

test('the first click only asks; the final button needs RESET typed', () => {
  const s = setup();
  byText(s.render(), 'Reset everything').props.onClick!();
  assert.equal(s.isConfirming(), true);
  assert.deepEqual(s.sent, []);

  s.type('reset');
  const final = byText(s.render(), 'Reset everything now');
  assert.equal(final.props.disabled, true);
  final.props.onClick!();
  assert.deepEqual(s.sent, []);

  s.type('RESET');
  byText(s.render(), 'Reset everything now').props.onClick!();
  assert.deepEqual(s.sent, ['resetAllToDefault']);
  assert.equal(s.isConfirming(), false);
  assert.equal(s.typed(), '');
});

test('Cancel sends nothing and clears the typed word', () => {
  const s = setup();
  byText(s.render(), 'Reset everything').props.onClick!();
  s.type('RESET');
  byText(s.render(), 'Cancel').props.onClick!();
  assert.deepEqual(s.sent, []);
  assert.equal(s.isConfirming(), false);
  assert.equal(s.typed(), '');
});

test('the result line shows the backup folder or the refusal', () => {
  assert.match(text(setup({ backupDir: '/h/.pixel-agents/backups/x' }).render()), /backups\/x/);
  assert.match(text(setup({ error: 'Cats are working' }).render()), /Cats are working/);
});

test('the local cats go back to the seed', () => {
  const items = new Map<string, string>();
  const api = createLocalCatsAdapter({
    getItem: (k) => items.get(k) ?? null,
    setItem: (k, v) => void items.set(k, v),
  });
  api.deleteCat('qa');
  assert.notDeepEqual(api.getSnapshot(), localSeed());
  api.resetToSeed();
  assert.deepEqual(api.getSnapshot(), localSeed());
});
