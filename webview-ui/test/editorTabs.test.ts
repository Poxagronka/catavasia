/**
 * Editor tabs of the Cats menu: every panel stays mounted (a tab switch loses no edit),
 * only the first tab shows, and a tab with an error carries a badge.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { EditorTabs } from '../src/components/cats/EditorTabs.js';

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
      /data-testid="editor-panel-prompt"[^>]*class="hidden"|class="hidden"[^>]*data-testid="editor-panel-prompt"/,
    );
    expect(html).not.toMatch(/data-testid="editor-panel-appearance"[^>]*class="hidden"/);
  });

  it('opens the requested tab first', () => {
    const html = renderToStaticMarkup(createElement(EditorTabs, { tabs, initial: 'prompt' }));
    expect(html).toMatch(
      /data-testid="editor-panel-appearance"[^>]*class="hidden"|class="hidden"[^>]*data-testid="editor-panel-appearance"/,
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
