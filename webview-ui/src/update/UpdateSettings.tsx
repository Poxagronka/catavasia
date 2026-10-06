import { useState } from 'react';

import { Button } from '../components/ui/Button.js';
import { Checkbox } from '../components/ui/Checkbox.js';
import { updateActions, useUpdate } from './updateStore.js';

function statusLine(s: NonNullable<ReturnType<typeof useUpdate>['status']>): string {
  if (s.checking) return 'Checking…';
  if (s.lastError) return `Last check failed: ${s.lastError}`;
  if (s.lastCheckedAt === undefined) return `Installed ${s.currentVersion}`;
  if (s.available) return `${s.latestVersion} is available (installed ${s.currentVersion})`;
  return `Up to date (${s.currentVersion})`;
}

/** Settings rows for the self-update: the auto-check toggle and "Check for updates". */
export function UpdateSettings() {
  const { status } = useUpdate();
  const [error, setError] = useState<string>();
  if (!status) return null;
  const guard = (action: () => Promise<void>) => () => {
    setError(undefined);
    action().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  };
  return (
    <>
      <Checkbox
        label="Check for updates automatically"
        checked={status.autoCheck}
        onChange={guard(() => updateActions.setAutoCheck(!status.autoCheck))}
      />
      <div className="flex items-center justify-between gap-8 py-4 px-10">
        <span className="text-xs text-text-muted" data-testid="update-status-line">
          {error ?? statusLine(status)}
        </span>
        <Button
          size="sm"
          className="shrink-0"
          disabled={status.checking}
          onClick={guard(updateActions.check)}
        >
          Check for updates
        </Button>
      </div>
    </>
  );
}
