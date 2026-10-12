import { useEffect, useState } from 'react';

import { chrome } from '../../i18n/chrome/en.js';
import { useT } from '../../i18n/useT.js';
import { isBrowserRuntime } from '../../runtime.js';
import { transport } from '../../transport/index.js';
import { ResetEverything } from '../ResetEverything.js';
import { Button } from '../ui/Button.js';
import { Checkbox } from '../ui/Checkbox.js';
import { MenuItem } from '../ui/MenuItem.js';

interface AdvancedTabProps {
  onClose: () => void;
  isDebugMode: boolean;
  onToggleDebugMode: () => void;
  externalAssetDirectories: string[];
  /** Settings "Reset everything" (sends resetAllToDefault after cleaning the editor). */
  onResetAll: () => void;
}

/** Asset directories, the debug view and the danger zone. */
export function AdvancedTab({
  onClose,
  isDebugMode,
  onToggleDebugMode,
  externalAssetDirectories,
  onResetAll,
}: AdvancedTabProps) {
  const tc = useT(chrome);
  const [assetDirDraft, setAssetDirDraft] = useState('');
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
    <>
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
      <Checkbox label={tc('debugView')} checked={isDebugMode} onChange={onToggleDebugMode} />
      <div className="mt-8 pt-6 border-t border-border">
        <div className="py-4 px-10 text-reset-text">{tc('dangerZone')}</div>
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
      </div>
    </>
  );
}
