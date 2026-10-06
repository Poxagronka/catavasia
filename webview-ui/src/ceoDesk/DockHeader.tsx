import { type FormEvent, useState } from 'react';

import type { Appearance } from '../cats/catsApi.js';
import { CatSprite } from '../components/cats/CatSprite.js';
import { Button } from '../components/ui/Button.js';
import { ceoDeskApi } from './ceoDeskApi.js';
import { shortFolder, type StatusPill } from './dockState.js';

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

/** The chat's work folder: a chip that opens a path box and the recent folders. */
function FolderChip({ folder, enabled }: { folder: string | null; enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const toggle = () => {
    if (open) return setOpen(false);
    setOpen(true);
    setError(null);
    setPath(folder ?? '');
    ceoDeskApi.folders().then(
      (r) => setRecent(r.recent),
      () => setRecent([]),
    );
  };
  const choose = async (next: string | null) => {
    setError(null);
    try {
      await ceoDeskApi.setFolder(next);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void choose(path.trim() || null);
  };

  return (
    <div className="relative min-w-0">
      <Button
        size="sm"
        variant={enabled ? 'default' : 'disabled'}
        disabled={!enabled}
        onClick={toggle}
        title={folder ?? 'No project folder: jobs run in a sandbox'}
        className="max-w-[220px] truncate"
        data-testid="dock-folder"
      >
        {shortFolder(folder)}
      </Button>
      {open && (
        <form
          onSubmit={submit}
          className="absolute left-0 top-full mt-4 z-10 pixel-panel p-8 flex flex-col gap-6 w-[min(380px,calc(100vw-48px))]"
        >
          <span className="text-xs text-text-muted">Project folder (absolute path)</span>
          <input
            autoFocus
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/Users/me/project"
            className="bg-bg-dark border-2 border-border focus:border-accent outline-none px-6 py-4 prose-code text-text"
          />
          <div className="flex gap-6 flex-wrap">
            <Button size="sm" variant="accent" type="submit">
              Set
            </Button>
            <Button size="sm" type="button" onClick={() => void choose(null)}>
              Sandbox
            </Button>
          </div>
          {recent.length > 0 && <span className="text-xs text-text-muted">Recent</span>}
          {recent.map((r) => (
            <button
              key={r}
              type="button"
              className="text-left prose-code text-text-muted hover:text-text truncate bg-transparent border-0 p-0 cursor-pointer"
              onClick={() => void choose(r)}
              title={r}
            >
              {shortFolder(r)}
            </button>
          ))}
          {error && <span className="prose-body prose-small text-status-error">{error}</span>}
        </form>
      )}
    </div>
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
        <FolderChip folder={props.folder} enabled={privileged} />
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
