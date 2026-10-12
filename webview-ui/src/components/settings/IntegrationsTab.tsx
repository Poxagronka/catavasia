import { chrome } from '../../i18n/chrome/en.js';
import { useT } from '../../i18n/useT.js';
import { setNarratorSettings, useNarratorSettings } from '../../narratorStore.js';
import { isBrowserRuntime } from '../../runtime.js';
import { transport } from '../../transport/index.js';
import { Checkbox } from '../ui/Checkbox.js';
import { MenuItem } from '../ui/MenuItem.js';

interface IntegrationsTabProps {
  onClose: () => void;
  watchAllSessions: boolean;
  onToggleWatchAllSessions: () => void;
  /** ACTUAL install state (the hooksStatus message), not the hooksEnabled
   *  preference. The preference defaults to true while first-run consent is
   *  still pending, so binding the checkbox to it renders "on" over an empty
   *  ~/.claude/settings.json. */
  hooksInstalled: boolean;
  onToggleHooksEnabled: () => void;
}

/** How the app finds agent sessions: session watching, hooks, AI summaries. */
export function IntegrationsTab({
  onClose,
  watchAllSessions,
  onToggleWatchAllSessions,
  hooksInstalled,
  onToggleHooksEnabled,
}: IntegrationsTabProps) {
  const tc = useT(chrome);
  const narrator = useNarratorSettings();
  return (
    <>
      <Checkbox
        label={tc('watchAllSessions')}
        checked={watchAllSessions}
        onChange={onToggleWatchAllSessions}
      />
      <Checkbox
        label={tc('instantDetection')}
        checked={hooksInstalled}
        onChange={onToggleHooksEnabled}
      />
      {/* The narrator runs in the standalone server only (task board cats). */}
      {isBrowserRuntime && (
        <Checkbox
          label={tc('aiSummaries')}
          checked={narrator.aiSummaries}
          onChange={() => setNarratorSettings({ aiSummaries: !narrator.aiSummaries })}
        />
      )}
      {/* Open Sessions Folder opens an OS file manager — impossible in the browser. */}
      {!isBrowserRuntime && (
        <MenuItem
          onClick={() => {
            transport.send({ type: 'openSessionsFolder' });
            onClose();
          }}
        >
          {tc('openSessionsFolder')}
        </MenuItem>
      )}
    </>
  );
}
