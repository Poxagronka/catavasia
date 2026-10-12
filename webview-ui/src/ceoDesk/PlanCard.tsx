import { useState } from 'react';

import type { CeoApproval } from '../../../core/src/ceoDesk.js';
import { Markdown } from '../components/taskBoard/Markdown.js';
import { Button } from '../components/ui/Button.js';
import { ceoDesk } from '../i18n/ceoDesk/en.js';
import { useT } from '../i18n/useT.js';
import { deadline, planAnswer, type PlanChoice, splitWho, WHO_MARK } from './approvalState.js';
import { ceoDeskApi } from './ceoDeskApi.js';

/**
 * Claude's plan (ExitPlanMode) with the CLI's choices: approve and accept
 * edits, approve and ask for each edit, or keep planning with optional words
 * for Claude. The server closes the card when it is answered.
 */
export function PlanCard({ approval, plan }: { approval: CeoApproval; plan: string }) {
  const t = useT(ceoDesk);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answer = async (choice: PlanChoice) => {
    setBusy(true);
    setError(null);
    try {
      await ceoDeskApi.answerApproval(approval.id, planAnswer(choice, feedback));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };
  const button = (choice: PlanChoice, label: string, variant: 'accent' | 'default') => (
    <Button
      size="sm"
      variant={busy ? 'disabled' : variant}
      disabled={busy}
      onClick={() => void answer(choice)}
      data-testid={`plan-${choice}`}
    >
      {label}
    </Button>
  );
  const [before, after] = splitWho(t('planReady', { who: WHO_MARK }));
  return (
    <div
      className="self-stretch pixel-panel bg-bg-dark! border-status-permission! px-10 py-8 flex flex-col gap-8 prose-body"
      data-testid="plan-card"
    >
      <div>
        {before}
        <span className="text-status-permission">{approval.who}</span>
        {after}
      </div>
      <Markdown text={plan} className="border-s-2 border-border ps-8" />
      <div className="flex gap-6 items-center flex-wrap">
        {button('acceptEdits', t('planApproveAuto'), 'accent')}
        {button('ask', t('planApproveAsk'), 'default')}
      </div>
      <div className="flex gap-6 items-center">
        <input
          value={feedback}
          disabled={busy}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder={t('planFeedbackPlaceholder')}
          aria-label={t('planFeedbackLabel')}
          className="flex-1 min-w-0 bg-bg border-2 border-border rounded-[8px] px-8 py-4 prose-small outline-none focus:border-accent"
          data-testid="plan-feedback"
        />
        {button('keepPlanning', t('planKeepPlanning'), 'default')}
      </div>
      <span className="text-2xs text-text-muted">
        {t('deadlineKeepPlanning', { time: deadline(approval.expiresAt) })}
      </span>
      {error && <span className="prose-small text-status-error">{error}</span>}
    </div>
  );
}
