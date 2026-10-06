import { Button } from '../components/ui/Button.js';
import type { EngineProblem } from './engineReadiness.js';

interface EngineNoticeViewProps {
  problem: EngineProblem;
  /** The page has the server token: the Log in terminal can open. */
  privileged: boolean;
  checking: boolean;
  onLogIn: () => void;
  onCheck: () => void;
}

/** What is wrong with one engine and how to fix it. Pure: the tests read its element tree. */
export function EngineNoticeView({
  problem,
  privileged,
  checking,
  onLogIn,
  onCheck,
}: EngineNoticeViewProps) {
  return (
    <div className="flex flex-col gap-4 text-xs" data-testid={`engine-notice-${problem.engine}`}>
      <span className="text-status-permission">{problem.reason}.</span>
      {problem.installCommand && (
        <>
          <span className="text-text-muted">Install it in a terminal:</span>
          <span className="bg-btn-bg border-2 border-border py-2 px-6 select-all">
            {problem.installCommand}
          </span>
        </>
      )}
      {problem.needsLogin && !privileged && (
        <span className="text-text-muted">
          Run <span className="select-all">{problem.loginCommand}</span> in a terminal.
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
