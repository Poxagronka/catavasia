import type { Engine } from '../cats/catsApi.js';
import { ENGINE_LABELS } from '../cats/catsApi.js';
import { catsApi } from '../cats/catsClient.js';
import { useCats } from '../cats/useCats.js';
import { CLAUDE_CODE_INSTALL_COMMAND } from '../constants.js';
import { EngineNotice } from '../engines/EngineNotice.js';
import { engineProblem, engineStatusLine } from '../engines/engineReadiness.js';
import { CODEX_INSTALL_COMMAND } from './constants.js';

const ENGINES: Array<{ engine: Engine; command: string }> = [
  { engine: 'claude', command: CLAUDE_CODE_INSTALL_COMMAND },
  { engine: 'codex', command: CODEX_INSTALL_COMMAND },
];

/** Both install commands, each with the server's "not found" note when it has one. */
export function EnginesPanel() {
  useCats(); // re-render when the server's engine options arrive
  return (
    <div className="mt-8">
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
              <div
                dir="ltr"
                className="prose-code bg-btn-bg border-2 border-border py-4 px-8 select-all"
              >
                {command}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
