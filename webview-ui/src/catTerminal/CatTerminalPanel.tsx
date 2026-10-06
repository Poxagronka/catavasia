import { useEffect, useState } from 'react';

import { Button } from '../components/ui/Button.js';
import { sessionToken } from '../sessionToken.js';
import { catSessionApi } from './catSessionApi.js';
import { ChatConsole } from './ChatConsole.js';
import { applyFrame, EMPTY_CONSOLE, wheelBlocker } from './consoleState.js';
import { WheelTerminal } from './WheelTerminal.js';

type Tab = 'chat' | 'terminal';

interface CatTerminalPanelProps {
  catId: string;
  /** Shown in the header when the session has no title yet. */
  catLabel: string;
  onClose: () => void;
  /** Open the Prompt history of a cat (a prompt edit row of the Cat CEO chat). */
  onOpenPromptHistory?: (catId: string) => void;
}

function StatusBadge({ busy, wheelHeld }: { busy: boolean; wheelHeld: boolean }) {
  const [label, cls] = wheelHeld
    ? ['wheel taken', 'text-status-permission']
    : busy
      ? ['working', 'text-status-active pixel-pulse']
      : ['idle', 'text-status-success'];
  return <span className={`text-xs shrink-0 ${cls}`}>{label}</span>;
}

/**
 * The cat terminal: a docked panel with the chat console (default) and the
 * "take the wheel" tab, which opens a real `claude --resume` PTY while the cat
 * is idle. Docked, not modal, so the office stays visible next to it.
 */
export function CatTerminalPanel({
  catId,
  catLabel,
  onClose,
  onOpenPromptHistory,
}: CatTerminalPanelProps) {
  const [state, setState] = useState(EMPTY_CONSOLE);
  const [tab, setTab] = useState<Tab>('chat');
  const [driving, setDriving] = useState(false);
  const [wheelNote, setWheelNote] = useState<string | null>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    setState(EMPTY_CONSOLE);
    setGone(false);
    return catSessionApi.subscribe(
      catId,
      (frame) => setState((s) => applyFrame(s, frame)),
      () => setGone(true),
    );
  }, [catId]);

  const blocker = wheelBlocker(state.status, !!sessionToken);
  // Re-read on every status frame (each one re-renders this panel).
  const canDrive = state.loaded && catSessionApi.canTakeWheel(catId);

  return (
    <div
      className="fixed top-8 bottom-76 pixel-panel flex flex-col"
      // Left of the CEO dock when it is open (CeoDock sets --dock-width).
      style={{
        zIndex: 45,
        right: 'calc(8px + var(--dock-width, 0px))',
        width: 'min(620px, calc(100vw - 16px - var(--dock-width, 0px)))',
      }}
      data-testid="cat-terminal-panel"
    >
      <div className="flex items-center gap-8 px-10 py-4 border-b-2 border-border">
        <span className="text-accent-bright text-lg truncate flex-1" title={state.title}>
          {state.title || catLabel}
        </span>
        <StatusBadge busy={state.status.busy} wheelHeld={state.status.wheelHeld} />
        <Button variant="ghost" size="icon" onClick={onClose} title="Close">
          x
        </Button>
      </div>
      <div className="flex gap-4 px-10 pt-6 border-b-2 border-border">
        {(['chat', 'terminal'] as const).map((t) => (
          <Button
            key={t}
            variant={tab === t ? 'active' : 'ghost'}
            size="sm"
            onClick={() => setTab(t)}
            data-testid={`cat-tab-${t}`}
          >
            {t === 'chat' ? 'Chat' : 'Terminal'}
          </Button>
        ))}
      </div>
      {gone && (
        <div className="flex-1 flex items-center justify-center p-16 text-center text-sm text-text-muted">
          This cat has no session the console can open yet. Cats started from the task board have
          one.
        </div>
      )}
      {!gone && tab === 'chat' && (
        <ChatConsole
          state={state}
          onSend={(text) => catSessionApi.send(catId, text)}
          onOpenPromptHistory={onOpenPromptHistory}
        />
      )}
      {!gone && driving && (
        <div className={`flex-1 min-h-0 flex-col ${tab === 'terminal' ? 'flex' : 'hidden'}`}>
          <div className="flex items-center gap-8 px-10 py-4 text-xs text-text-muted">
            <span className="flex-1">You drive the cat's session. The cat waits.</span>
            <Button variant="default" size="sm" onClick={() => setDriving(false)}>
              Give it back
            </Button>
          </div>
          <WheelTerminal
            catId={catId}
            onEnded={(message) => {
              setDriving(false);
              setWheelNote(message ?? 'The session went back to the cat.');
            }}
          />
        </div>
      )}
      {!gone && tab === 'terminal' && !driving && (
        <div className="flex-1 flex flex-col items-center justify-center gap-12 p-16 text-center">
          <span className="text-sm text-text-muted max-w-[420px]">
            Take the wheel opens the real Claude Code terminal on this cat's session. The cat pauses
            until you give it back.
          </span>
          {wheelNote && <span className="text-xs text-status-permission">{wheelNote}</span>}
          <Button
            variant={canDrive ? 'accent' : 'disabled'}
            size="md"
            disabled={!canDrive}
            onClick={() => {
              setWheelNote(null);
              setDriving(true);
            }}
            data-testid="cat-take-wheel"
          >
            Take the wheel
          </Button>
          {blocker && <span className="text-xs text-text-muted">{blocker}</span>}
        </div>
      )}
    </div>
  );
}
