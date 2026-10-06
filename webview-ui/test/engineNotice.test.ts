/**
 * Engine readiness in the UI: which problem the notice shows (not installed /
 * logged out / ready / not probed yet), the onboarding status line, and the
 * notice's buttons (Log in only with the server token; Check again waits).
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import type { ReactElement } from 'react';
import { test } from 'vitest';

import { EngineNoticeView } from '../src/engines/EngineNoticeView.js';
import { engineProblem, engineStatusLine, neededEngines } from '../src/engines/engineReadiness.js';

type Props = {
  onClick?: () => void;
  disabled?: boolean;
  children?: unknown;
  'data-testid'?: string;
};

function all(node: unknown, out: Array<ReactElement<Props>> = []): Array<ReactElement<Props>> {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const child of node) all(child, out);
    return out;
  }
  const el = node as ReactElement<Props>;
  out.push(el);
  all(el.props?.children, out);
  return out;
}

const byTestId = (tree: unknown, id: string) =>
  all(tree).find((el) => el.props?.['data-testid'] === id);

function text(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  if (node && typeof node === 'object') return text((node as ReactElement<Props>).props?.children);
  return '';
}

const options = (status?: { installed: boolean; loggedIn?: boolean; version?: string }) => ({
  models: [],
  efforts: [],
  ...(status ? { status } : {}),
});

test('engineProblem: logged out, not installed, ready, not probed', () => {
  assert.deepEqual(engineProblem('claude', options({ installed: true, loggedIn: false })), {
    engine: 'claude',
    reason: 'Claude Code is not logged in',
    needsLogin: true,
    loginCommand: 'claude auth login',
  });
  assert.deepEqual(engineProblem('codex', options({ installed: false })), {
    engine: 'codex',
    reason: 'Codex is not installed',
    installCommand: 'npm install -g @openai/codex',
    needsLogin: false,
    loginCommand: 'codex login',
  });
  assert.equal(engineProblem('claude', options({ installed: true, loggedIn: true })), null);
  // The probe could not tell, or has not answered yet: no notice.
  assert.equal(engineProblem('claude', options({ installed: true })), null);
  assert.equal(engineProblem('claude', options()), null);
});

test('engineStatusLine for the onboarding engine step', () => {
  assert.equal(
    engineStatusLine(options({ installed: true, version: '2.1.291', loggedIn: true })),
    'installed 2.1.291, logged in',
  );
  assert.equal(
    engineStatusLine(options({ installed: true, loggedIn: false })),
    'installed, not logged in',
  );
  assert.equal(engineStatusLine(options({ installed: false })), 'not installed');
  assert.equal(engineStatusLine(options()), null);
});

test('neededEngines: Claude Code always, plus the engines of the cats', () => {
  assert.deepEqual(neededEngines([]), ['claude']);
  assert.deepEqual(neededEngines([{ engine: 'codex' }, { engine: 'claude' }]), ['claude', 'codex']);
});

test('notice: a logged-out engine offers Log in and Check again', () => {
  const problem = engineProblem('claude', options({ installed: true, loggedIn: false }))!;
  let loggedIn = 0;
  let checked = 0;
  const tree = EngineNoticeView({
    problem,
    privileged: true,
    checking: false,
    onLogIn: () => loggedIn++,
    onCheck: () => checked++,
  });
  assert.match(text(tree), /Claude Code is not logged in/);
  byTestId(tree, 'engine-login-claude')!.props.onClick!();
  byTestId(tree, 'engine-check-claude')!.props.onClick!();
  assert.equal(loggedIn, 1);
  assert.equal(checked, 1);
});

test('notice: without the server token it shows the login command instead', () => {
  const problem = engineProblem('codex', options({ installed: true, loggedIn: false }))!;
  const tree = EngineNoticeView({
    problem,
    privileged: false,
    checking: true,
    onLogIn: () => {},
    onCheck: () => {},
  });
  assert.equal(byTestId(tree, 'engine-login-codex'), undefined);
  assert.match(text(tree), /codex login/);
  const check = byTestId(tree, 'engine-check-codex')!;
  assert.equal(check.props.disabled, true);
  assert.equal(text(check), 'Checking...');
});

test('notice: a missing engine shows its install command, no Log in', () => {
  const problem = engineProblem('claude', options({ installed: false }))!;
  const tree = EngineNoticeView({
    problem,
    privileged: true,
    checking: false,
    onLogIn: () => {},
    onCheck: () => {},
  });
  assert.match(text(tree), /npm install -g @anthropic-ai\/claude-code/);
  assert.equal(byTestId(tree, 'engine-login-claude'), undefined);
});
