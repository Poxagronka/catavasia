import type { DeskCommand } from '../../../core/src/ceoDesk.js';
import { Button } from '../components/ui/Button.js';
import { ceoDesk } from '../i18n/ceoDesk/en.js';
import { useT } from '../i18n/useT.js';

/** Commands that open something in the dock instead of going to Claude. */
const OPENS_HERE = new Set([
  'model',
  'effort',
  'permissions',
  'context',
  'usage',
  'clear',
  'help',
  'mcp',
]);

/** The /help card: every command, the ones the dock opens first. A click puts it in the box. */
export function HelpCard({
  commands,
  onPick,
  onClose,
}: {
  commands: DeskCommand[];
  onPick(text: string): void;
  onClose(): void;
}) {
  const t = useT(ceoDesk);
  const here = commands.filter((c) => OPENS_HERE.has(c.name));
  const sent = commands.filter((c) => !OPENS_HERE.has(c.name));
  const group = (title: string, list: DeskCommand[]) => (
    <div className="flex flex-col gap-2">
      <span className="prose-body prose-small text-text-muted">{title}</span>
      {list.map((c) => (
        <button
          key={c.name}
          type="button"
          className="composer-choice min-w-0 prose-body prose-small"
          onClick={() => onPick(`/${c.name} `)}
          title={c.description}
        >
          <span className="shrink-0 text-text">/{c.name}</span>
          <span className="flex-1 min-w-0 truncate text-start text-text-muted">
            {c.description}
          </span>
        </button>
      ))}
    </div>
  );
  return (
    <div
      className="self-stretch pixel-panel bg-bg-dark! px-10 py-8 flex flex-col gap-8"
      data-testid="help-card"
    >
      <div className="flex items-center gap-8">
        <span className="prose-body text-text">{t('commands')}</span>
        <span className="flex-1" />
        <Button
          size="icon"
          variant="ghost"
          onClick={onClose}
          title={t('close')}
          aria-label={t('close')}
        >
          x
        </Button>
      </div>
      <span className="prose-body prose-small text-text-muted">{t('helpIntro')}</span>
      {group(t('helpOpenHere'), here)}
      {sent.length > 0 && group(t('helpSentToClaude'), sent)}
    </div>
  );
}
