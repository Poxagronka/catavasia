import { useEffect, useRef, useState } from 'react';

import type { WorkspaceFolder } from '../hooks/useExtensionMessages.js';
import { chrome } from '../i18n/chrome/en.js';
import { common } from '../i18n/common/en.js';
import { useT } from '../i18n/useT.js';
import { isBrowserRuntime } from '../runtime.js';
import { sessionToken } from '../sessionToken.js';
import { transport } from '../transport/index.js';
import { ProjectButton } from './ProjectButton.js';
import { Button } from './ui/Button.js';
import { Dropdown, DropdownItem } from './ui/Dropdown.js';

interface BottomToolbarProps {
  isEditMode: boolean;
  onOpenClaude: () => void;
  onToggleEditMode: () => void;
  isSettingsOpen: boolean;
  onToggleSettings: () => void;
  isCatsOpen: boolean;
  onToggleCats: () => void;
  isHierarchyOpen: boolean;
  onToggleHierarchy: () => void;
  isFeedbackOpen: boolean;
  onToggleFeedback: () => void;
  workspaceFolders: WorkspaceFolder[];
}

export function BottomToolbar({
  isEditMode,
  onOpenClaude,
  onToggleEditMode,
  isSettingsOpen,
  onToggleSettings,
  isCatsOpen,
  onToggleCats,
  isHierarchyOpen,
  onToggleHierarchy,
  isFeedbackOpen,
  onToggleFeedback,
  workspaceFolders,
}: BottomToolbarProps) {
  const t = useT(chrome);
  const tc = useT(common);
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false);
  const [isBypassMenuOpen, setIsBypassMenuOpen] = useState(false);
  const folderPickerRef = useRef<HTMLDivElement>(null);
  const pendingBypassRef = useRef(false);
  // Close folder picker / bypass menu on outside click
  useEffect(() => {
    if (!isFolderPickerOpen && !isBypassMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (folderPickerRef.current && !folderPickerRef.current.contains(e.target as Node)) {
        setIsFolderPickerOpen(false);
        setIsBypassMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isFolderPickerOpen, isBypassMenuOpen]);

  const hasMultipleFolders = workspaceFolders.length > 1;

  const handleAgentClick = () => {
    setIsBypassMenuOpen(false);
    pendingBypassRef.current = false;
    if (hasMultipleFolders) {
      setIsFolderPickerOpen((v) => !v);
    } else {
      onOpenClaude();
    }
  };

  const handleAgentHover = () => {
    if (!isFolderPickerOpen) {
      setIsBypassMenuOpen(true);
    }
  };

  const handleAgentLeave = () => {
    if (!isFolderPickerOpen) {
      setIsBypassMenuOpen(false);
    }
  };

  const handleFolderSelect = (folder: WorkspaceFolder) => {
    setIsFolderPickerOpen(false);
    const bypassPermissions = pendingBypassRef.current;
    pendingBypassRef.current = false;
    transport.send({ type: 'launchAgent', folderPath: folder.path, bypassPermissions });
  };

  const handleBypassSelect = (bypassPermissions: boolean) => {
    setIsBypassMenuOpen(false);
    if (hasMultipleFolders) {
      pendingBypassRef.current = bypassPermissions;
      setIsFolderPickerOpen(true);
    } else {
      transport.send({ type: 'launchAgent', bypassPermissions });
    }
  };

  return (
    <div className="absolute bottom-10 left-10 z-20 flex items-center gap-4 pixel-panel p-4">
      {/* Hide + Agent in standalone browser mode (no terminal to interact with) */}
      {!isBrowserRuntime && (
        <div
          ref={folderPickerRef}
          className="relative"
          onMouseEnter={handleAgentHover}
          onMouseLeave={handleAgentLeave}
        >
          <Button
            variant="accent"
            onClick={handleAgentClick}
            className={
              isFolderPickerOpen || isBypassMenuOpen
                ? 'bg-accent-bright'
                : 'bg-accent hover:bg-accent-bright'
            }
          >
            {t('addAgent')}
          </Button>
          <Dropdown isOpen={isBypassMenuOpen}>
            <DropdownItem onClick={() => handleBypassSelect(true)}>
              {t('skipPermissions')} <span className="text-2xs text-warning">⚠</span>
            </DropdownItem>
          </Dropdown>
          <Dropdown isOpen={isFolderPickerOpen} className="min-w-128">
            {workspaceFolders.map((folder) => (
              <DropdownItem
                key={folder.path}
                onClick={() => handleFolderSelect(folder)}
                className="text-base"
              >
                {folder.name}
              </DropdownItem>
            ))}
          </Dropdown>
        </div>
      )}
      {/* The CEO desk's project: standalone, with the server token. */}
      {isBrowserRuntime && sessionToken !== null && <ProjectButton />}
      <Button
        variant={isCatsOpen ? 'active' : 'default'}
        onClick={onToggleCats}
        title={t('catsTitle')}
      >
        {t('cats')}
      </Button>
      <Button
        variant={isHierarchyOpen ? 'active' : 'default'}
        onClick={onToggleHierarchy}
        title={t('hierarchyTitle')}
      >
        {t('hierarchy')}
      </Button>
      <Button
        variant={isEditMode ? 'active' : 'default'}
        onClick={onToggleEditMode}
        title={t('layoutTitle')}
      >
        {t('layout')}
      </Button>
      <Button
        variant={isSettingsOpen ? 'active' : 'default'}
        onClick={onToggleSettings}
        title={tc('settings')}
      >
        {tc('settings')}
      </Button>
      <Button
        variant={isFeedbackOpen ? 'active' : 'default'}
        onClick={onToggleFeedback}
        title={t('feedbackTitle')}
        data-testid="feedback-button"
      >
        {t('feedback')}
      </Button>
    </div>
  );
}
