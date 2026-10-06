import { Button } from '../components/ui/Button.js';
import type { EngineProblem } from './engineReadiness.js';

interface EngineNoticeViewProps {
  problem: EngineProblem;
  /** Show "<engine> is not logged in." (off when the caller shows its own status line). */
  showReason?: boolean;
  /** The page has the server token: the Log in terminal can open. */
  privileged: boolean;
  checking: boolean;
  onLogIn: () => void;
  onCheck: () => void;
}

/** What is wrong with one engine and how to fix it. Pure: the tests read its element tree. */
export function EngineNoticeView({
  problem,
  showReason = true,
  privileged,
  checking,
  onLogIn,
  onCheck,
}: EngineNoticeViewProps) {
  return (
    <div className="flex flex-col gap-6 text-xs" data-testid={`engine-notice-${problem.engine}`}>
      {showReason && (
        <span className="prose-body prose-small text-status-permission">{problem.reason}.</span>
      )}
      {problem.installCommand && (
        <>
          <span className="prose-body prose-small text-text-muted">Install it in a terminal:</span>
          <span className="prose-code bg-btn-bg border-2 border-border py-2 px-6 select-all">
            {problem.installCommand}
          </span>
        </>
      )}
      {problem.needsLogin && !privileged && (
        <span className="prose-body prose-small text-text-muted">
          Run <code className="select-all">{problem.loginCommand}</code> in a terminal.
        </span>
      )}
      <div className="flex gap-6 flex-wrap">
        {problem.needsLogin && privileged && (
          <Button
            size="sm"
            variant="accent"
            onClick={onLogIn}
            data-testid={`engine-login-${problem.engine}`}
          >
            Log in
          </Button>
        )}
        <Button
          size="sm"
          variant={checking ? 'disabled' : 'default'}
          disabled={checking}
          onClick={onCheck}
          data-testid={`engine-check-${problem.engine}`}
        >
          {checking ? 'Checking...' : 'Check again'}
        </Button>
      </div>
    </div>
  );
}
