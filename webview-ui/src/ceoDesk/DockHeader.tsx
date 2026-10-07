import type { Appearance } from '../cats/catsApi.js';
import { CatSprite } from '../components/cats/CatSprite.js';
import { Button } from '../components/ui/Button.js';
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

export function DockHeader(props: DockHeaderProps) {
  const { pill, privileged } = props;
  return (
    <div className="flex flex-col gap-4 px-10 pt-6 pb-6 border-b-2 border-border">
      <div className="flex items-center gap-8 min-w-0">
        <CeoFace appearance={props.appearance} />
        <span className="text-accent-bright text-lg truncate">{props.name}</span>
        <span className={`text-xs shrink-0 ${PILL_CLASS[pill.tone]}`} data-testid="dock-status">
          {pill.label}
        </span>
        <span className="flex-1" />
        {privileged && (
          <button
            type="button"
            className="quiet-btn"
            onClick={props.onConnectors}
            title="Tools Claude can use, like your mail or files (also /mcp)"
            data-testid="dock-connectors"
          >
            Connectors
          </button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={props.onCollapse}
          title="Collapse"
          data-testid="dock-collapse"
        >
          {'>'}
        </Button>
      </div>
      <div className="flex items-center gap-6 min-w-0">
        {/* Read only: the Project button of the bottom bar picks it. */}
        <span
          className="text-xs text-text-muted truncate min-w-0"
          title={props.folder ?? 'No project folder: the cats work in a sandbox'}
          data-testid="dock-project"
        >
          Project: {projectName(props.folder)}
        </span>
        {props.costUsd !== undefined && (
          <span className="text-xs text-text-muted shrink-0" title="What this chat has cost">
            ${props.costUsd.toFixed(2)}
          </span>
        )}
        <span className="flex-1" />
        {privileged && props.stoppable && (
          <Button size="sm" onClick={props.onStop} data-testid="dock-stop">
            Stop
          </Button>
        )}
        {privileged && (
          <Button size="sm" variant="ghost" onClick={props.onNewChat} data-testid="dock-new-chat">
            New chat
          </Button>
        )}
      </div>
    </div>
  );
}
