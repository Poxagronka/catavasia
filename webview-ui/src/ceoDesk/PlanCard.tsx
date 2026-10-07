import { useState } from 'react';

import type { CeoApproval } from '../../../core/src/ceoDesk.js';
import { Markdown } from '../components/taskBoard/Markdown.js';
import { Button } from '../components/ui/Button.js';
import { deadline, planAnswer, type PlanChoice } from './approvalState.js';
import { ceoDeskApi } from './ceoDeskApi.js';

/**
 * Claude's plan (ExitPlanMode) with the CLI's choices: approve and accept
 * edits, approve and ask for each edit, or keep planning with optional words
 * for Claude. The server closes the card when it is answered.
 */
export function PlanCard({ approval, plan }: { approval: CeoApproval; plan: string }) {
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
  return (
    <div
      className="self-stretch pixel-panel bg-bg-dark! border-status-permission! px-10 py-8 flex flex-col gap-8 prose-body"
      data-testid="plan-card"
    >
      <div>
        <span className="text-status-permission">{approval.who}</span> has a plan. Start work on it?
      </div>
      <Markdown text={plan} className="border-l-2 border-border pl-8" />
      <div className="flex gap-6 items-center flex-wrap">
        {button('acceptEdits', 'Approve, auto-accept edits', 'accent')}
        {button('ask', 'Approve, ask for each edit', 'default')}
      </div>
      <div className="flex gap-6 items-center">
        <input
          value={feedback}
          disabled={busy}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="What to change (optional)"
          aria-label="What to change in the plan"
          className="flex-1 min-w-0 bg-bg border-2 border-border rounded-[8px] px-8 py-4 prose-small outline-none focus:border-accent"
          data-testid="plan-feedback"
        />
        {button('keepPlanning', 'Keep planning', 'default')}
      </div>
      <span className="text-2xs text-text-muted">
        No answer by {deadline(approval.expiresAt)} counts as Keep planning.
      </span>
      {error && <span className="prose-small text-status-error">{error}</span>}
    </div>
  );
}
