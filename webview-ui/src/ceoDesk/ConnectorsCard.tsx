import { useEffect, useState } from 'react';

import {
  type CeoConnectorAddRequest,
  type CeoConnectorsResponse,
  type Connector,
  CONNECTOR_NAME_PATTERN,
} from '../../../core/src/ceoDesk.js';
import { Button } from '../components/ui/Button.js';
import { ceoDeskApi } from './ceoDeskApi.js';

const CLAUDE_AI_CONNECTORS = 'https://claude.ai/customize/connectors';

const STATUS: Record<Connector['status'], { label: string; tone: string }> = {
  connected: { label: 'Working', tone: 'text-status-success' },
  'needs-auth': { label: 'Needs sign-in', tone: 'text-status-permission' },
  failed: { label: 'Not working', tone: 'text-status-error' },
  pending: { label: 'Connecting', tone: 'text-text-muted' },
  disabled: { label: 'Off', tone: 'text-text-muted' },
};

/** Where a connector comes from, in plain words. */
function sourceLabel(source: string): string {
  const words: Record<string, string> = {
    user: 'All projects',
    local: 'This project, only you',
    project: 'This project',
    claudeai: 'claude.ai',
    plugin: 'Plugin',
    managed: 'Set by your company',
    enterprise: 'Set by your company',
  };
  return words[source] ?? source;
}

/** Sources `claude mcp remove` can change. */
const REMOVABLE = ['user', 'local', 'project'];

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

function AddForm({
  project,
  onAdd,
  onCancel,
}: {
  project: boolean;
  onAdd(req: CeoConnectorAddRequest): void;
  onCancel(): void;
}) {
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [scope, setScope] = useState<CeoConnectorAddRequest['scope']>('user');
  const nameOk = CONNECTOR_NAME_PATTERN.test(name);
  const field =
    'bg-bg border-2 border-border focus:border-accent outline-none px-6 py-2 prose-body';
  return (
    <form
      className="flex flex-col gap-6 border-t-2 border-border pt-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (nameOk && target.trim()) onAdd({ name, target: target.trim(), scope });
      }}
      data-testid="connector-add-form"
    >
      <label className="flex flex-col gap-2 prose-body prose-small text-text-muted">
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-files"
          className={field}
          data-testid="connector-name"
        />
      </label>
      {name && !nameOk && (
        <span className="prose-body prose-small text-status-error">
          Use letters, digits, - or _ (no spaces).
        </span>
      )}
      <label className="flex flex-col gap-2 prose-body prose-small text-text-muted">
        Web address or command
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="https://example.com/mcp or npx my-server"
          className={field}
          data-testid="connector-target"
        />
      </label>
      {project && (
        <label className="flex items-center gap-6 prose-body prose-small text-text-muted">
          Use in
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as CeoConnectorAddRequest['scope'])}
            className={field}
            data-testid="connector-scope"
          >
            <option value="user">All projects</option>
            <option value="local">This project only</option>
          </select>
        </label>
      )}
      <div className="flex gap-6">
        <Button
          size="sm"
          variant={nameOk && target.trim() ? 'accent' : 'disabled'}
          disabled={!nameOk || !target.trim()}
          type="submit"
          data-testid="connector-add-save"
        >
          Add
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * The Connectors card (/mcp): every MCP server of Claude Code with where it
 * comes from and whether it works, and plain actions: Sign in, Turn off / on
 * (for the project), Remove (asks first) and Add. Connectors are shared: a
 * change applies to every cat.
 */
