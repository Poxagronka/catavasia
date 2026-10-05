import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { StateAdapter } from '../../core/src/adapter.js';
import { AgentRuntime } from '../src/agentRuntime.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import { scanAllTeammateFiles } from '../src/fileWatcher.js';
import { claudeProvider } from '../src/providers/hook/claude/claude.js';
import { processTranscriptLine } from '../src/transcriptParser.js';
import type { PersistedAgent } from '../src/types.js';

/**
 * One Claude session = one character. A lead that spawns background sub-agents
 * and a named teammate must not multiply into extra characters, neither live
 * nor after a restart from persisted state.
 */

const LEAD_SESSION = 'one-cat-lead';
const SPAWNS = [
  { toolId: 'toolu_onecat_sub_a', agentId: 'aaaa000000000001' },
  { toolId: 'toolu_onecat_sub_b', agentId: 'aaaa000000000002' },
  { toolId: 'toolu_onecat_named', agentId: 'aaaa000000000003', name: 'reviewer' },
];

function spawnRecord(toolId: string, name?: string): string {
  return JSON.stringify({
    type: 'assistant',
    message: {
      content: [
        {
          type: 'tool_use',
          id: toolId,
          name: 'Agent',
          input: { description: 'work', subagent_type: 'general-purpose', ...(name && { name }) },
        },
      ],
    },
  });
}

function asyncLaunchRecord(toolId: string, agentId: string): string {
  return JSON.stringify({
    type: 'user',
    message: {
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolId,
          content: [
            {
              type: 'text',
              text: `Async agent launched successfully.\nagentId: ${agentId} (internal)`,
            },
          ],
        },
      ],
    },
  });
}

function fakeAdapter(initial: PersistedAgent[]): StateAdapter {
  let current = initial;
  return {
    loadAgents: () => current,
    saveAgents: (a) => {
      current = a;
    },
    loadSeats: () => ({}),
    saveSeats: () => {},
    getSetting: <T>(_key: string, d: T): T => d,
    setSetting: vi.fn<(key: string, value: unknown) => void>(),
  };
}

describe('one Claude session renders as one character', () => {
  let tmpDir: string;
  let leadJsonl: string;
  let runtime: AgentRuntime | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-one-cat-'));
    leadJsonl = path.join(tmpDir, `${LEAD_SESSION}.jsonl`);
    fs.writeFileSync(leadJsonl, '');
    // Sidecar transcripts the CLI writes for each spawn (the named one is a teammate).
    const subDir = path.join(tmpDir, LEAD_SESSION, 'subagents');
    fs.mkdirSync(subDir, { recursive: true });
    for (const s of SPAWNS) {
      fs.writeFileSync(path.join(subDir, `agent-${s.agentId}.jsonl`), '');
      fs.writeFileSync(
        path.join(subDir, `agent-${s.agentId}.meta.json`),
        JSON.stringify({ agentType: 'general-purpose', toolUseId: s.toolId, name: s.name }),
      );
    }
  });

  afterEach(() => {
    runtime?.dispose();
    runtime = undefined;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('a lead spawning 2 background sub-agents and 1 named teammate stays one character', () => {
    const store = new AgentStateStore();
    runtime = new AgentRuntime(store, claudeProvider);
    runtime.watchAllSessions.current = true;
    const created: number[] = [];
    store.on('agentAdded', (id) => created.push(id));

    runtime.handleHookEvent('claude', {
      hook_event_name: 'SessionStart',
      session_id: LEAD_SESSION,
      transcript_path: leadJsonl,
      cwd: tmpDir,
      source: 'startup',
    });
    runtime.handleHookEvent('claude', { hook_event_name: 'Stop', session_id: LEAD_SESSION });
    expect(created).toHaveLength(1);
    const leadId = created[0];

    const noTimers = new Map<number, ReturnType<typeof setTimeout>>();
    for (const s of SPAWNS) {
      processTranscriptLine(leadId, spawnRecord(s.toolId, s.name), store, noTimers, noTimers);
      runtime.handleHookEvent('claude', {
        hook_event_name: 'SubagentStart',
        session_id: LEAD_SESSION,
        agent_id: s.agentId,
        agent_type: 'general-purpose',
      });
      processTranscriptLine(
        leadId,
        asyncLaunchRecord(s.toolId, s.agentId),
        store,
        noTimers,
        noTimers,
      );
    }
    // The periodic 1s teammate/background scan.
    scanAllTeammateFiles(store.nextAgentId, store, new Map(), new Map(), noTimers, noTimers, () =>
      store.persist(),
    );

    expect(store.size).toBe(1);
    expect(created).toEqual([leadId]);
  });

  it('does not restore a persisted teammate of a session', () => {
    const lead: PersistedAgent = {
      id: 1,
      sessionId: LEAD_SESSION,
      terminalName: '',
      isExternal: true,
      jsonlFile: leadJsonl,
      projectDir: tmpDir,
      teamName: 'team-x',
      isTeamLead: true,
    };
    const teammate: PersistedAgent = {
      ...lead,
      id: 2,
      jsonlFile: path.join(tmpDir, LEAD_SESSION, 'subagents', `agent-${SPAWNS[2].agentId}.jsonl`),
      isTeamLead: undefined,
      agentName: 'reviewer',
      leadAgentId: 1,
    };
    const store = new AgentStateStore();
    store.setAdapter(fakeAdapter([lead, teammate]));
    runtime = new AgentRuntime(store, claudeProvider);

    runtime.restoreExternalAgents();

    expect([...store.keys()]).toEqual([1]);
  });
});
