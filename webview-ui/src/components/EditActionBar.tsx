import { useState } from 'react';

import type { useEditorActions } from '../hooks/useEditorActions.js';
import { chrome } from '../i18n/chrome/en.js';
import { useT } from '../i18n/useT.js';
import type { EditorState } from '../office/editor/editorState.js';
import { DefaultLayoutReset } from './DefaultLayoutReset.js';
import { Button } from './ui/Button.js';

interface EditActionBarProps {
  editor: ReturnType<typeof useEditorActions>;
  editorState: EditorState;
}

/** Edit-mode actions. Undo/Redo/Save/Reset need unsaved changes; Default is always there. */
export function EditActionBar({ editor, editorState: es }: EditActionBarProps) {
  const t = useT(chrome);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showDefaultConfirm, setShowDefaultConfirm] = useState(false);

  const undoDisabled = es.undoStack.length === 0;
  const redoDisabled = es.redoStack.length === 0;

  return (
    <div className="absolute top-8 left-1/2 -translate-x-1/2 z-10 flex gap-4 items-center pixel-panel p-4">
      {editor.isDirty && (
        <>
          <Button
            variant={undoDisabled ? 'disabled' : 'default'}
            size="md"
            onClick={undoDisabled ? undefined : editor.handleUndo}
            title={t('undoTitle')}
          >
            {t('undo')}
          </Button>
          <Button
            variant={redoDisabled ? 'disabled' : 'default'}
            size="md"
            onClick={redoDisabled ? undefined : editor.handleRedo}
            title={t('redoTitle')}
          >
            {t('redo')}
          </Button>
          <Button variant="default" size="md" onClick={editor.handleSave} title={t('saveTitle')}>
            {t('save')}
          </Button>
          {!showResetConfirm ? (
            <Button
              variant="default"
              size="md"
              onClick={() => setShowResetConfirm(true)}
              title={t('resetTitle')}
            >
              {t('reset')}
            </Button>
          ) : (
            <div className="flex gap-4 items-center">
              <span className="text-base text-reset-text">{t('resetQuestion')}</span>
              <Button
                variant="default"
                size="md"
                className="bg-danger text-white"
                onClick={() => {
                  setShowResetConfirm(false);
                  editor.handleReset();
                }}
              >
                {t('yes')}
              </Button>
              <Button variant="default" size="md" onClick={() => setShowResetConfirm(false)}>
                {t('no')}
              </Button>
            </div>
          )}
        </>
      )}
      <DefaultLayoutReset
        label={t('defaultButton')}
        confirming={showDefaultConfirm}
        onConfirmingChange={setShowDefaultConfirm}
        onReset={editor.handleResetToDefault}
      />
    </div>
  );
}