export function ConnectorsCard({ onClose }: { onClose(): void }) {
  const [list, setList] = useState<CeoConnectorsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The connector an action runs on ('' for the whole list). */
  const [busy, setBusy] = useState<{ name: string; text: string } | null>({
    name: '',
    text: 'Checking connectors...',
  });
  const [confirm, setConfirm] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const run = async (name: string, text: string, action: () => Promise<CeoConnectorsResponse>) => {
    setBusy({ name, text });
    setError(null);
    setConfirm(null);
    try {
      setList(await action());
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setBusy(null);
    }
  };
  useEffect(() => {
    void run('', 'Checking connectors...', ceoDeskApi.connectors);
  }, []);

  const row = (c: Connector) => {
    const status = STATUS[c.status];
    const working = busy?.name === c.name;
    const action = (label: string, text: string, call: () => Promise<CeoConnectorsResponse>) => (
      <Button
        size="sm"
        variant={busy ? 'disabled' : 'ghost'}
        disabled={!!busy}
        onClick={() => void run(c.name, text, call)}
        data-testid={`connector-${label.toLowerCase().replace(/ /g, '-')}`}
      >
        {label}
      </Button>
    );
    return (
      <div key={c.name} className="flex flex-col gap-2 py-4" data-testid="connector-row">
        <div className="flex items-baseline gap-8 min-w-0">
          <span className="prose-body text-text truncate min-w-0" title={c.target ?? c.name}>
            {c.name}
          </span>
          <span
            className={`prose-body prose-small shrink-0 ${status.tone}`}
            data-testid="connector-status"
          >
            {status.label}
          </span>
          <span className="flex-1" />
          <span className="prose-body prose-small text-text-muted shrink-0">
            {sourceLabel(c.source)}
          </span>
        </div>
        {c.status === 'failed' && c.error && (
          <span className="prose-body prose-small text-text-muted line-clamp-2 break-words">
            {c.error}
          </span>
        )}
        {working && (
          <span className="prose-body prose-small text-status-active pixel-pulse">{busy.text}</span>
        )}
        {confirm === c.name ? (
          <div className="flex items-center gap-6 flex-wrap" data-testid="connector-confirm">
            <span className="prose-body prose-small text-text">
              Remove {c.name}? Every cat loses it.
            </span>
            <Button
              size="sm"
              variant="accent"
              onClick={() =>
                void run(c.name, 'Removing...', () => ceoDeskApi.removeConnector(c.name, c.source))
              }
              data-testid="connector-remove-yes"
            >
              Remove
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex gap-4 flex-wrap">
            {c.web &&
              c.status === 'needs-auth' &&
              action('Sign in', 'Waiting for you to sign in in the browser...', () =>
                ceoDeskApi.signIn(c.name),
              )}
            {list?.project &&
              (c.status === 'disabled'
                ? action('Turn on', 'Turning on...', () => ceoDeskApi.toggleConnector(c.name, true))
                : action('Turn off', 'Turning off...', () =>
                    ceoDeskApi.toggleConnector(c.name, false),
                  ))}
            {REMOVABLE.includes(c.source) && (
              <Button
                size="sm"
                variant={busy ? 'disabled' : 'ghost'}
                disabled={!!busy}
                onClick={() => setConfirm(c.name)}
                data-testid="connector-remove"
              >
                Remove
              </Button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="self-stretch pixel-panel bg-bg-dark! px-10 py-8 flex flex-col gap-6"
      data-testid="connectors-card"
    >
      <div className="flex items-center gap-8">
        <span className="prose-body text-text">Connectors</span>
        <span className="flex-1" />
        <Button
          size="sm"
          variant={busy ? 'disabled' : 'ghost'}
          disabled={!!busy}
          onClick={() => void run('', 'Checking connectors...', ceoDeskApi.connectors)}
          data-testid="connectors-refresh"
        >
          Refresh
        </Button>
        <Button size="icon" variant="ghost" onClick={onClose} title="Close" aria-label="Close">
          x
        </Button>
      </div>
      <span className="prose-body prose-small text-text-muted">
        Tools Claude can use, like your mail or files. Changes apply to all cats.
        {list &&
          (list.project
            ? ' Turn off applies to this project.'
            : ' Pick a project to turn one off for it.')}
      </span>
      {busy && !list?.connectors.some((c) => c.name === busy.name) && (
        <span className="prose-body prose-small text-status-active pixel-pulse">{busy.text}</span>
      )}
      {list && list.connectors.length === 0 && (
        <span className="prose-body prose-small text-text-muted">No connectors yet.</span>
      )}
      <div className="flex flex-col divide-y-2 divide-border">{list?.connectors.map(row)}</div>
      {error && (
        <span
          className="prose-body prose-small text-status-error break-words"
          data-testid="connectors-error"
        >
          {error}
        </span>
      )}
      {adding ? (
        <AddForm
          project={!!list?.project}
          onCancel={() => setAdding(false)}
          onAdd={(req) =>
            void run(req.name, 'Adding...', () => ceoDeskApi.addConnector(req)).then(
              (ok) => ok && setAdding(false),
            )
          }
        />
      ) : (
        <div className="flex items-center gap-8 flex-wrap">
          <Button
            size="sm"
            variant={busy ? 'disabled' : 'default'}
            disabled={!!busy}
            onClick={() => setAdding(true)}
            data-testid="connector-add"
          >
            Add a connector
          </Button>
          <a
            href={CLAUDE_AI_CONNECTORS}
            target="_blank"
            rel="noopener noreferrer"
            className="prose-body prose-small text-link"
          >
            Add more at claude.ai
          </a>
        </div>
      )}
    </div>
  );
}
