import type { ReactNode } from 'react';

import { cats } from '../../i18n/cats/en.js';
import { useT } from '../../i18n/useT.js';
import { Tabs } from '../ui/Tabs.js';

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

/** The tabs of a cat editor page (see `Tabs`). `initial` picks the tab shown first. */
export function EditorTabs({ tabs, initial }: { tabs: EditorTabDef[]; initial?: EditorTabId }) {
  const t = useT(cats);
  return (
    <Tabs
      testIdPrefix="editor"
      initial={initial}
      tabs={tabs.map((tab) => ({ ...tab, label: t(LABEL[tab.id]) }))}
    />
  );
}
