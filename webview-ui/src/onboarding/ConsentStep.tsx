import { Button } from '../components/ui/Button.js';
import type { ConsentChoice } from '../hooks/introTourState.js';
import { onboarding } from '../i18n/onboarding/en.js';
import { useT } from '../i18n/useT.js';

/**
 * The hooks consent ask. The headline and the disclosure come from the server (hooksConsentRequest) and render
 * verbatim: they are the exact terms being approved, so the webview keeps no copy of its own. Only these three
 * buttons send anything. An install holds the step (buttons disabled) until its verdict arrives.
 */
export function ConsentStep({
  disclosure,
  installPending,
  onChoice,
  onBack,
}: {
  disclosure: string;
  installPending: boolean;
  onChoice: (choice: ConsentChoice) => void;
  /** Absent in the consent-only flow: nothing comes before the ask. */
  onBack?: () => void;
}) {
  const t = useT(onboarding);
  const hold = installPending ? 'opacity-[var(--btn-disabled-opacity)]' : '';
  return (
    <div className="flex flex-col gap-8">
      {disclosure.split('\n\n').map((paragraph, i) => (
        <p key={i} className="prose-body m-0">
          {paragraph}
        </p>
      ))}
      <div className="flex items-center justify-between gap-6 flex-wrap mt-4">
        {onBack ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={installPending}
            className={hold}
            onClick={onBack}
          >
            {t('back')}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center justify-end gap-6 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            disabled={installPending}
            className={hold}
            onClick={() => onChoice('never')}
          >
            {t('dontAskAgain')}
          </Button>
          <Button
            variant={installPending ? 'disabled' : 'default'}
            size="sm"
            disabled={installPending}
            onClick={() => onChoice('notNow')}
          >
            {t('notNow')}
          </Button>
          <Button
            variant={installPending ? 'disabled' : 'accent'}
            size="sm"
            disabled={installPending}
            onClick={() => onChoice('install')}
          >
            {installPending ? t('installing') : t('installHooks')}
          </Button>
        </div>
      </div>
    </div>
  );
}
