import { useRef, useState } from 'react';

import { catCeo, useCatCeo } from '../cats/catCeoClient.js';
import type { CatOfficeSettings } from '../hooks/useExtensionMessages.js';
import { setNarratorSettings, useNarratorSettings } from '../narratorStore.js';
import { isSoundEnabled, setSoundEnabled } from '../notificationSound.js';
import { isBrowserRuntime } from '../runtime.js';
import { transport } from '../transport/index.js';
import { UpdateSettings } from '../update/UpdateSettings.js';
import { DefaultLayoutReset } from './DefaultLayoutReset.js';
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
}: SettingsModalProps) {
  const [soundLocal, setSoundLocal] = useState(isSoundEnabled);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [assetDirDraft, setAssetDirDraft] = useState('');
  const narrator = useNarratorSettings();
  const ceo = useCatCeo().settings;
  const [resetConfirming, setResetConfirming] = useState(false);

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        setResetConfirming(false);
        onClose();
      }}
      title="Settings"
    >
      {/* Open Sessions Folder opens an OS file manager — impossible in the browser. */}
      {!isBrowserRuntime && (
        <MenuItem
          onClick={() => {
            transport.send({ type: 'openSessionsFolder' });
            onClose();
          }}
        >
          Open Sessions Folder
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
        Export Layout
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
        Import Layout
      </MenuItem>
      <div className="py-4 px-10">
        <DefaultLayoutReset
          label="Reset layout to default"
          confirming={resetConfirming}
          onConfirmingChange={setResetConfirming}
          onReset={() => {
            onResetLayoutToDefault();
            onClose();
          }}
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
            placeholder="Absolute asset directory path"
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
            Add
          </Button>
        </div>
      ) : (
        <MenuItem
          onClick={() => {
            transport.send({ type: 'addExternalAssetDirectory' });
            onClose();
          }}
        >
          Add Asset Directory
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
        label="Sound Notifications"
        checked={soundLocal}
        onChange={() => {
          const newVal = !isSoundEnabled();
          setSoundEnabled(newVal);
          setSoundLocal(newVal);
          transport.send({ type: 'setSoundEnabled', enabled: newVal });
        }}
      />
      <Checkbox
        label="Watch All Sessions"
        checked={watchAllSessions}
        onChange={onToggleWatchAllSessions}
      />
      <Checkbox
        label="Instant Detection (Hooks)"
        checked={hooksInstalled}
        onChange={onToggleHooksEnabled}
      />
      <Checkbox
        label="Always Show Labels"
        checked={alwaysShowOverlay}
        onChange={onToggleAlwaysShowOverlay}
      />
      {/* Headless agents are the office's only terminal-less citizens in VS Code.
          Standalone has no terminals at all, so nothing there would ever ghost. */}
      {!isBrowserRuntime && (
        <Checkbox
          label="Display Headless as Ghosts"
          checked={ghostHeadlessAgents}
          onChange={onToggleGhostHeadlessAgents}
        />
      )}
      {showAreasAvailable && (
        <Checkbox label="Show Areas" checked={showAreas} onChange={onToggleShowAreas} />
      )}
      {catOffice && (
        <>
          <Checkbox
            label="Show Guests"
            checked={catOffice.showGuests}
            onChange={() => onChangeCatOffice({ ...catOffice, showGuests: !catOffice.showGuests })}
          />
          <label className="flex items-center justify-between w-full py-6 px-10">
            <span>Cats Working at Once</span>
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
              label="Cat CEO Reviews"
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
            label="AI summaries (Haiku)"
            checked={narrator.aiSummaries}
            onChange={() => setNarratorSettings({ aiSummaries: !narrator.aiSummaries })}
          />
          <Checkbox
            label="Raw tool status"
            checked={narrator.rawToolStatus}
            onChange={() => setNarratorSettings({ rawToolStatus: !narrator.rawToolStatus })}
          />
        </>
      )}
      <Checkbox label="Debug View" checked={isDebugMode} onChange={onToggleDebugMode} />
      {isBrowserRuntime && <UpdateSettings />}
    </Modal>
  );
}
