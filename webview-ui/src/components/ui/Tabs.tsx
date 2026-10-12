import { type ReactNode, useState } from 'react';

import { Button } from './Button.js';

export interface TabDef<Id extends string> {
  id: Id;
  /** Already translated. */
  label: string;
  /** A problem on this tab: the tab shows a badge so it is not hidden by accident. */
  error?: boolean;
  content: ReactNode;
}

interface TabsProps<Id extends string> {
  tabs: TabDef<Id>[];
  /** Tab shown first. Defaults to the first tab. */
  initial?: Id;
  /** Test ids are `<testIdPrefix>-tab-<id>` and `<testIdPrefix>-panel-<id>`. */
  testIdPrefix: string;
  /** Classes of the shown panel. */
  panelClassName?: string;
}

/**
 * A tab strip with panels. Every panel stays mounted (only hidden), so a switch loses no
 * unsaved edit or typed text. A tab with `error` carries a badge.
 */
export function Tabs<Id extends string>({
  tabs,
  initial,
  testIdPrefix,
  panelClassName = 'flex flex-col gap-10',
}: TabsProps<Id>) {
  const [active, setActive] = useState<Id>(initial ?? tabs[0].id);
  return (
    <div className="flex flex-col gap-8">
      <div className="flex gap-4 flex-wrap" role="tablist">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            size="md"
            role="tab"
            aria-selected={active === tab.id}
            data-testid={`${testIdPrefix}-tab-${tab.id}`}
            variant={active === tab.id ? 'active' : 'default'}
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
            {tab.error && (
              <span className="ms-4 text-status-error" aria-hidden>
                !
              </span>
            )}
          </Button>
        ))}
      </div>
      {/* All panels share one grid cell: the area is as tall as the tallest panel, so a switch moves nothing. */}
      <div className="grid">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tabpanel"
            data-testid={`${testIdPrefix}-panel-${tab.id}`}
            className={`col-start-1 row-start-1 ${active === tab.id ? panelClassName : 'invisible'}`}
          >
            {tab.content}
          </div>
        ))}
      </div>
    </div>
  );
}
