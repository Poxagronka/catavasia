import { Button } from './ui/Button.js';

/** The word the user types to confirm. */
export const RESET_WORD = 'RESET';

interface ResetEverythingProps {
  /** Confirm state lives in the caller, so this stays a pure function of props. */
  confirming: boolean;
  onConfirmingChange: (confirming: boolean) => void;
  typed: string;
  onTypedChange: (typed: string) => void;
  /** Runs only after the user typed RESET and pressed the button. */
  onReset: () => void;
  /** The last resetAllResult (backup folder or error), shown under the button. */
  result: { backupDir?: string; error?: string } | null;
}

/** Settings "Reset everything": a two-step confirm, the second step needs the typed word. */
export function ResetEverything({
  confirming,
  onConfirmingChange,
  typed,
  onTypedChange,
  onReset,
  result,
}: ResetEverythingProps) {
  const close = () => {
    onTypedChange('');
    onConfirmingChange(false);
  };
  if (!confirming) {
    return (
      <div className="flex flex-col items-start gap-4">
        <Button
          variant="default"
          size="md"
          onClick={() => onConfirmingChange(true)}
          title="Start from scratch: default cats, layout and pets"
        >
          Reset everything
        </Button>
        {result?.backupDir && (
          <span className="prose-body prose-small text-text-muted break-all">
            Reset done. Old files: {result.backupDir}
          </span>
        )}
        {result?.error && (
          <span className="prose-body prose-small text-reset-text">{result.error}</span>
        )}
      </div>
    );
  }
  const armed = typed === RESET_WORD;
  return (
    <div className="flex flex-col gap-4">
      <span className="prose-body text-reset-text">
        Your cats, their prompts, the layout and the pets go back to the defaults. A backup is saved
        first. Type {RESET_WORD} to confirm.
      </span>
      <input
        type="text"
        value={typed}
        placeholder={RESET_WORD}
        aria-label={`Type ${RESET_WORD} to confirm`}
        onChange={(e) => onTypedChange(e.target.value)}
        className="text-xs py-2 px-4 bg-bg border-2 border-border rounded-none text-text"
      />
      <div className="flex flex-wrap gap-4">
        <Button
          variant={armed ? 'default' : 'disabled'}
          size="md"
          className={armed ? 'bg-danger text-white' : ''}
          disabled={!armed}
          onClick={() => {
            if (!armed) return;
            close();
            onReset();
          }}
        >
          Reset everything now
        </Button>
        <Button variant="default" size="md" onClick={close}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
