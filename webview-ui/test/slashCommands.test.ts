/**
 * Slash commands of the CEO composer: which draft opens the "/" menu, the
 * order of the matches, which commands the dock answers itself (pickers and
 * cards) and which go to Claude, and the menu, help and connector views.
 */

import assert from 'node:assert/strict';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { test } from 'vitest';

import type { DeskCommand } from '../../core/src/ceoDesk.js';
import { MessageRow } from '../src/catTerminal/ChatConsole.js';
import { ConnectorsCard } from '../src/ceoDesk/ConnectorsCard.js';
import { HelpCard } from '../src/ceoDesk/HelpCard.js';
import {
  catchCommand,
  matchCommands,
  slashQuery,
  withDockCommands,
} from '../src/ceoDesk/slashCommands.js';
import { SlashMenu } from '../src/ceoDesk/SlashMenu.js';
import { useSlashMenu } from '../src/ceoDesk/useSlashMenu.js';

/** Shapes of CLI 2.1.292 (GET /api/ceo/commands). */
const CLI: DeskCommand[] = [
  { name: 'tidy-notes', description: 'Tidy my notes', argumentHint: '' },
  {
    name: 'compact',
    description: 'Free up context',
    argumentHint: '<instructions>',
    builtin: true,
  },
  { name: 'model', description: 'Set the AI model', argumentHint: '<model>', builtin: true },
  {
    name: 'usage',
    description: 'Show plan usage',
    argumentHint: '',
    aliases: ['cost'],
    builtin: true,
  },
  {
    name: 'mcp',
    description: 'Manage MCP servers',
    argumentHint: '[enable|disable]',
    builtin: true,
  },
];

test('the menu is for a draft that is "/" and one word', () => {
  assert.equal(slashQuery('/'), '');
  assert.equal(slashQuery('/Mo'), 'mo');
  assert.equal(slashQuery('/model opus'), null);
  assert.equal(slashQuery('hello /model'), null);
  assert.equal(slashQuery(''), null);
});

test('matches: names that start with the text first, built-ins first, A to Z, aliases count', () => {
  const all = withDockCommands(CLI);
  assert.deepEqual(
    matchCommands(all, '').map((c) => c.name),
    ['compact', 'mcp', 'model', 'usage', 'help', 'permissions', 'tidy-notes'],
  );
  assert.deepEqual(
    matchCommands(all, 'co').map((c) => c.name),
    ['compact', 'usage'],
  );
  assert.deepEqual(
    matchCommands(all, 'notes').map((c) => c.name),
    ['tidy-notes'],
  );
  // The dock's own commands are added once.
  assert.equal(
    withDockCommands([...CLI, { name: 'help', description: 'x', argumentHint: '' }]).length,
    7,
  );
});

test('commands with a screen in the terminal open the dock; the rest go to Claude', () => {
  assert.deepEqual(catchCommand('/model'), { kind: 'model' });
  assert.deepEqual(catchCommand('/model sonnet'), { kind: 'model', value: 'sonnet' });
  assert.deepEqual(catchCommand('/effort high'), { kind: 'effort', value: 'high' });
  assert.deepEqual(catchCommand('/permissions'), { kind: 'permissions' });
  for (const usage of ['/context', '/usage', '/cost', '/stats'])
    assert.deepEqual(catchCommand(usage), { kind: 'usage' });
  for (const clear of ['/clear', '/reset', '/new', '/clear old chat'])
    assert.deepEqual(catchCommand(clear), { kind: 'clear' });
  assert.deepEqual(catchCommand('/help'), { kind: 'help' });
  assert.deepEqual(catchCommand(' /mcp '), { kind: 'connectors' });
  // Claude Code runs these itself.
  assert.equal(catchCommand('/mcp disable slack'), null);
  assert.equal(catchCommand('/compact keep the plan'), null);
  assert.equal(catchCommand('/tidy-notes'), null);
  assert.equal(catchCommand('/Users/me/file.txt is broken'), null);
  assert.equal(catchCommand('hello'), null);
});

function Menu({ draft }: { draft: string }) {
  return createElement(SlashMenu, { menu: useSlashMenu(draft, withDockCommands(CLI), () => {}) });
}

test('the menu lists name, argument hint and description', () => {
  const html = renderToStaticMarkup(createElement(Menu, { draft: '/mo' }));
  assert.match(html, /data-testid="slash-menu"/);
  assert.match(html, /\/model/);
  assert.match(html, /&lt;model&gt;/);
  assert.match(html, /Set the AI model/);
  assert.doesNotMatch(html, /tidy-notes/);
  assert.equal(renderToStaticMarkup(createElement(Menu, { draft: 'hi' })), '');
});

test('the help card puts the dock commands first', () => {
  const html = renderToStaticMarkup(
    createElement(HelpCard, {
      commands: withDockCommands(CLI),
      onPick: () => {},
      onClose: () => {},
    }),
  );
  const here = html.indexOf('Open here');
  const sent = html.indexOf('Sent to Claude');
  assert.ok(here >= 0 && sent > here);
  assert.ok(html.indexOf('/model') < sent);
  assert.ok(html.indexOf('/compact') > sent);
});

test('the connectors card says the change applies to every cat, in plain words', () => {
  const html = renderToStaticMarkup(createElement(ConnectorsCard, { onClose: () => {} }));
  assert.match(html, /Changes apply to all cats/);
  assert.match(html, /Checking connectors/);
  assert.match(html, /href="https:\/\/claude.ai\/customize\/connectors"/);
});

test('a compact note is a quiet line', () => {
  const html = renderToStaticMarkup(
    createElement(MessageRow, { entry: { kind: 'note', text: 'Summarised the chat' } }),
  );
  assert.match(html, /data-testid="chat-note"/);
  assert.match(html, /Summarised the chat/);
});
