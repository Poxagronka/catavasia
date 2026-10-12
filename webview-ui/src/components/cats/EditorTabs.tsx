import { type ReactNode, useState } from 'react';

import { cats } from '../../i18n/cats/en.js';
import { useT } from '../../i18n/useT.js';
import { Button } from '../ui/Button.js';

export type EditorTabId = 'appearance' | 'behaviour' | 'prompt' | 'other';

export interface EditorTabDef {
  id: EditorTabId;
  /** A problem on this tab: the tab shows a badge so it is not hidden by accident. */
  error?: boolean;
  content: ReactNode;
}

const LABEL = {
  appearance: 'editorTabAppearance',
  behaviour: 'editorTabBehaviour',
  prompt: 'editorTabPrompt',
  other: 'editorTabOther',
} as const satisfies Record<EditorTabId, string>;

/**
 * The tabs of an editor page. Every panel stays mounted (only hidden), so a switch loses no
 * unsaved edit. A tab with `error` carries a badge. `initial` picks the tab shown first.
 */
export function EditorTabs({ tabs, initial }: { tabs: EditorTabDef[]; initial?: EditorTabId }) {
  const t = useT(cats);
  const [active, setActive] = useState<EditorTabId>(initial ?? tabs[0].id);
  return (
    <div className="flex flex-col gap-8">
      <div className="flex gap-4 flex-wrap" role="tablist">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            size="md"
            role="tab"
            aria-selected={active === tab.id}
            data-testid={`editor-tab-${tab.id}`}
            variant={active === tab.id ? 'active' : 'default'}
            onClick={() => setActive(tab.id)}
          >
            {t(LABEL[tab.id])}
            {tab.error && (
              <span className="ms-4 text-status-error" aria-hidden>
                !
              </span>
            )}
          </Button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          data-testid={`editor-panel-${tab.id}`}
          className={active === tab.id ? 'flex flex-col gap-10' : 'hidden'}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
