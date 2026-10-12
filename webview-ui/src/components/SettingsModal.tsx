import { useEffect, useRef, useState } from 'react';

import { type LanguageCode, LANGUAGES } from '../../../core/src/languages.js';
import { catCeo, useCatCeo } from '../cats/catCeoClient.js';
import type { CatOfficeSettings } from '../hooks/useExtensionMessages.js';
import { chrome } from '../i18n/chrome/en.js';
import { common } from '../i18n/common/en.js';
import { useLanguage } from '../i18n/languageStore.js';
import { chooseLanguage } from '../i18n/languageSync.js';
import { useT } from '../i18n/useT.js';
import { setNarratorSettings, useNarratorSettings } from '../narratorStore.js';
import { isSoundEnabled, setSoundEnabled } from '../notificationSound.js';
import { restartOnboarding } from '../onboarding/onboardingStore.js';
import { isBrowserRuntime } from '../runtime.js';
import { transport } from '../transport/index.js';
import { UpdateSettings } from '../update/UpdateSettings.js';
import { DefaultLayoutReset } from './DefaultLayoutReset.js';
import { ResetEverything } from './ResetEverything.js';
import { Button } from './ui/Button.js';
import { Checkbox } from './ui/Checkbox.js';
import { MenuItem } from './ui/MenuItem.js';
import { Modal } from './ui/Modal.js';

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
  /** ACTUAL install state (the hooksStatus message), not the hooksEnabled
   *  preference. The preference defaults to true while first-run consent is
   *  still pending, so binding the checkbox to it renders "on" over an empty
   *  ~/.claude/settings.json. */
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
  /** Same action as the editor's Default button (sends resetLayoutToDefault). */
  onResetLayoutToDefault: () => void;
  /** Settings "Reset everything" (sends resetAllToDefault after cleaning the editor). */
  onResetAll: () => void;
}

/** Choices for "Cats working at once" (server range 1..12). */
const TURN_CONCURRENCY_CHOICES = Array.from({ length: 12 }, (_, i) => i + 1);

