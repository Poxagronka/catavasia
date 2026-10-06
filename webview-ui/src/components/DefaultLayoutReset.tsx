import { Button } from './ui/Button.js';

interface DefaultLayoutResetProps {
  label: string;
  /** Confirm state lives in the caller, so this stays a pure function of props. */
  confirming: boolean;
  onConfirmingChange: (confirming: boolean) => void;
  /** Runs only after the user answers Yes. */
  onReset: () => void;
}

/** Shared "replace with the default layout" button + inline Yes/No confirm. */
export function DefaultLayoutReset({
  label,
  confirming,
  onConfirmingChange,
  onReset,
}: DefaultLayoutResetProps) {
  if (!confirming) {
    return (
      <Button
        variant="default"
        size="md"
        onClick={() => onConfirmingChange(true)}
        title="Replace your office with the default layout"
      >
        {label}
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap gap-4 items-center">
      <span className="text-base text-reset-text">
        Replace with default? Custom edits are lost.
      </span>
      <Button
        variant="default"
        size="md"
        className="bg-danger text-white"
        onClick={() => {
          onConfirmingChange(false);
          onReset();
        }}
      >
        Yes
      </Button>
      <Button variant="default" size="md" onClick={() => onConfirmingChange(false)}>
        No
      </Button>
    </div>
  );
}
