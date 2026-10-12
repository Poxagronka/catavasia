import { useState } from 'react';

import type { CeoApproval, CeoApprovalAnswer } from '../../../core/src/ceoDesk.js';
import { Button } from '../components/ui/Button.js';
import { ceoDesk } from '../i18n/ceoDesk/en.js';
import { useT } from '../i18n/useT.js';
import { deadline, splitWho, WHO_MARK } from './approvalState.js';
import { ceoDeskApi } from './ceoDeskApi.js';

type Answer = CeoApprovalAnswer['answer'];

/**
 * One action of a cat or the CEO that waits for the user: who, what in plain
 * words, the command or file, and Allow / Deny (plus Always allow when the
 * engine offers a rule). The server closes the card when it is answered.
 */
export function ApprovalCard({ approval }: { approval: CeoApproval }) {
  const t = useT(ceoDesk);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answer = async (value: Answer) => {
    setBusy(true);
    setError(null);
    try {
      await ceoDeskApi.answerApproval(approval.id, { answer: value });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };
  const button = (value: Answer, label: string, variant: 'accent' | 'default') => (
    <Button
      size="sm"
      variant={busy ? 'disabled' : variant}
      disabled={busy}
      onClick={() => void answer(value)}
      data-testid={`approval-${value}`}
    >
      {label}
    </Button>
  );
  const [before, after] = splitWho(t('approvalWants', { who: WHO_MARK, action: approval.action }));
  return (
    <div
      className="self-stretch pixel-panel bg-bg-dark! border-status-permission! px-10 py-8 flex flex-col gap-6"
      data-testid="approval-card"
    >
      <div className="prose-body">
        {before}
        <span className="text-status-permission">{approval.who}</span>
        {after}
      </div>
      {approval.detail && (
        <code className="prose-code text-text break-all whitespace-pre-wrap">
          {approval.detail}
        </code>
      )}
      <div className="flex gap-6 items-center flex-wrap">
        {button('allow', t('allow'), 'accent')}
        {approval.canAlwaysAllow && button('always', t('alwaysAllow'), 'default')}
        {button('deny', t('deny'), 'default')}
      </div>
      <span className="text-2xs text-text-muted">
        {t('deadlineDeny', { time: deadline(approval.expiresAt) })}
      </span>
      {error && <span className="prose-body prose-small text-status-error">{error}</span>}
    </div>
  );
}
