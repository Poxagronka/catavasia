import { useState } from 'react';

import type { CeoApproval, CeoQuestion } from '../../../core/src/ceoDesk.js';
import { deadline, questionAnswers, type QuestionPick, togglePick } from './approvalState.js';
import { ceoDeskApi } from './ceoDeskApi.js';

/**
 * A question of a cat or the CEO (Claude's AskUserQuestion): each question
 * with its options as buttons (several when the tool allows), an "Other"
 * field, Send answer and Skip. The answers go back through the approval route.
 */
export function QuestionCard({
  approval,
  questions,
}: {
  approval: CeoApproval;
  questions: CeoQuestion[];
}) {
  const [picks, setPicks] = useState<QuestionPick[]>(() =>
    questions.map(() => ({ picked: [], other: '' })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answers = questionAnswers(questions, picks);
  const setPick = (n: number, pick: QuestionPick) =>
    setPicks((all) => all.map((p, i) => (i === n ? pick : p)));
  const send = async (skip: boolean) => {
    setBusy(true);
    setError(null);
    try {
      if (skip) await ceoDeskApi.answerApproval(approval.id, 'deny');
      else await ceoDeskApi.answerApproval(approval.id, 'allow', answers ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };
  return (
    <div
      className="self-stretch pixel-panel bg-bg-dark! border-status-permission! px-10 py-8 flex flex-col gap-8 prose-body"
      data-testid="question-card"
    >
      <div>
        <span className="text-status-permission">{approval.who}</span> asks you
      </div>
      {questions.map((q, n) => (
        <div key={q.question} className="flex flex-col gap-4" data-testid="question">
          <div className="text-text">
            {q.header && <span className="composer-choice-hint mr-6">{q.header}</span>}
            {q.question}
          </div>
          {q.multiSelect && <span className="composer-note px-0!">Pick one or more.</span>}
          <div className="composer-list" role="group" aria-label={q.question}>
            {q.options.map((o) => {
              const on = picks[n].picked.includes(o.label);
              return (
                <button
                  key={o.label}
                  type="button"
                  aria-pressed={on}
                  className={`composer-choice ${on ? 'is-current' : ''}`}
                  disabled={busy}
                  onClick={() => setPick(n, togglePick(q, picks[n], o.label))}
                  data-testid="question-option"
                >
                  <span className="flex-1 flex flex-col text-left">
                    <span className="composer-choice-label">{o.label}</span>
                    {o.description && <span className="composer-choice-hint">{o.description}</span>}
                  </span>
                  <span className="composer-check" aria-hidden>
                    {on ? '✓' : ''}
                  </span>
                </button>
              );
            })}
          </div>
          <input
            value={picks[n].other}
            disabled={busy}
            onChange={(e) =>
              setPick(n, {
                picked: q.multiSelect ? picks[n].picked : [],
                other: e.target.value,
              })
            }
            placeholder="Other: type your own answer"
            aria-label={`Other answer to: ${q.question}`}
            className="bg-bg border-2 border-border rounded-[8px] px-8 py-4 prose-small outline-none focus:border-accent"
            data-testid="question-other"
          />
        </div>
      ))}
      <div className="flex gap-6 items-center">
        <button
          type="button"
          className="quiet-btn text-text!"
          disabled={busy || !answers}
          onClick={() => void send(false)}
          data-testid="question-send"
        >
          Send answer
        </button>
        <button
          type="button"
          className="quiet-btn"
          disabled={busy}
          onClick={() => void send(true)}
          data-testid="question-skip"
        >
          Skip
        </button>
      </div>
      <span className="text-2xs text-text-muted">
        No answer by {deadline(approval.expiresAt)} counts as Skip.
      </span>
      {error && <span className="prose-small text-status-error">{error}</span>}
    </div>
  );
}
