import { useEffect, useReducer, useRef, useState } from 'react';

import { useCats } from '../cats/useCats.js';
import { Button } from '../components/ui/Button.js';
import type { ConsentChoice } from '../hooks/introTourState.js';
import { getLanguage } from '../i18n/languageStore.js';
import { chooseLanguage } from '../i18n/languageSync.js';
import { onboarding } from '../i18n/onboarding/en.js';
import { useT } from '../i18n/useT.js';
import { CatBuilder } from './CatBuilder.js';
import { ConsentStep } from './ConsentStep.js';
import {
  EXPLAIN_STEP_IDS,
  ISSUES_URL,
  ONBOARDING_PANEL_MAX_WIDTH_PX,
  ONBOARDING_Z_INDEX,
} from './constants.js';
import { ExplainStep } from './ExplainStep.js';
import { HelpChat } from './HelpChat.js';
import { LanguageStep } from './LanguageStep.js';
import { FLOW_CONSENT_ONLY, FLOW_FULL, type Phase, reduceFlow } from './onboardingFlow.js';
import { TemplatePicker } from './TemplatePicker.js';

const LINK = 'text-accent-bright hover:text-accent no-underline';

/** Phases whose footer (Back / Next) the shell draws. The others draw their own buttons. */
const SHELL_FOOTER: readonly Phase[] = ['language', 'explain'];
/** Phases with a Skip button in the header. */
const SKIPPABLE: readonly Phase[] = ['language', 'explain', 'build'];
/** Steps counted in "Step n of N": language, the explain steps, the cat builder and the last step. */
const STEP_TOTAL = EXPLAIN_STEP_IDS.length + 3;

export interface OnboardingProps {
  /** `full`: the first run (or "Run onboarding again"). `consentOnly`: an old user whose hooks ask is pending. */
  mode: 'full' | 'consentOnly';
  /** The server's hooks ask, or null while there is none. The consent step exists only while it is set. */
  consent: { headline: string; disclosure: string } | null;
  /** The closing step's verdict: the install this onboarding asked for failed. */
  installFailed: boolean;
  /** An install was sent and its verdict has not arrived: the consent step holds. */
  installPending: boolean;
  onConsentChoice: (choice: ConsentChoice) => void;
  /** Every way the onboarding ends. The caller marks it done and dismisses the ask. */
  onClose: () => void;
}

/**
 * The first-run onboarding. A full-screen overlay (below the modal stack) with one panel:
 * language → plain explanation → create cats together → [hooks consent] → done.
 * Skip leads to six ready role teams or "start without cats". The help chat is one click away on every step.
 * The step order lives in onboardingFlow.ts.
 */
