/**
 * Editor tabs of the Cats menu: every panel stays mounted (a tab switch loses no edit),
 * only the first tab shows, and a tab with an error carries a badge.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { EditorTabs } from '../src/components/cats/EditorTabs.js';
import { Tabs } from '../src/components/ui/Tabs.js';

const tabs = [
  { id: 'appearance' as const, content: createElement('i', null, 'look') },
  { id: 'prompt' as const, error: true, content: createElement('i', null, 'words') },
];

describe('EditorTabs', () => {
  it('renders all panels and hides all but the first', () => {
    const html = renderToStaticMarkup(createElement(EditorTabs, { tabs }));
    expect(html).toContain('look');
    expect(html).toContain('words');
    expect(html).toMatch(
      /data-testid="editor-panel-prompt"[^>]*class="[^"]*invisible"|class="[^"]*invisible"[^>]*data-testid="editor-panel-prompt"/,
    );
    expect(html).not.toMatch(/data-testid="editor-panel-appearance"[^>]*class="[^"]*invisible"/);
  });

  it('opens the requested tab first', () => {
    const html = renderToStaticMarkup(createElement(EditorTabs, { tabs, initial: 'prompt' }));
    expect(html).toMatch(
      /data-testid="editor-panel-appearance"[^>]*class="[^"]*invisible"|class="[^"]*invisible"[^>]*data-testid="editor-panel-appearance"/,
    );
  });

  it('badges a tab with an error', () => {
    const html = renderToStaticMarkup(createElement(EditorTabs, { tabs }));
    const prompt = html.split('data-testid="editor-tab-prompt"')[1].split('</button>')[0];
    const look = html.split('data-testid="editor-tab-appearance"')[1].split('</button>')[0];
    expect(prompt).toContain('!');
    expect(look).not.toContain('!');
  });
});

describe('Tabs', () => {
  const generic = [
    { id: 'one', label: 'First', content: createElement('i', null, 'a') },
    { id: 'two', label: 'Second', error: true, content: createElement('i', null, 'b') },
  ];

  it('uses the test id prefix, ARIA roles and the labels', () => {
    const html = renderToStaticMarkup(createElement(Tabs, { tabs: generic, testIdPrefix: 'x' }));
    expect(html).toContain('role="tablist"');
    expect(html).toContain('data-testid="x-tab-two"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('Second');
    expect(html).toMatch(/data-testid="x-panel-two"[^>]*class="[^"]*invisible"/);
  });

  it('keeps every panel mounted and badges the error tab', () => {
    const html = renderToStaticMarkup(createElement(Tabs, { tabs: generic, testIdPrefix: 'x' }));
    expect(html).toContain('>a<');
    expect(html).toContain('>b<');
    expect(html.split('data-testid="x-tab-two"')[1].split('</button>')[0]).toContain('!');
  });
});
