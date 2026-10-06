// Self-update client: polls the token-gated /api/update routes and shares the
// status with the banner and the Settings section. Standalone only: without a
// session token (or in VS Code) the routes answer 401 and nothing is shown.

import { useSyncExternalStore } from 'react';

import type { UpdateStatus } from '../../../core/src/selfUpdate.js';
import { sessionToken } from '../sessionToken.js';

const IDLE_POLL_MS = 5 * 60_000;
const BUSY_POLL_MS = 1_000;
const RESTART_POLL_MS = 1_500;
/** After this, "Restarting…" turns into an error with a manual hint. */
const RESTART_TIMEOUT_MS = 120_000;

export interface UpdateSnapshot {
  status: UpdateStatus | null;
  /** Why the last Update press was refused (busy cats), until the next press. */
  refusal?: string;
  /** Set while the old server is gone and the new one is not up yet. */
  restarting?: { since: number; timedOut: boolean };
}

let snapshot: UpdateSnapshot = { status: null };
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
let started = false;

function set(next: Partial<UpdateSnapshot>): void {
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) listener();
}

function url(route: string): string {
  return `/api/update${route}?token=${encodeURIComponent(sessionToken ?? '')}`;
}

async function call(route: string, body?: unknown): Promise<UpdateStatus> {
  const res = await fetch(url(route), {
    method: route ? 'POST' : 'GET',
    ...(body !== undefined
      ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
  });
  const json = (await res.json().catch(() => ({}))) as UpdateStatus & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

function schedule(ms: number): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void poll(), ms);
}

async function poll(): Promise<void> {
  if (snapshot.restarting) return pollRestart();
  try {
    const status = await call('');
    set({ status });
    if (status.run.phase === 'restarting') {
      set({ restarting: { since: Date.now(), timedOut: false } });
      return schedule(RESTART_POLL_MS);
    }
    schedule(status.run.phase === 'running' || status.checking ? BUSY_POLL_MS : IDLE_POLL_MS);
  } catch {
    // A server that vanished mid-install is the restart we were waiting for.
    if (snapshot.status?.run.phase === 'running') {
      set({ restarting: { since: Date.now(), timedOut: false } });
      return schedule(RESTART_POLL_MS);
    }
    schedule(IDLE_POLL_MS);
  }
}

/** Wait until a new server (another pid or version) answers /api/health,
 *  then reload the page. The last status may predate the install step. */
async function pollRestart(): Promise<void> {
  const r = snapshot.restarting!;
  const old = snapshot.status;
  try {
    const health = (await (await fetch('/api/health')).json()) as {
      version?: string;
      pid?: number;
    };
    if (
      health.version &&
      (health.pid !== old?.serverPid || health.version !== old?.currentVersion)
    ) {
      window.location.reload();
      return;
    }
  } catch {
    // Old server gone, new one not listening yet.
  }
  if (!r.timedOut && Date.now() - r.since > RESTART_TIMEOUT_MS) {
    set({ restarting: { ...r, timedOut: true } });
  }
  schedule(RESTART_POLL_MS);
}

function ensureStarted(): void {
  if (started || !sessionToken) return;
  started = true;
  void poll();
}

async function act(route: string, body?: unknown): Promise<void> {
  try {
    set({ status: await call(route, body) });
  } finally {
    schedule(BUSY_POLL_MS);
  }
}

export const updateActions = {
  check: () => act('/check'),
  setAutoCheck: (autoCheck: boolean) => act('/settings', { autoCheck }),
  dismiss: (version: string) => act('/dismiss', { version }),
  async start(): Promise<void> {
    set({ refusal: undefined });
    try {
      await act('/start');
    } catch (err) {
      set({ refusal: err instanceof Error ? err.message : String(err) });
    }
  },
};

function subscribe(listener: () => void): () => void {
  ensureStarted();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useUpdate(): UpdateSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot);
}
