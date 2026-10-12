import { useState } from 'react';

import { Button } from '../components/ui/Button.js';
import { Checkbox } from '../components/ui/Checkbox.js';
import { chrome } from '../i18n/chrome/en.js';
import { useT } from '../i18n/useT.js';
import { updateActions, useUpdate } from './updateStore.js';

function statusLine(
  s: NonNullable<ReturnType<typeof useUpdate>['status']>,
  t: ReturnType<typeof useT<typeof chrome>>,
): string {
  if (s.checking) return t('checking');
  if (s.lastError) return t('lastCheckFailed', { error: s.lastError });
  if (s.lastCheckedAt === undefined) return t('installedVersion', { version: s.currentVersion });
  if (s.available) {
    return t('availableInstalled', { latest: s.latestVersion ?? '', current: s.currentVersion });
  }
  return t('upToDate', { version: s.currentVersion });
}

/** Settings rows for the self-update: the auto-check toggle and "Check for updates". */
export function UpdateSettings() {
  const t = useT(chrome);
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
        label={t('checkAutomatically')}
        checked={status.autoCheck}
        onChange={guard(() => updateActions.setAutoCheck(!status.autoCheck))}
      />
      <div className="flex items-center justify-between gap-8 py-4 px-10">
        <span className="text-xs text-text-muted" data-testid="update-status-line">
          {error ?? statusLine(status, t)}
        </span>
        <Button
          size="sm"
          className="shrink-0"
          disabled={status.checking}
          onClick={guard(updateActions.check)}
        >
          {t('checkNow')}
        </Button>
      </div>
    </>
  );
}
