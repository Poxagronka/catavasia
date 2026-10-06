import { useState } from 'react';

import type { TaskTarget } from '../../../../core/src/tasks.js';
import { catsApi } from '../../cats/catsClient.js';
import { useCats } from '../../cats/useCats.js';
import { EngineNotice } from '../../engines/EngineNotice.js';
import { engineProblem } from '../../engines/engineReadiness.js';
import { Button } from '../ui/Button.js';
import { createTask } from './taskApi.js';
import { defaultTarget, startBlocker } from './taskFormat.js';

interface NewTaskFormProps {
  defaultCwd: string;
  /** Team and cats from the server; empty hides the "Who" field. */
  targets: TaskTarget[];
  onCreated: () => void;
  onCancel: () => void;
}

const FIELD = 'w-full bg-bg-dark border-2 border-border text-text p-6 rounded-none outline-none';

export function NewTaskForm({ defaultCwd, targets, onCreated, onCancel }: NewTaskFormProps) {
  const [prompt, setPrompt] = useState('');
  const [cwd, setCwd] = useState(defaultCwd);
  /** '' = one plain run (no cat office). With cats, the team (the boss) is the default. */
  const [picked, setTarget] = useState<string | null>(null);
  const target = picked ?? defaultTarget(targets);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useCats(); // re-render when the engine status changes
  const claudeProblem = engineProblem('claude', catsApi.engineOptions('claude'))?.reason ?? null;
  const blocker = startBlocker(targets, target, claudeProblem);
  const canStart = !!prompt.trim() && !busy && !blocker;

  const submit = async () => {
    if (!canStart) return;
    setBusy(true);
    setError(null);
    try {
      await createTask({ prompt, cwd: cwd.trim() || undefined, target: target || undefined });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-8 border-b-2 border-border">
      <textarea
        autoFocus
        className={`${FIELD} h-120 resize-none text-sm`}
        placeholder="What should the cat do?"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          // Keep office shortcuts (R, T, Esc...) out of the textarea.
          e.stopPropagation();
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit();
          if (e.key === 'Escape') onCancel();
        }}
      />
      <label className="text-xs text-text-muted">
        Folder
        <input
          className={`${FIELD} text-xs mt-2`}
          value={cwd}
          onChange={(e) => setCwd(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          spellCheck={false}
        />
      </label>
      {targets.length > 0 && (
        <label className="text-xs text-text-muted">
          Who
          <select
            className={`${FIELD} text-xs mt-2`}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            data-testid="task-target"
          >
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.disabled ? `${t.label} (${t.disabled})` : t.label}
              </option>
            ))}
            <option value="">One cat, plain run (no profile)</option>
          </select>
          <span className="block mt-2 text-2xs">
            {target === 'team'
              ? 'The boss splits the task and delegates down the hierarchy.'
              : target
                ? 'Only this cat works on it; it may delegate to its own reports.'
                : 'A plain run outside the hierarchy.'}
          </span>
        </label>
      )}
      <div className="text-2xs text-warning">
        Runs claude with no permission prompts, in a git worktree on branch task/&lt;id&gt;.
      </div>
      {error && <div className="text-xs text-status-error">{error}</div>}
      {blocker && (
        <div className="flex flex-col gap-4" data-testid="task-start-blocker">
          {/* The notice names the problem and the fix; without a probe result, the reason alone. */}
          {engineProblem(blocker.engine, catsApi.engineOptions(blocker.engine)) ? (
            <EngineNotice engine={blocker.engine} />
          ) : (
            <span className="text-xs text-status-error">Cannot start: {blocker.reason}.</span>
          )}
        </div>
      )}
      <div className="flex gap-6 justify-end">
        <Button size="md" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="md"
          variant={canStart ? 'accent' : 'disabled'}
          disabled={!canStart}
          title={blocker ? blocker.reason : undefined}
          data-testid="task-start"
          onClick={() => void submit()}
        >
          {busy ? 'Starting...' : 'Start'}
        </Button>
      </div>
    </div>
  );
}
