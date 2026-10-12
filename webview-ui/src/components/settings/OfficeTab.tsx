import { useRef } from 'react';

import type { CatOfficeSettings } from '../../hooks/useExtensionMessages.js';
import { chrome } from '../../i18n/chrome/en.js';
import { useT } from '../../i18n/useT.js';
import { isBrowserRuntime } from '../../runtime.js';
import { transport } from '../../transport/index.js';
import { Checkbox } from '../ui/Checkbox.js';
import { MenuItem } from '../ui/MenuItem.js';

/** Choices for "Cats working at once" (server range 1..12). */
const TURN_CONCURRENCY_CHOICES = Array.from({ length: 12 }, (_, i) => i + 1);

interface OfficeTabProps {
  onClose: () => void;
  /** Whether headless agents (adopted, no terminal to focus) render translucent. */
  ghostHeadlessAgents: boolean;
  onToggleGhostHeadlessAgents: () => void;
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
}

/** Office display options and layout export / import. */
export function OfficeTab({
  onClose,
  ghostHeadlessAgents,
  onToggleGhostHeadlessAgents,
  showAreas,
  onToggleShowAreas,
  showAreasAvailable,
  onExportLayout,
  onImportLayout,
  catOffice,
  onChangeCatOffice,
}: OfficeTabProps) {
  const tc = useT(chrome);
  const fileInputRef = useRef<HTMLInputElement>(null);
  return (
    <>
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
        </>
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
    </>
  );
}
