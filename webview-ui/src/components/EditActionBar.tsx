import { useState } from 'react';

import type { useEditorActions } from '../hooks/useEditorActions.js';
import type { EditorState } from '../office/editor/editorState.js';
import { Button } from './ui/Button.js';

interface EditActionBarProps {
  editor: ReturnType<typeof useEditorActions>;
  editorState: EditorState;
}

/** Edit-mode actions. Undo/Redo/Save/Reset need unsaved changes; Default is always there. */
export function EditActionBar({ editor, editorState: es }: EditActionBarProps) {
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
            title="Undo (Ctrl+Z)"
          >
            Undo
          </Button>
          <Button
            variant={redoDisabled ? 'disabled' : 'default'}
            size="md"
            onClick={redoDisabled ? undefined : editor.handleRedo}
            title="Redo (Ctrl+Y)"
          >
            Redo
          </Button>
          <Button variant="default" size="md" onClick={editor.handleSave} title="Save layout">
            Save
          </Button>
          {!showResetConfirm ? (
            <Button
              variant="default"
              size="md"
              onClick={() => setShowResetConfirm(true)}
              title="Reset to last saved layout"
            >
              Reset
            </Button>
          ) : (
            <div className="flex gap-4 items-center">
              <span className="text-base text-reset-text">Reset?</span>
              <Button
                variant="default"
                size="md"
                className="bg-danger text-white"
                onClick={() => {
                  setShowResetConfirm(false);
                  editor.handleReset();
                }}
              >
                Yes
              </Button>
              <Button variant="default" size="md" onClick={() => setShowResetConfirm(false)}>
                No
              </Button>
            </div>
          )}
        </>
      )}
      {!showDefaultConfirm ? (
        <Button
          variant="default"
          size="md"
          onClick={() => setShowDefaultConfirm(true)}
          title="Replace your office with the default layout"
        >
          Default
        </Button>
      ) : (
        <div className="flex gap-4 items-center">
          <span className="text-base text-reset-text">Replace with default?</span>
          <Button
            variant="default"
            size="md"
            className="bg-danger text-white"
            onClick={() => {
              setShowDefaultConfirm(false);
              editor.handleResetToDefault();
            }}
          >
            Yes
          </Button>
          <Button variant="default" size="md" onClick={() => setShowDefaultConfirm(false)}>
            No
          </Button>
        </div>
      )}
    </div>
  );
}
