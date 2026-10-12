import { describe, expect, it } from 'vitest';

import { resendAgentActivity } from '../src/agentActivityResend.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import type { AgentState } from '../src/types.js';

function createTestAgent(overrides: Partial<AgentState> = {}): AgentState {
  return {
    id: 0,
    sessionId: 'test-session',
    isExternal: false,
    projectDir: '/test',
    jsonlFile: '/test/session.jsonl',
    fileOffset: 0,
    lineBuffer: '',
    activeToolIds: new Set(),
    activeToolStatuses: new Map(),
    activeToolNames: new Map(),
    activeSubagentToolIds: new Map(),
    activeSubagentToolNames: new Map(),
    backgroundAgentToolIds: new Set(),
    isWaiting: false,
    permissionSent: false,
    hadToolsInTurn: false,
    lastDataAt: 0,
    linesProcessed: 0,
    seenUnknownRecordTypes: new Set(),
    hookDelivered: false,
    contextTokens: 0,
    maxContextTokens: 200_000,
    ...overrides,
  } as AgentState;
}

describe('resendAgentActivity', () => {
  it('sends messages in order: tools, waiting, context', () => {
    const store = new AgentStateStore();
    store.set(
      1,
      createTestAgent({
        id: 1,
        activeToolStatuses: new Map([['tool-1', 'Running']]),
        activeToolNames: new Map([['tool-1', 'Bash']]),
        isWaiting: true,
        contextTokens: 50_000,
      }),
    );
    const sent: Array<Record<string, unknown>> = [];
    resendAgentActivity((msg) => sent.push(msg), store);

    expect(sent.map((m) => m.type)).toEqual(['agentToolStart', 'agentStatus', 'agentContextUsage']);
  });

  it('includes basic fields for regular tools', () => {
    const store = new AgentStateStore();
    store.set(
      1,
      createTestAgent({
        id: 1,
        activeToolStatuses: new Map([['tool-1', 'Running']]),
        activeToolNames: new Map([['tool-1', 'Bash']]),
      }),
    );
    const sent: Array<Record<string, unknown>> = [];
    resendAgentActivity((msg) => sent.push(msg), store);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({
      type: 'agentToolStart',
      id: 1,
      toolId: 'tool-1',
      status: 'Running',
      toolName: 'Bash',
    });
  });

  it('replays background tools with the runInBackground flag and the tool name', () => {
    const store = new AgentStateStore();
    store.set(
      1,
      createTestAgent({
        id: 1,
        activeToolStatuses: new Map([
          ['bg-a', 'Subtask: A'],
          ['bg-b', 'Subtask: B'],
        ]),
        activeToolNames: new Map([
          ['bg-a', 'Agent'],
          ['bg-b', 'Agent'],
        ]),
        backgroundAgentToolIds: new Set(['bg-a', 'bg-b']),
      }),
    );
    const sent: Array<Record<string, unknown>> = [];
    resendAgentActivity((msg) => sent.push(msg), store);

    const toolStarts = sent.filter((m) => m.type === 'agentToolStart');
    expect(toolStarts).toHaveLength(2);
    // toolName is required: without it the webview cannot tell a background spawn.
    for (const t of toolStarts) {
      expect(t).toMatchObject({ runInBackground: true, toolName: 'Agent' });
      expect(t.isTeammateSpawn).toBeUndefined();
    }
    // A sub-agent or a teammate never reaches the webview as its own agent.
    expect(sent.some((m) => m.type === 'agentTeamInfo')).toBe(false);
  });

  it('sends waiting status only when agent is waiting', () => {
    let store = new AgentStateStore();
    store.set(1, createTestAgent({ id: 1, isWaiting: true }));
    let sent: Array<Record<string, unknown>> = [];
    resendAgentActivity((msg) => sent.push(msg), store);
    expect(sent).toEqual([{ type: 'agentStatus', id: 1, status: 'waiting' }]);

    store = new AgentStateStore();
    store.set(2, createTestAgent({ id: 2, isWaiting: false }));
    sent = [];
    resendAgentActivity((msg) => sent.push(msg), store);
    expect(sent).toHaveLength(0);
  });

  it('sends context usage only when agent has tokens', () => {
    let store = new AgentStateStore();
    store.set(1, createTestAgent({ id: 1, contextTokens: 50_000, maxContextTokens: 200_000 }));
    let sent: Array<Record<string, unknown>> = [];
    resendAgentActivity((msg) => sent.push(msg), store);
    expect(sent).toEqual([
      { type: 'agentContextUsage', id: 1, contextTokens: 50_000, maxContextTokens: 200_000 },
    ]);

    store = new AgentStateStore();
    store.set(2, createTestAgent({ id: 2, contextTokens: 0, maxContextTokens: 200_000 }));
    sent = [];
    resendAgentActivity((msg) => sent.push(msg), store);
    expect(sent).toHaveLength(0);
  });

  it('handles edge cases: empty store and multiple agents', () => {
    // Empty store
    let store = new AgentStateStore();
    let sent: Array<Record<string, unknown>> = [];
    resendAgentActivity((msg) => sent.push(msg), store);
    expect(sent).toHaveLength(0);

    // Multiple agents with different activity
    store = new AgentStateStore();
    store.set(
      1,
      createTestAgent({
        id: 1,
        activeToolStatuses: new Map([['tool-1', 'Running']]),
        activeToolNames: new Map([['tool-1', 'Bash']]),
      }),
    );
    store.set(2, createTestAgent({ id: 2, isWaiting: true }));
    sent = [];
    resendAgentActivity((msg) => sent.push(msg), store);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({ type: 'agentToolStart', id: 1 });
    expect(sent[1]).toMatchObject({ type: 'agentStatus', id: 2, status: 'waiting' });
  });
});
