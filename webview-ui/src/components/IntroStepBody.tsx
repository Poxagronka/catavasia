import type { Engine } from '../cats/catsApi.js';
import { ENGINE_LABELS } from '../cats/catsApi.js';
import { catsApi } from '../cats/catsClient.js';
import { useCats } from '../cats/useCats.js';
import { CLAUDE_CODE_INSTALL_COMMAND } from '../constants.js';
import type { IntroStepId } from './introSteps.js';
import { CODEX_INSTALL_COMMAND, ISSUES_URL } from './introSteps.js';

const P = 'text-sm m-0 mb-8';
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
          This is the CEO's desk. Click a cat, then its chat icon to open Chat (the Terminal tab is
          next to it). Ask the CEO anything.
        </p>
      );
    case 'lead':
      return (
        <p className={P}>
          The lead sits here: it is the boss of your team. Click Cats to edit each cat's role,
          engine, model and rules. Hierarchy shows who reports to whom.
        </p>
      );
    case 'tasks':
      return (
        <p className={P}>
          Click the whiteboard (or Tasks) to give the team a task. The boss splits it and delegates
          the parts. Each cat works in its own git worktree.
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
        // Reasons may repeat the label ("Codex: no adapter ..."): say it once.
        const unavailable = catsApi.engineOptions(engine).unavailable?.replace(`${label}: `, '');
        return (
          <div key={engine} className="mb-8" data-testid={`intro-engine-${engine}`}>
            <div className="text-sm mb-2">
              {label}
              {unavailable ? <span className="text-warning">{` - ${unavailable}`}</span> : null}
            </div>
            <div className="text-sm bg-btn-bg border-2 border-border py-4 px-8 select-all">
              {command}
            </div>
          </div>
        );
      })}
    </>
  );
}
