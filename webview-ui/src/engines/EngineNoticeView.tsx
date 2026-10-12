import { Button } from '../components/ui/Button.js';
import type { MessageKey, Params } from '../i18n/core.js';
import { translate } from '../i18n/dictionaries.js';
import { getLanguage } from '../i18n/languageStore.js';
import { terminal } from '../i18n/terminal/en.js';
import { type EngineProblem, engineReason } from './engineReadiness.js';

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

const tr = (key: MessageKey<typeof terminal>, params?: Params): string =>
  translate(terminal, key, getLanguage(), params);

// Stands in for the command while the sentence is split around it.
const COMMAND_MARK = '\u0001';

/**
 * What is wrong with one engine and how to fix it. Pure: the tests read its element tree. */
export function EngineNoticeView({
  problem,
  showReason = true,
  privileged,
  checking,
  onLogIn,
  onCheck,
}: EngineNoticeViewProps) {
  const [before, after] = tr('runLoginCommand', { command: COMMAND_MARK }).split(COMMAND_MARK);
  return (
    <div className="flex flex-col gap-6 text-xs" data-testid={`engine-notice-${problem.engine}`}>
      {showReason && (
        <span className="prose-body prose-small text-status-permission">
          {engineReason(problem)}.
        </span>
      )}
      {problem.installCommand && (
        <>
          <span className="prose-body prose-small text-text-muted">{tr('installIt')}</span>
          <span className="prose-code bg-btn-bg border-2 border-border py-2 px-6 select-all">
            {problem.installCommand}
          </span>
        </>
      )}
      {problem.needsLogin && !privileged && (
        <span className="prose-body prose-small text-text-muted">
          {before}
          <code className="select-all">{problem.loginCommand}</code>
          {after}
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
            {tr('logIn')}
          </Button>
        )}
        <Button
          size="sm"
          variant={checking ? 'disabled' : 'default'}
          disabled={checking}
          onClick={onCheck}
          data-testid={`engine-check-${problem.engine}`}
        >
          {checking ? tr('checking') : tr('checkAgain')}
        </Button>
      </div>
    </div>
  );
}
