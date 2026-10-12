import type { CatOfficeSettings } from '../hooks/useExtensionMessages.js';
import { chrome } from '../i18n/chrome/en.js';
import { common } from '../i18n/common/en.js';
import { useT } from '../i18n/useT.js';
import { isBrowserRuntime } from '../runtime.js';
import { UpdateSettings } from '../update/UpdateSettings.js';
import { AdvancedTab } from './settings/AdvancedTab.js';
import { GeneralTab } from './settings/GeneralTab.js';
import { IntegrationsTab } from './settings/IntegrationsTab.js';
import { OfficeTab } from './settings/OfficeTab.js';
import { Modal } from './ui/Modal.js';
import { type TabDef, Tabs } from './ui/Tabs.js';

type SettingsTabId = 'general' | 'office' | 'integrations' | 'updates' | 'advanced';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDebugMode: boolean;
  onToggleDebugMode: () => void;
  alwaysShowOverlay: boolean;
  onToggleAlwaysShowOverlay: () => void;
  /** Whether headless agents (adopted, no terminal to focus) render translucent. */
  ghostHeadlessAgents: boolean;
  onToggleGhostHeadlessAgents: () => void;
  externalAssetDirectories: string[];
  watchAllSessions: boolean;
  onToggleWatchAllSessions: () => void;
  /** ACTUAL install state (the hooksStatus message), not the hooksEnabled preference. */
  hooksInstalled: boolean;
  onToggleHooksEnabled: () => void;
  /** Whether the areas overlay is rendered outside of the Areas edit tool. */
  showAreas: boolean;
  onToggleShowAreas: () => void;
  /** Hide the Show Areas checkbox entirely when areas are unavailable. */
  showAreasAvailable: boolean;
  /** Browser-native layout export (standalone only; VS Code uses the host save dialog). */
  onExportLayout: () => void;
  /** Browser-native layout import from a chosen file (standalone only). */
  onImportLayout: (file: File) => void;
  /** Cat office settings; null hides them (no office on this server). */
  catOffice: CatOfficeSettings | null;
  onChangeCatOffice: (next: CatOfficeSettings) => void;
  /** Settings "Reset everything" (sends resetAllToDefault after cleaning the editor). */
  onResetAll: () => void;
}

/** Settings in five tabs (four in VS Code, where the Updates tab is hidden). */
export function SettingsModal(props: SettingsModalProps) {
  const t = useT(common);
  const tc = useT(chrome);
  const { onClose } = props;

  const tabs: TabDef<SettingsTabId>[] = [
    {
      id: 'general',
      label: tc('settingsTabGeneral'),
      content: (
        <GeneralTab
          onClose={onClose}
          alwaysShowOverlay={props.alwaysShowOverlay}
          onToggleAlwaysShowOverlay={props.onToggleAlwaysShowOverlay}
        />
      ),
    },
    {
      id: 'office',
      label: tc('settingsTabOffice'),
      content: (
        <OfficeTab
          onClose={onClose}
          ghostHeadlessAgents={props.ghostHeadlessAgents}
          onToggleGhostHeadlessAgents={props.onToggleGhostHeadlessAgents}
          showAreas={props.showAreas}
          onToggleShowAreas={props.onToggleShowAreas}
          showAreasAvailable={props.showAreasAvailable}
          onExportLayout={props.onExportLayout}
          onImportLayout={props.onImportLayout}
          catOffice={props.catOffice}
          onChangeCatOffice={props.onChangeCatOffice}
        />
      ),
    },
    {
      id: 'integrations',
      label: tc('settingsTabIntegrations'),
      content: (
        <IntegrationsTab
          onClose={onClose}
          watchAllSessions={props.watchAllSessions}
          onToggleWatchAllSessions={props.onToggleWatchAllSessions}
          hooksInstalled={props.hooksInstalled}
          onToggleHooksEnabled={props.onToggleHooksEnabled}
        />
      ),
    },
    // Self-update exists in the standalone app only.
    ...(isBrowserRuntime
      ? [
          {
            id: 'updates' as const,
            label: tc('settingsTabUpdates'),
            content: <UpdateSettings />,
          },
        ]
      : []),
    {
      id: 'advanced',
      label: tc('settingsTabAdvanced'),
      content: (
        <AdvancedTab
          onClose={onClose}
          isDebugMode={props.isDebugMode}
          onToggleDebugMode={props.onToggleDebugMode}
          externalAssetDirectories={props.externalAssetDirectories}
          onResetAll={props.onResetAll}
        />
      ),
    },
  ];

  return (
    <Modal isOpen={props.isOpen} onClose={onClose} title={t('settings')} pinTop>
      <Tabs testIdPrefix="settings" tabs={tabs} panelClassName="flex flex-col" />
    </Modal>
  );
}
