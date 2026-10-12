import { useEffect, useState } from 'react';

import {
  type CeoConnectorAddRequest,
  type CeoConnectorsResponse,
  type Connector,
  CONNECTOR_NAME_PATTERN,
} from '../../../core/src/ceoDesk.js';
import { ceoDesk } from '../i18n/ceoDesk/en.js';
import { useT } from '../i18n/useT.js';
import { ceoDeskApi } from './ceoDeskApi.js';

const CLAUDE_AI_CONNECTORS = 'https://claude.ai/customize/connectors';

const STATUS = {
  connected: { key: 'statusWorking', tone: 'text-status-success' },
  'needs-auth': { key: 'statusNeedsSignIn', tone: 'text-status-permission' },
  failed: { key: 'statusNotWorking', tone: 'text-status-error' },
  pending: { key: 'statusConnecting', tone: 'text-text-muted' },
  disabled: { key: 'statusOff', tone: 'text-text-muted' },
} as const satisfies Record<Connector['status'], { key: string; tone: string }>;

/** Where a connector comes from, in plain words (keys of the ceoDesk dictionary). */
const SOURCE_KEY = {
  user: 'sourceUser',
  local: 'sourceLocal',
  project: 'sourceProject',
  plugin: 'sourcePlugin',
  managed: 'sourceManaged',
  enterprise: 'sourceManaged',
} as const;

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
  const t = useT(ceoDesk);
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
        {t('connectorName')}
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
          {t('connectorNameInvalid')}
        </span>
      )}
      <label className="flex flex-col gap-2 prose-body prose-small text-text-muted">
        {t('connectorTarget')}
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
          {t('connectorUseIn')}
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as CeoConnectorAddRequest['scope'])}
            className={field}
            data-testid="connector-scope"
          >
            <option value="user">{t('scopeAll')}</option>
            <option value="local">{t('scopeLocal')}</option>
          </select>
        </label>
      )}
      <div className="flex gap-6">
        <button
          className="quiet-btn"
          disabled={!nameOk || !target.trim()}
          type="submit"
          data-testid="connector-add-save"
        >
          {t('add')}
        </button>
        <button className="quiet-btn" type="button" onClick={onCancel}>
          {t('cancel')}
        </button>
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
  const t = useT(ceoDesk);
  const [list, setList] = useState<CeoConnectorsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The connector an action runs on ('' for the whole list). */
  const [busy, setBusy] = useState<{ name: string; text: string } | null>({
    name: '',
    text: t('checkingConnectors'),
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
    void run('', t('checkingConnectors'), ceoDeskApi.connectors);
    // The list loads once when the card opens, not on each language change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const row = (c: Connector) => {
    const status = STATUS[c.status];
    const working = busy?.name === c.name;
    const action = (
      id: string,
      label: string,
      text: string,
      call: () => Promise<CeoConnectorsResponse>,
    ) => (
      <button
        type="button"
        className="quiet-btn"
        disabled={!!busy}
        onClick={() => void run(c.name, text, call)}
        data-testid={`connector-${id}`}
      >
        {label}
      </button>
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
            {t(status.key)}
          </span>
          <span className="flex-1" />
          <span className="prose-body prose-small text-text-muted shrink-0">
            {c.source === 'claudeai'
              ? 'claude.ai'
              : c.source in SOURCE_KEY
                ? t(SOURCE_KEY[c.source as keyof typeof SOURCE_KEY])
                : c.source}
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
              {t('removeConnectorConfirm', { name: c.name })}
            </span>
            <button
              type="button"
              className="quiet-btn is-danger"
              onClick={() =>
                void run(c.name, t('removing'), () => ceoDeskApi.removeConnector(c.name, c.source))
              }
              data-testid="connector-remove-yes"
            >
              {t('remove')}
            </button>
            <button type="button" className="quiet-btn" onClick={() => setConfirm(null)}>
              {t('cancel')}
            </button>
          </div>
        ) : (
          <div className="flex gap-4 flex-wrap">
            {c.web &&
              c.status === 'needs-auth' &&
              action('sign-in', t('signIn'), t('waitingSignIn'), () => ceoDeskApi.signIn(c.name))}
            {list?.project &&
              (c.status === 'disabled'
                ? action('turn-on', t('turnOn'), t('turningOn'), () =>
                    ceoDeskApi.toggleConnector(c.name, true),
                  )
                : action('turn-off', t('turnOff'), t('turningOff'), () =>
                    ceoDeskApi.toggleConnector(c.name, false),
                  ))}
            {REMOVABLE.includes(c.source) && (
              <button
                type="button"
                className="quiet-btn is-danger"
                disabled={!!busy}
                onClick={() => setConfirm(c.name)}
                data-testid="connector-remove"
              >
                {t('remove')}
              </button>
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
        <span className="prose-body text-text">{t('connectors')}</span>
        <span className="flex-1" />
        <button
          type="button"
          className="quiet-btn"
          disabled={!!busy}
          onClick={() => void run('', t('checkingConnectors'), ceoDeskApi.connectors)}
          data-testid="connectors-refresh"
        >
          {t('refresh')}
        </button>
        <button
          type="button"
          className="quiet-btn"
          onClick={onClose}
          title={t('close')}
          aria-label={t('close')}
        >
          x
        </button>
      </div>
      <span className="prose-body prose-small text-text-muted">
        {t('connectorsNote')}
        {list && ` ${t(list.project ? 'connectorsNoteProject' : 'connectorsNotePick')}`}
      </span>
      {busy && !list?.connectors.some((c) => c.name === busy.name) && (
        <span className="prose-body prose-small text-status-active pixel-pulse">{busy.text}</span>
      )}
      {list && list.connectors.length === 0 && (
        <span className="prose-body prose-small text-text-muted">{t('noConnectors')}</span>
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
            void run(req.name, t('adding'), () => ceoDeskApi.addConnector(req)).then(
              (ok) => ok && setAdding(false),
            )
          }
        />
      ) : (
        <div className="flex items-center gap-8 flex-wrap">
          <button
            type="button"
            className="quiet-btn"
            disabled={!!busy}
            onClick={() => setAdding(true)}
            data-testid="connector-add"
          >
            {t('addConnector')}
          </button>
          <a
            href={CLAUDE_AI_CONNECTORS}
            target="_blank"
            rel="noopener noreferrer"
            className="prose-body prose-small text-link"
          >
            {t('addMoreAtClaudeAi')}
          </a>
        </div>
      )}
    </div>
  );
}
