import type { Engine } from '../cats/catsApi.js';
import { ENGINE_LABELS } from '../cats/catsApi.js';
import { catsApi } from '../cats/catsClient.js';
import { useCats } from '../cats/useCats.js';
import { CLAUDE_CODE_INSTALL_COMMAND } from '../constants.js';
import { EngineNotice } from '../engines/EngineNotice.js';
import { engineProblem, engineStatusLine } from '../engines/engineReadiness.js';
import type { IntroStepId } from './introSteps.js';
import { CODEX_INSTALL_COMMAND, ISSUES_URL } from './introSteps.js';

// Body text uses the reading font (index.css prose tokens); the title keeps the pixel font.
const P = 'prose-body m-0 mb-8';
const LINK = 'text-accent-bright hover:text-accent no-underline';

/**
 * The body text of one Intro step. The consent step renders the server's
 * disclosure verbatim: it is the exact terms being approved, so the webview
 * keeps no copy of its own. Every other step is orientation only.
 */
export function IntroStepBody({
  id,
  disclosure,
  installFailed,
}: {
  id: IntroStepId;
  disclosure: string;
  installFailed: boolean;
}) {
  switch (id) {
    case 'welcome':
      return (
        <p className={P}>
          Every Claude Code or Codex session becomes a cat in this office. Cats type while their
          agent works, wander off when it is done, and speak up when it needs you.
        </p>
      );
    case 'engines':
      return <EnginesBody />;
    case 'consent':
      return (
        <>
          {disclosure.split('\n\n').map((paragraph, i) => (
            <p key={i} className={P}>
              {paragraph}
            </p>
          ))}
        </>
      );
    case 'ceo':
      return (
        <p className={P}>
          Talk to the CEO in the chat on the right. Paste screenshots, files and links like in a
          terminal. It hands the work to the team and brings back the result.
        </p>
      );
    case 'lead':
      return (
        <p className={P}>
          The lead sits here: it is the boss of your team. The CEO hands work to the lead, who
          splits it for the team. Click Cats to edit each cat's role, engine, model and rules.
          Hierarchy shows who reports to whom.
        </p>
      );
    case 'office':
      return (
        <p className={P}>
          Click Layout to change the office: press R to turn any item. Add pets, toys and coffee.
          Between tasks the cats live their own life here.
        </p>
      );
    case 'closing':
      return (
        <>
          {installFailed ? (
            <p className={P}>
              Something went wrong writing to your Claude Code settings, so the office will watch
              your sessions the slower way instead. No worries, everything still works and you can
              retry activating them any time from Settings.
            </p>
          ) : null}
          <p className={P}>
            Updates arrive in-game. Found a bug or have an idea?{' '}
            <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
              Report it on GitHub
            </a>
            .
          </p>
        </>
      );
  }
}

const ENGINES: Array<{ engine: Engine; command: string }> = [
  { engine: 'claude', command: CLAUDE_CODE_INSTALL_COMMAND },
  { engine: 'codex', command: CODEX_INSTALL_COMMAND },
];

/** Both install commands, each with the server's "not found" note when it has one. */
function EnginesBody() {
  useCats(); // re-render when the server's engine options arrive
  return (
    <>
      <p className={P}>
        Install both. Every cat can run on either engine: click Cats, pick a cat, set its Engine.
      </p>
      {ENGINES.map(({ engine, command }) => {
        const label = ENGINE_LABELS[engine];
        const options = catsApi.engineOptions(engine);
        // Reasons may repeat the label ("Codex: no adapter ..."): say it once.
        const unavailable = options.unavailable?.replace(`${label}: `, '');
        const status = engineStatusLine(options);
        const problem = engineProblem(engine, options);
        return (
          <div key={engine} className="mb-8" data-testid={`intro-engine-${engine}`}>
            <div className="text-sm mb-2">
              {label}
              {status ? (
                <span
                  className={`prose-body prose-small ${problem ? 'text-warning' : 'text-status-success'}`}
                >
                  {` - ${status}`}
                </span>
              ) : unavailable ? (
                <span className="prose-body prose-small text-warning">{` - ${unavailable}`}</span>
              ) : null}
            </div>
            {problem?.needsLogin ? (
              // The status line above already says "not logged in": no second reason line.
              <EngineNotice engine={engine} showReason={false} />
            ) : (
              <div className="prose-code bg-btn-bg border-2 border-border py-4 px-8 select-all">
                {command}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