export function Onboarding({
  mode,
  consent,
  installFailed,
  installPending,
  onConsentChoice,
  onClose,
}: OnboardingProps) {
  const t = useT(onboarding);
  const { cats } = useCats();
  const [flow, dispatch] = useReducer(reduceFlow, mode === 'full' ? FLOW_FULL : FLOW_CONSENT_ONLY);
  const [helpOpen, setHelpOpen] = useState(false);
  const hasConsent = consent !== null;
  const { phase } = flow;

  const next = () => dispatch({ kind: 'next', hasConsent });
  const back = () => dispatch({ kind: 'back' });

  // The held install's verdict arrived: move on past the ask. Back is disabled while pending, so the
  // fall can only happen with the consent step on screen.
  const prevPending = useRef(false);
  useEffect(() => {
    if (prevPending.current && !installPending) dispatch({ kind: 'next', hasConsent: false });
    prevPending.current = installPending;
  }, [installPending]);

  // The ask went away while it was on screen (another surface answered it).
  useEffect(() => {
    if (!hasConsent) dispatch({ kind: 'consentGone' });
  }, [hasConsent]);

  const choose = (choice: ConsentChoice) => {
    onConsentChoice(choice);
    // A decline has no outcome to wait on. An install holds the step and moves on with its verdict.
    if (choice !== 'install') dispatch({ kind: 'next', hasConsent: false });
  };

  // Skip with cats already made (a re-run) just ends the onboarding: the picker is for an empty office.
  const skip = () => (cats.length > 0 ? onClose() : dispatch({ kind: 'skip' }));
  const leaveLanguage = () => {
    chooseLanguage(getLanguage()); // persist the detected default too
    next();
  };

  // The step counter follows the main path only: the template picker and the consent ask carry no number.
  const stepNumber =
    phase === 'language'
      ? 1
      : phase === 'explain'
        ? 2 + flow.explain
        : phase === 'build'
          ? 2 + EXPLAIN_STEP_IDS.length
          : null;

  let title: string;
  switch (phase) {
    case 'language':
      title = t('languageTitle');
      break;
    case 'explain':
      title = t(`${EXPLAIN_STEP_IDS[flow.explain]}Title`);
      break;
    case 'build':
      title = t('buildIntroTitle');
      break;
    case 'template':
      title = t('templateTitle');
      break;
    case 'consent':
      title = consent?.headline ?? t('title');
      break;
    case 'done':
      title = installFailed ? t('doneFailedTitle') : t('doneTitle');
      break;
  }

  return (
    <>
      <div
        className="fixed inset-0 flex items-center justify-center bg-black/60 p-8"
        style={{ zIndex: ONBOARDING_Z_INDEX }}
        // Keep office shortcuts (R, T, Esc, Ctrl+Z...) out of the form fields.
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div
          role="dialog"
          aria-label={title}
          className="pixel-panel relative w-full max-h-[94vh] overflow-y-auto py-10 px-14 leading-[1.4]"
          style={{ maxWidth: ONBOARDING_PANEL_MAX_WIDTH_PX }}
        >
          <div className="flex items-center justify-between gap-6 mb-8">
            <span className="text-xs text-text-muted">
              {stepNumber === null ? t('title') : t('stepOf', { n: stepNumber, total: STEP_TOTAL })}
            </span>
            <div className="flex items-center gap-4">
              {SKIPPABLE.includes(phase) && (
                <Button variant="ghost" size="sm" onClick={skip}>
                  {t('skip')}
                </Button>
              )}
              <Button variant="default" size="sm" onClick={() => setHelpOpen(true)}>
                {t('help')}
              </Button>
            </div>
          </div>

          <div className="text-xl mb-8 text-accent-bright">{title}</div>

          {phase === 'language' && <LanguageStep />}
          {phase === 'explain' && <ExplainStep id={EXPLAIN_STEP_IDS[flow.explain]} />}
          {phase === 'build' && <CatBuilder onBack={back} onContinue={next} />}
          {phase === 'template' && <TemplatePicker onPicked={next} onBack={back} />}
          {phase === 'consent' && consent && (
            <ConsentStep
              disclosure={consent.disclosure}
              installPending={installPending}
              onChoice={choose}
              onBack={flow.consentOnly ? undefined : back}
            />
          )}
          {phase === 'done' && (
            <div className="flex flex-col gap-8">
              <p className="prose-body m-0">
                {installFailed ? t('doneFailedBody') : t('doneBody')}
              </p>
              <p className="prose-body m-0">
                <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
                  {t('doneIssues')}
                </a>
              </p>
              <div className="flex items-center justify-between gap-6 flex-wrap">
                {hasConsent ? (
                  <Button variant="ghost" size="sm" onClick={back}>
                    {t('back')}
                  </Button>
                ) : (
                  <span />
                )}
                <Button variant="accent" size="sm" onClick={onClose}>
                  {t('letsGo')}
                </Button>
              </div>
            </div>
          )}

          {SHELL_FOOTER.includes(phase) && (
            <div className="flex items-center justify-between gap-6 mt-10 flex-wrap">
              {phase === 'language' ? (
                <span />
              ) : (
                <Button variant="ghost" size="sm" onClick={back}>
                  {t('back')}
                </Button>
              )}
              <Button
                variant={phase === 'language' ? 'accent' : 'default'}
                size="sm"
                onClick={phase === 'language' ? leaveLanguage : next}
              >
                {t('next')}
              </Button>
            </div>
          )}
        </div>
      </div>
      <HelpChat open={helpOpen} onClose={() => setHelpOpen(false)} context="onboarding" />
    </>
  );
}
