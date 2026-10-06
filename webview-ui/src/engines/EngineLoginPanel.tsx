import { useState } from 'react';

import { type Engine, ENGINE_LABELS } from '../cats/catsApi.js';
import { catsApi } from '../cats/catsClient.js';
import { useCats } from '../cats/useCats.js';
import { WheelTerminal } from '../catTerminal/WheelTerminal.js';
import { Button } from '../components/ui/Button.js';
import { engineUi, useEngineUi } from './engineStore.js';

/**
 * The engine login terminal: the in-game terminal (WheelTerminal) running
 * `claude auth login` or `codex login`. The CLI opens the browser login; when
 * it exits, the server probes again and the notices update.
 */
export function EngineLoginPanel() {
  const { loginEngine } = useEngineUi();
  // Keyed: a new login starts with a fresh terminal.
  return loginEngine ? <LoginPanel key={loginEngine} engine={loginEngine} /> : null;
}

function LoginPanel({ engine }: { engine: Engine }) {
  useCats(); // re-render when the probe answers
  const { checking } = useEngineUi();
  const [ended, setEnded] = useState<string | null>(null);
  const label = ENGINE_LABELS[engine];
  const options = catsApi.engineOptions(engine);
  const ready = options.status?.loggedIn === true;
  return (
    <div
      className="fixed top-8 right-8 bottom-48 w-[min(620px,calc(100vw-16px))] pixel-panel flex flex-col"
      style={{ zIndex: 46 }}
      data-testid="engine-login-panel"
    >
      <div className="flex items-center gap-8 px-10 py-4 border-b-2 border-border">
        <span className="text-accent-bright text-lg truncate flex-1">Log in to {label}</span>
        <span
          className={`text-xs shrink-0 ${ready ? 'text-status-success' : 'text-status-permission'}`}
        >
          {ready ? 'logged in' : 'not logged in'}
        </span>
        <Button variant="ghost" size="icon" onClick={engineUi.closeLogin} title="Close">
          x
        </Button>
      </div>
      <div className="flex items-center gap-8 px-10 py-4 text-xs text-text-muted">
        <span className="flex-1">
          Finish the login in the browser window that opens (or follow the steps below). Then press
          Check again.
        </span>
        <Button
          size="sm"
          variant={checking ? 'disabled' : 'default'}
          disabled={checking}
          onClick={engineUi.checkAgain}
        >
          {checking ? 'Checking...' : 'Check again'}
        </Button>
      </div>
      {ended === null ? (
        <WheelTerminal
          catId={`login-${engine}`}
          engine={engine}
          onEnded={(message) => setEnded(message ?? 'The login finished.')}
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-12 p-16 text-center">
          <span className="text-sm text-text-muted">{ended}</span>
          <Button size="md" variant="default" onClick={() => setEnded(null)}>
            Run the login again
          </Button>
        </div>
      )}
    </div>
  );
}
