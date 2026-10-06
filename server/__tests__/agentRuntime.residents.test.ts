import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { StateAdapter } from '../../core/src/adapter.js';
import { resendAgentActivity } from '../src/agentActivityResend.js';
import { AgentRuntime } from '../src/agentRuntime.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import { claudeProvider } from '../src/providers/hook/claude/claude.js';
import type { PersistedAgent } from '../src/types.js';

function adapter(initial: PersistedAgent[]): StateAdapter & { saved: PersistedAgent[][] } {
  const saved: PersistedAgent[][] = [];
  return {
    saved,
    loadAgents: () => initial,
    saveAgents: (agents) => saved.push(agents),
    loadSeats: () => ({}),
    saveSeats: () => {},
    getSetting: <T>(_key: string, defaultValue: T): T => defaultValue,
    setSetting: vi.fn<(key: string, value: unknown) => void>(),
  };
}

let tmp: string;
let store: AgentStateStore;
let runtime: AgentRuntime;
let persisted: ReturnType<typeof adapter>;
let broadcasts: Array<Record<string, unknown>>;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-residents-rt-'));
  store = new AgentStateStore();
  // A persisted external agent with id 4 comes back on the first connect.
  persisted = adapter([
    {
      id: 4,
      sessionId: 'ext',
      terminalName: '',
      isExternal: true,
      jsonlFile: '/x.jsonl',
      projectDir: '/',
    },
  ]);
  store.setAdapter(persisted);
  runtime = new AgentRuntime(store, claudeProvider);
  broadcasts = [];
  store.on('broadcast', (m: Record<string, unknown>) => broadcasts.push(m));
});

afterEach(() => {
  runtime.dispose();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('AgentRuntime resident cats', () => {
  it('spawns above the persisted ids, never persists residents, and switches sessions per turn', () => {
    const id = runtime.spawnResidentAgent({ palette: 2, hueShift: 0 });
    expect(id).toBe(5);
    expect(store.get(id)).toMatchObject({ isResident: true, palette: 2, sessionId: '' });
    store.persist();
    expect(persisted.saved.at(-1)?.some((p) => p.id === id)).toBe(false);

    runtime.beginResidentTurn(id, 'session-a', tmp);
    expect(store.get(id)).toMatchObject({ sessionId: 'session-a', isWaiting: false });
    expect(store.get(id)!.jsonlFile.endsWith('session-a.jsonl')).toBe(true);
    expect(broadcasts.at(-1)).toEqual({ type: 'agentStatus', id, status: 'active' });

    runtime.endResidentTurn(id);
    expect(store.get(id)!.isWaiting).toBe(true);
    expect(broadcasts.slice(-2)).toEqual([
      { type: 'agentToolsClear', id },
      { type: 'agentStatus', id, status: 'waiting' },
    ]);

    // The next task: the same character, a new session.
    runtime.beginResidentTurn(id, 'session-b', tmp);
    expect(store.get(id)!.sessionId).toBe('session-b');
    runtime.linkAgentTask(id, 'task-9');
    expect(broadcasts.at(-1)).toEqual({ type: 'agentTaskFinished', id, taskId: 'task-9' });
  });

  it('restores a finished task cat that opens its task after a restart', () => {
    const agent = runtime.restoreFinishedAgent('old-session', tmp, 'task-1', { palette: 3 });
    expect(agent.id).toBe(5);
    expect(store.get(agent.id)).toMatchObject({
      finishedTaskId: 'task-1',
      isWaiting: true,
      palette: 3,
    });
    const sent: Array<Record<string, unknown>> = [];
    resendAgentActivity((m) => sent.push(m), store);
    expect(sent).toContainEqual({ type: 'agentTaskFinished', id: agent.id, taskId: 'task-1' });
  });
});