export function SettingsModal({
  isOpen,
  onClose,
  isDebugMode,
  onToggleDebugMode,
  alwaysShowOverlay,
  onToggleAlwaysShowOverlay,
  ghostHeadlessAgents,
  onToggleGhostHeadlessAgents,
  externalAssetDirectories,
  watchAllSessions,
  onToggleWatchAllSessions,
  hooksInstalled,
  onToggleHooksEnabled,
  showAreas,
  onToggleShowAreas,
  showAreasAvailable,
  onExportLayout,
  onImportLayout,
  catOffice,
  onChangeCatOffice,
  onResetLayoutToDefault,
  onResetAll,
}: SettingsModalProps) {
  const t = useT(common);
  const tc = useT(chrome);
  const language = useLanguage();
  const [soundLocal, setSoundLocal] = useState(isSoundEnabled);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [assetDirDraft, setAssetDirDraft] = useState('');
  const narrator = useNarratorSettings();
  const ceo = useCatCeo().settings;
  const [resetConfirming, setResetConfirming] = useState(false);
  const [resetAllConfirming, setResetAllConfirming] = useState(false);
  const [resetAllTyped, setResetAllTyped] = useState('');
  const [resetAllResult, setResetAllResult] = useState<{
    backupDir?: string;
    error?: string;
  } | null>(null);

  useEffect(
    () =>
      transport.onMessage((msg) => {
        if (msg.type === 'resetAllResult') setResetAllResult(msg);
      }),
    [],
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        setResetConfirming(false);
        setResetAllConfirming(false);
        setResetAllTyped('');
        setResetAllResult(null);
        onClose();
      }}
      title={t('settings')}
    >
      <label className="flex items-center justify-between w-full py-6 px-10">
        <span>{t('language')}</span>
        <select
          value={language}
          onChange={(e) => chooseLanguage(e.target.value as LanguageCode)}
          className="bg-bg border-2 border-border rounded-none text-text text-xs py-2 px-4"
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.endonym}
            </option>
          ))}
        </select>
      </label>
      <MenuItem
        onClick={() => {
          restartOnboarding();
          onClose();
        }}
      >
        {t('runOnboardingAgain')}
      </MenuItem>
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
      <MenuItem
        onClick={() => {
          if (isBrowserRuntime) {
            onExportLayout();
          } else {
            transport.send({ type: 'exportLayout' });
          }
          onClose();
        }}
      >
        {tc('exportLayout')}
      </MenuItem>
      <MenuItem
        onClick={() => {
          if (isBrowserRuntime) {
            // Open the native file picker; the import is applied in onChange below.
            fileInputRef.current?.click();
          } else {
            transport.send({ type: 'importLayout' });
            onClose();
          }
        }}
      >
        {tc('importLayout')}
      </MenuItem>
      <div className="py-4 px-10">
        <DefaultLayoutReset
          label={tc('resetLayoutToDefault')}
          confirming={resetConfirming}
          onConfirmingChange={setResetConfirming}
          onReset={() => {
            onResetLayoutToDefault();
            onClose();
          }}
        />
      </div>
      <div className="py-4 px-10">
        <ResetEverything
          confirming={resetAllConfirming}
          onConfirmingChange={setResetAllConfirming}
          typed={resetAllTyped}
          onTypedChange={setResetAllTyped}
          onReset={() => {
            setResetAllResult(null);
            onResetAll();
          }}
          result={resetAllResult}
        />
      </div>
      {isBrowserRuntime && (
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Reset the value so re-selecting the same file fires change again.
            e.target.value = '';
            if (file) {
              onImportLayout(file);
              onClose();
            }
          }}
        />
      )}
      {/* Browser has no native directory picker, so accept a typed absolute path. */}
      {isBrowserRuntime ? (
        <div className="flex items-center gap-4 py-4 px-10">
          <input
            type="text"
            value={assetDirDraft}
            placeholder={tc('assetDirPlaceholder')}
            onChange={(e) => setAssetDirDraft(e.target.value)}
            className="flex-1 min-w-0 text-xs py-2 px-4 bg-bg border-2 border-border rounded-none text-text"
          />
          <Button
            variant="default"
            size="sm"
            onClick={() => {
              const path = assetDirDraft.trim();
              if (!path) return;
              transport.send({ type: 'addExternalAssetDirectory', path });
              setAssetDirDraft('');
            }}
            className="shrink-0"
          >
            {tc('add')}
          </Button>
        </div>
      ) : (
        <MenuItem
          onClick={() => {
            transport.send({ type: 'addExternalAssetDirectory' });
            onClose();
          }}
        >
          {tc('addAssetDirectory')}
        </MenuItem>
      )}
      {externalAssetDirectories.map((dir) => (
        <div key={dir} className="flex items-center justify-between py-4 px-10 gap-8">
          <span
            className="text-xs text-text-muted overflow-hidden text-ellipsis whitespace-nowrap"
            title={dir}
          >
            {dir.split(/[/\\]/).pop() ?? dir}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => transport.send({ type: 'removeExternalAssetDirectory', path: dir })}
            className="shrink-0"
          >
            x
          </Button>
        </div>
      ))}
      <Checkbox
        label={tc('soundNotifications')}
        checked={soundLocal}
        onChange={() => {
          const newVal = !isSoundEnabled();
          setSoundEnabled(newVal);
          setSoundLocal(newVal);
          transport.send({ type: 'setSoundEnabled', enabled: newVal });
        }}
      />
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
      <Checkbox
        label={tc('alwaysShowLabels')}
        checked={alwaysShowOverlay}
        onChange={onToggleAlwaysShowOverlay}
      />
      {/* Headless agents are the office's only terminal-less citizens in VS Code.
          Standalone has no terminals at all, so nothing there would ever ghost. */}
      {!isBrowserRuntime && (
        <Checkbox
          label={tc('headlessAsGhosts')}
          checked={ghostHeadlessAgents}
          onChange={onToggleGhostHeadlessAgents}
        />
      )}
      {showAreasAvailable && (
        <Checkbox label={tc('showAreas')} checked={showAreas} onChange={onToggleShowAreas} />
      )}
      {catOffice && (
        <>
          <Checkbox
            label={tc('showGuests')}
            checked={catOffice.showGuests}
            onChange={() => onChangeCatOffice({ ...catOffice, showGuests: !catOffice.showGuests })}
          />
          <label className="flex items-center justify-between w-full py-6 px-10">
            <span>{tc('catsAtOnce')}</span>
            <select
              value={catOffice.turnConcurrency}
              onChange={(e) =>
                onChangeCatOffice({ ...catOffice, turnConcurrency: Number(e.target.value) })
              }
              className="bg-bg border-2 border-border rounded-none text-text text-xs py-2 px-4"
            >
              {TURN_CONCURRENCY_CHOICES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          {ceo && (
            <Checkbox
              label={tc('catCeoReviews')}
              checked={ceo.enabled}
              onChange={() => catCeo.setSettings({ enabled: !ceo.enabled })}
            />
          )}
        </>
      )}
      {/* The narrator runs in the standalone server only (task board cats). */}
      {isBrowserRuntime && (
        <>
          <Checkbox
            label={tc('aiSummaries')}
            checked={narrator.aiSummaries}
            onChange={() => setNarratorSettings({ aiSummaries: !narrator.aiSummaries })}
          />
          <Checkbox
            label={tc('rawToolStatus')}
            checked={narrator.rawToolStatus}
            onChange={() => setNarratorSettings({ rawToolStatus: !narrator.rawToolStatus })}
          />
        </>
      )}
      <Checkbox label={tc('debugView')} checked={isDebugMode} onChange={onToggleDebugMode} />
      {isBrowserRuntime && <UpdateSettings />}
    </Modal>
  );
}
