import { useState } from 'react';

import { Button } from '../ui/Button.js';
import { createTask } from './taskApi.js';

interface NewTaskFormProps {
  defaultCwd: string;
  onCreated: () => void;
  onCancel: () => void;
}

const FIELD = 'w-full bg-bg-dark border-2 border-border text-text p-6 rounded-none outline-none';

export function NewTaskForm({ defaultCwd, onCreated, onCancel }: NewTaskFormProps) {
  const [prompt, setPrompt] = useState('');
  const [cwd, setCwd] = useState(defaultCwd);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await createTask({ prompt, cwd: cwd.trim() || undefined });
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
      <div className="text-2xs text-warning">
        Runs claude with no permission prompts, in a git worktree on branch task/&lt;id&gt;.
      </div>
      {error && <div className="text-xs text-status-error">{error}</div>}
      <div className="flex gap-6 justify-end">
        <Button size="md" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="md"
          variant={prompt.trim() && !busy ? 'accent' : 'disabled'}
          disabled={!prompt.trim() || busy}
          onClick={() => void submit()}
        >
          {busy ? 'Starting...' : 'Start'}
        </Button>
      </div>
    </div>
  );
}
