import { type FormEvent, useEffect, useRef, useState } from 'react';

import type { CeoFolderResponse, CeoFoldersResponse } from '../../../core/src/ceoDesk.js';
import { ceoDeskApi } from '../ceoDesk/ceoDeskApi.js';
import { projectName, shortFolder } from '../ceoDesk/dockState.js';
import { Button } from './ui/Button.js';

const PICKING_TEXT = 'A folder window is open. It can be behind this browser window.';
const NEW_PROJECT_HINT =
  'Makes a folder in catavasia-projects in your home folder and turns on version history (git), so each cat works on its own copy.';
const HISTORY_HINT =
  'This folder has no version history. Turn it on so each cat works on its own copy and you can undo changes.';

export interface ProjectPanelViewProps {
  info: CeoFoldersResponse | null;
  /** The folder window is open (the server waits for the user). */
  picking: boolean;
  error: string | null;
  onPick(): void;
  onNew(name: string): void;
  onHistory(): void;
  /** A recent project, a typed path, or null for no project. */
  onUse(path: string | null): void;
}

/** The open Project panel: the current project, the ways to pick one, and the recent ones. */
export function ProjectPanelView(props: ProjectPanelViewProps) {
  const { info, picking, error } = props;
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [typed, setTyped] = useState('');
  const folder = info?.folder ?? null;
  const recent = (info?.recent ?? []).filter((r) => r !== folder);

  const submitName = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) props.onNew(name.trim());
  };
  const submitPath = (e: FormEvent) => {
    e.preventDefault();
    if (typed.trim()) props.onUse(typed.trim());
  };

  return (
    <div
      className="absolute bottom-full left-0 mb-10 z-30 pixel-panel p-10 flex flex-col gap-8 w-[min(400px,calc(100vw-40px))]"
      data-testid="project-panel"
    >
      <div className="flex flex-col gap-2">
        <span className="text-xs text-text-muted">Project</span>
        <span className="text-lg text-accent-bright truncate" title={folder ?? ''}>
          {projectName(folder)}
        </span>
        <span className="prose-body prose-small text-text-muted">
          {folder
            ? `The cats work in ${shortFolder(folder)}.`
            : 'No project: the cats work in a scratch folder of the chat.'}
        </span>
      </div>

      {folder && info && !info.git && (
        <div className="flex flex-col gap-6 border-2 border-border p-8" data-testid="project-git">
          <span className="prose-body prose-small">{HISTORY_HINT}</span>
          <Button size="sm" variant="accent" onClick={props.onHistory} className="self-start">
            Turn on version history (git)
          </Button>
        </div>
      )}

      <div className="flex gap-6 flex-wrap">
        {info?.canPick !== false && (
          <Button
            size="sm"
            variant={picking ? 'disabled' : 'accent'}
            disabled={picking}
            onClick={props.onPick}
            data-testid="project-choose"
          >
            Choose folder…
          </Button>
        )}
        <Button
          size="sm"
          variant={naming ? 'active' : 'default'}
          onClick={() => setNaming((v) => !v)}
          data-testid="project-new"
        >
          New project…
        </Button>
      </div>
      {picking && <span className="prose-body prose-small text-text-muted">{PICKING_TEXT}</span>}

      {naming && (
        <form onSubmit={submitName} className="flex flex-col gap-6">
          <span className="prose-body prose-small text-text-muted">{NEW_PROJECT_HINT}</span>
          <div className="flex gap-6">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-site"
              aria-label="Project name"
              className="flex-1 min-w-0 bg-bg-dark border-2 border-border focus:border-accent outline-none px-6 py-4 text-text"
              data-testid="project-name"
            />
            <Button size="sm" variant="accent" type="submit" data-testid="project-create">
              Create
            </Button>
          </div>
        </form>
      )}

      {info?.canPick === false && (
        <form onSubmit={submitPath} className="flex flex-col gap-6">
          <span className="prose-body prose-small text-text-muted">
            Type the full path of the project folder.
          </span>
          <div className="flex gap-6">
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="/home/me/my-site"
              aria-label="Folder path"
              className="flex-1 min-w-0 bg-bg-dark border-2 border-border focus:border-accent outline-none px-6 py-4 prose-code text-text"
              data-testid="project-path"
            />
            <Button size="sm" variant="accent" type="submit">
              Use
            </Button>
          </div>
        </form>
      )}

      {recent.length > 0 && (
        <div className="flex flex-col gap-2" data-testid="project-recent">
          <span className="text-xs text-text-muted">Recent projects</span>
          {recent.map((r) => (
            <button
              key={r}
              type="button"
              className="flex items-baseline gap-8 min-w-0 text-left bg-transparent border-0 px-4 py-2 cursor-pointer hover:bg-btn-bg"
              onClick={() => props.onUse(r)}
              title={r}
            >
              <span className="text-text shrink-0">{projectName(r)}</span>
              <span className="prose-code text-text-muted truncate">{shortFolder(r)}</span>
            </button>
          ))}
        </div>
      )}

      {folder && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => props.onUse(null)}
          className="self-start"
          data-testid="project-none"
        >
          No project (sandbox)
        </Button>
      )}
      {error && <span className="prose-body prose-small text-status-error">{error}</span>}
    </div>
  );
}

/**
 * The office's project in the bottom bar: the folder the CEO's jobs change.
 * The only place to pick it (the CEO points the user here).
 */
export function ProjectButton() {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<CeoFoldersResponse | null>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = () =>
    ceoDeskApi.folders().then(setInfo, (err: unknown) => setError(errorText(err)));

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  /** Run a change; on success the panel closes and shows the new project. */
  const change = async (action: () => Promise<CeoFolderResponse | { cancelled: true }>) => {
    setError(null);
    try {
      const result = await action();
      await refresh();
      // A folder without history keeps the panel open: it offers to turn history on.
      if ('folder' in result && (result.git || !result.folder)) setOpen(false);
    } catch (err) {
      setError(errorText(err));
    }
  };

  const pick = async () => {
    setPicking(true);
    await change(ceoDeskApi.pickFolder);
    setPicking(false);
  };

  const toggle = () => {
    setOpen((v) => !v);
    setError(null);
    if (!open) void refresh();
  };

  return (
    <div ref={ref} className="relative">
      <Button
        variant={open ? 'active' : 'default'}
        onClick={toggle}
        title={info?.folder ?? 'No project folder: the cats work in a sandbox'}
        className="max-w-[200px] truncate"
        data-testid="project-button"
      >
        📁 {projectName(info?.folder)}
      </Button>
      {open && (
        <ProjectPanelView
          info={info}
          picking={picking}
          error={error}
          onPick={() => void pick()}
          onNew={(name) => void change(() => ceoDeskApi.newProject(name))}
          onHistory={() => void change(ceoDeskApi.startHistory)}
          onUse={(path) => void change(() => ceoDeskApi.setFolder(path))}
        />
      )}
    </div>
  );
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
