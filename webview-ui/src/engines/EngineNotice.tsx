import { useState } from 'react';

import { type Engine } from '../cats/catsApi.js';
import { catsApi } from '../cats/catsClient.js';
import { useCats } from '../cats/useCats.js';
import { Button } from '../components/ui/Button.js';
import { sessionToken } from '../sessionToken.js';
import { EngineNoticeView } from './EngineNoticeView.js';
import { engineProblem, neededEngines } from './engineReadiness.js';
import { engineUi, useEngineUi } from './engineStore.js';

/**
 * The notice for one engine, live; nothing when the engine is ready.
 * `showReason: false` drops the reason line when the caller already shows it.
 */
export function EngineNotice({
  engine,
  showReason = true,
}: {
  engine: Engine;
  showReason?: boolean;
}) {
  useCats(); // re-render when new engine options arrive
  const { checking } = useEngineUi();
  const problem = engineProblem(engine, catsApi.engineOptions(engine));
  if (!problem) return null;
  return (
    <EngineNoticeView
      problem={problem}
      showReason={showReason}
      privileged={sessionToken !== null}
      checking={checking}
      onLogIn={() => engineUi.openLogin(engine)}
      onCheck={engineUi.checkAgain}
    />
  );
}

/** Top banner: every engine the cats need that is missing or logged out. */
export function EngineBanner() {
  const { cats } = useCats();
  const [dismissed, setDismissed] = useState(false);
  const broken = neededEngines(cats).filter((e) => engineProblem(e, catsApi.engineOptions(e)));
  if (dismissed || broken.length === 0) return null;
  return (
    // Placed by the App's top banner stack (below the update offer).
    <div
      className="pixel-panel py-6 px-10 flex gap-10 items-start max-w-[480px]"
      data-testid="engine-banner"
    >
      <div className="flex flex-col gap-8 flex-1 min-w-0">
        <span className="text-sm text-accent-bright">Cats cannot work yet</span>
        {broken.map((engine) => (
          <EngineNotice key={engine} engine={engine} />
        ))}
      </div>
      <Button variant="ghost" size="icon" onClick={() => setDismissed(true)} title="Hide">
        x
      </Button>
    </div>
  );
}
