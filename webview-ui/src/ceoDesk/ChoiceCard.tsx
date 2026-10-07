import type { DeskCommand } from '../../../core/src/ceoDesk.js';
import { Button } from '../components/ui/Button.js';

/**
 * A list of choices in a composer menu (the Claude app look): a name, an
 * optional plain line under it, and a check mark on the current one.
 */
export function Choices({
  note,
  value,
  options,
  onPick,
  testId,
}: {
  note?: string;
  value: string;
  options: { value: string; label: string; hint?: string }[];
  onPick(v: string): void;
  testId: string;
}) {
  return (
    <div className="composer-list prose-body" role="menu">
      {note && <span className="composer-note">{note}</span>}
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="menuitemradio"
          aria-checked={o.value === value}
          className="composer-choice"
          onClick={() => onPick(o.value)}
          data-testid={`${testId}-${o.value}`}
        >
          <span className="flex-1 flex flex-col text-left">
            <span className="composer-choice-label">{o.label}</span>
            {o.hint && <span className="composer-choice-hint">{o.hint}</span>}
          </span>
          <span className="composer-check" aria-hidden>
            {o.value === value ? '✓' : ''}
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * The picker of a command with fixed choices (/output-style lists the styles,
 * as the terminal does). A pick sends "/name value" to Claude.
 */
export function ChoiceCard({
  command,
  onPick,
  onClose,
}: {
  command: DeskCommand;
  onPick(text: string): void;
  onClose(): void;
}) {
  return (
    <div
      className="self-stretch pixel-panel bg-bg-dark! px-10 py-8 flex flex-col gap-8"
      data-testid="choice-card"
    >
      <div className="flex items-center gap-8">
        <span className="prose-body text-text">/{command.name}</span>
        <span className="flex-1" />
        <Button size="icon" variant="ghost" onClick={onClose} title="Close" aria-label="Close">
          x
        </Button>
      </div>
      <Choices
        note={command.description}
        value=""
        options={(command.choices ?? []).map((c) => ({ value: c, label: c }))}
        onPick={(value) => onPick(`/${command.name} ${value}`)}
        testId="choice"
      />
    </div>
  );
}
