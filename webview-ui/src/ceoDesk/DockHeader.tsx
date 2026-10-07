import type { Appearance } from '../cats/catsApi.js';
import { CatSprite } from '../components/cats/CatSprite.js';
import { ChatHistoryMenu } from './ChatHistoryMenu.js';
import { projectName, type StatusPill } from './dockState.js';

const PILL_CLASS: Record<StatusPill['tone'], string> = {
  idle: 'text-status-success',
  busy: 'text-status-active pixel-pulse',
  waiting: 'text-status-permission',
};

/** The CEO's face: the top of its sprite (the cat sits low in its 16x32 frame). */
export function CeoFace({ appearance }: { appearance?: Appearance }) {
  if (!appearance) return <span className="w-32 h-32 shrink-0" />;
  return (
    <span className="w-32 h-36 shrink-0 overflow-hidden flex items-end justify-center">
      <CatSprite appearance={appearance} zoom={2} className="-mb-14" />
    </span>
  );
}

interface DockHeaderProps {
  name: string;
  appearance?: Appearance;
  pill: StatusPill;
  folder: string | null;
  /** The open chat: its title opens the chat history. */
  chat?: { id: string; title: string };
  /** The CEO is answering (opening another chat asks first). */
  busy: boolean;
  costUsd?: number;
  /** The page has the server token. */
  privileged: boolean;
  /** A turn runs or messages wait: Stop is offered. */
  stoppable: boolean;
  onStop(): void;
  onNewChat(): void;
  /** Opens the Connectors card (also /mcp). */
  onConnectors(): void;
  onCollapse(): void;
}

/** The collapse chevron: points right, toward the edge the dock folds into. */
function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M6 3.5L10.5 8L6 12.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Two rows on the dock grid (16px sides, 28px controls, 8px gaps): the face,
 * name, status, project and collapse; then the chat title (it opens the chat
 * history) and the chat actions.
 */
export function DockHeader(props: DockHeaderProps) {
  const { pill, privileged } = props;
  return (
    <div className="relative flex flex-col gap-8 px-16 py-12 border-b-2 border-border">
      <div className="flex items-center gap-8 min-w-0">
        <CeoFace appearance={props.appearance} />
        <span className="text-accent-bright text-lg truncate">{props.name}</span>
        <span className={`dock-label shrink-0 ${PILL_CLASS[pill.tone]}`} data-testid="dock-status">
          {pill.label}
        </span>
        {/* Read only: the Project button of the bottom bar picks it. */}
        <span
          className="dock-label truncate min-w-0 ml-8"
          title={props.folder ?? 'No project folder: the cats work in a sandbox'}
          data-testid="dock-project"
        >
          Project: {projectName(props.folder)}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          className="dock-ctl is-icon"
          onClick={props.onCollapse}
          title="Collapse"
          aria-label="Collapse"
          data-testid="dock-collapse"
        >
          <ChevronIcon />
        </button>
      </div>
      <div className="flex items-center gap-8 min-w-0 h-28">
        {privileged && <ChatHistoryMenu chat={props.chat} busy={props.busy} />}
        {props.costUsd !== undefined && (
          <span className="dock-label shrink-0" title="What this chat has cost">
            ${props.costUsd.toFixed(2)}
          </span>
        )}
        <span className="flex-1" />
        {privileged && props.stoppable && (
          <button
            type="button"
            className="dock-ctl bg-btn-bg"
            onClick={props.onStop}
            data-testid="dock-stop"
          >
            Stop
          </button>
        )}
        {privileged && (
          <button
            type="button"
            className="dock-ctl"
            onClick={props.onConnectors}
            title="Tools Claude can use, like your mail or files (also /mcp)"
            data-testid="dock-connectors"
          >
            Connectors
          </button>
        )}
        {privileged && (
          <button
            type="button"
            className="dock-ctl"
            onClick={props.onNewChat}
            data-testid="dock-new-chat"
          >
            New chat
          </button>
        )}
      </div>
    </div>
  );
}
