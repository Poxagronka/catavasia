import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { claudeTeamProvider } from '../src/providers/hook/claude/claudeTeamProvider.js';

describe('claudeTeamProvider', () => {
  describe('identity', () => {
    it('has providerId "claude"', () => {
      expect(claudeTeamProvider.providerId).toBe('claude');
    });

    it('spawns teammates via "Agent" tool', () => {
      expect(claudeTeamProvider.teammateSpawnTools.has('Agent')).toBe(true);
    });

    it('uses "Task" for within-turn subagents', () => {
      expect(claudeTeamProvider.withinTurnSubagentTools.has('Task')).toBe(true);
    });
  });

  describe('extractTeammateNameFromEvent', () => {
    it('reads current teammate_name when present', () => {
      expect(
        claudeTeamProvider.extractTeammateNameFromEvent({ teammate_name: 'web-researcher' }),
      ).toBe('web-researcher');
    });

    it('falls back to agent_type for SubagentStart compatibility', () => {
      expect(
        claudeTeamProvider.extractTeammateNameFromEvent({ agent_type: 'web-researcher' }),
      ).toBe('web-researcher');
    });

    it('prefers teammate_name when both names are present', () => {
      expect(
        claudeTeamProvider.extractTeammateNameFromEvent({
          teammate_name: 'web-researcher',
          agent_type: 'legacy-agent-type',
        }),
      ).toBe('web-researcher');
    });

    it('falls back when teammate_name is not a string', () => {
      expect(
        claudeTeamProvider.extractTeammateNameFromEvent({
          teammate_name: 42,
          agent_type: 'web-researcher',
        }),
      ).toBe('web-researcher');
    });

    it('returns undefined when teammate identity is missing or malformed', () => {
      expect(claudeTeamProvider.extractTeammateNameFromEvent({})).toBeUndefined();
      expect(
        claudeTeamProvider.extractTeammateNameFromEvent({ teammate_name: null, agent_type: 42 }),
      ).toBeUndefined();
    });
  });

  describe('discoverSpawnTranscripts', () => {
    const fsMod = require('fs') as typeof import('fs');
    const tmpRoot = path.join(os.tmpdir(), 'pixel-agents-discover-' + Date.now());

    afterEach(() => {
      try {
        fsMod.rmSync(tmpRoot, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    });

    function seed(file: string, meta: string): string {
      const sessDir = path.join(tmpRoot, 'sess-1', 'subagents');
      fsMod.mkdirSync(sessDir, { recursive: true });
      const jsonl = path.join(sessDir, file);
      fsMod.writeFileSync(jsonl, '');
      fsMod.writeFileSync(jsonl.replace(/\.jsonl$/, '.meta.json'), meta);
      return jsonl;
    }

    it('returns empty array when the spawn directory does not exist', () => {
      expect(claudeTeamProvider.discoverSpawnTranscripts(tmpRoot, 'nonexistent-sess')).toEqual([]);
    });

    it('skips jsonl files without a valid sidecar', () => {
      const sessDir = path.join(tmpRoot, 'sess-1', 'subagents');
      fsMod.mkdirSync(sessDir, { recursive: true });
      fsMod.writeFileSync(path.join(sessDir, 'orphan.jsonl'), '{}');
      expect(claudeTeamProvider.discoverSpawnTranscripts(tmpRoot, 'sess-1')).toEqual([]);
    });

    it('returns the transcript and the spawn tool id of each sidecar', () => {
      const a = seed('agent-a.jsonl', '{"agentType":"web-researcher","toolUseId":"toolu_1"}');
      const b = seed('agent-b.jsonl', '{"agentType":"code-reviewer"}');
      const result = claudeTeamProvider.discoverSpawnTranscripts(tmpRoot, 'sess-1');
      expect(result.sort((x, y) => x.jsonlPath.localeCompare(y.jsonlPath))).toEqual([
        { jsonlPath: a, toolUseId: 'toolu_1' },
        { jsonlPath: b, toolUseId: undefined },
      ]);
    });

    it('lists a named spawn like an unnamed one (a teammate is no special case)', () => {
      const a = seed(
        'agent-a.jsonl',
        '{"agentType":"general-purpose","toolUseId":"toolu_1","name":"ghost-writer"}',
      );
      expect(claudeTeamProvider.discoverSpawnTranscripts(tmpRoot, 'sess-1')).toEqual([
        { jsonlPath: a, toolUseId: 'toolu_1' },
      ]);
    });
  });

  describe('extractTeammateSpawnFromToolResult', () => {
    const spawnText =
      'Spawned successfully. (This tool result is internal metadata.)\n' +
      'agent_id: wa-broadcast-safety-research@session-029c4a18\nname: wa-broadcast-safety-research';

    it('extracts teammate name + team from an Agent spawn result (block array)', () => {
      expect(
        claudeTeamProvider.extractTeammateSpawnFromToolResult!('Agent', [
          { type: 'text', text: spawnText },
        ]),
      ).toEqual({
        teammateName: 'wa-broadcast-safety-research',
        teamName: 'session-029c4a18',
      });
    });

    it('extracts from plain string content', () => {
      expect(claudeTeamProvider.extractTeammateSpawnFromToolResult!('Agent', spawnText)).toEqual({
        teammateName: 'wa-broadcast-safety-research',
        teamName: 'session-029c4a18',
      });
    });

    it('returns null for non-spawn tools even when the text matches', () => {
      expect(claudeTeamProvider.extractTeammateSpawnFromToolResult!('Task', spawnText)).toBeNull();
      expect(claudeTeamProvider.extractTeammateSpawnFromToolResult!('Read', spawnText)).toBeNull();
    });

    it('returns null for Agent results without an agent_id line', () => {
      expect(
        claudeTeamProvider.extractTeammateSpawnFromToolResult!('Agent', [
          { type: 'text', text: 'Async agent launched successfully.' },
        ]),
      ).toBeNull();
      expect(claudeTeamProvider.extractTeammateSpawnFromToolResult!('Agent', undefined)).toBeNull();
    });
  });

  describe('getTeamMetadataForSession', () => {
    const fsMod = require('fs') as typeof import('fs');
    const tmpRoot = path.join(os.tmpdir(), 'pixel-agents-meta-' + Date.now());

    afterEach(() => {
      try {
        fsMod.rmSync(tmpRoot, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    });

    it('returns null when file does not exist', () => {
      expect(
        claudeTeamProvider.getTeamMetadataForSession(path.join(tmpRoot, 'missing.jsonl')),
      ).toBeNull();
    });

    it('returns null when first line has no teamName', () => {
      fsMod.mkdirSync(tmpRoot, { recursive: true });
      const p = path.join(tmpRoot, 'no-team.jsonl');
      fsMod.writeFileSync(p, JSON.stringify({ other: 'value' }) + '\n');
      expect(claudeTeamProvider.getTeamMetadataForSession(p)).toBeNull();
    });

    it('extracts teamName + agentName from the first JSONL line', () => {
      fsMod.mkdirSync(tmpRoot, { recursive: true });
      const p = path.join(tmpRoot, 'teammate.jsonl');
      fsMod.writeFileSync(
        p,
        JSON.stringify({ teamName: 'research', agentName: 'web-researcher' }) +
          '\n' +
          JSON.stringify({ other: 'should-be-ignored' }) +
          '\n',
      );
      expect(claudeTeamProvider.getTeamMetadataForSession(p)).toEqual({
        teamName: 'research',
        agentName: 'web-researcher',
      });
    });

    it('agentName is undefined for the lead (no agentName field)', () => {
      fsMod.mkdirSync(tmpRoot, { recursive: true });
      const p = path.join(tmpRoot, 'lead.jsonl');
      fsMod.writeFileSync(p, JSON.stringify({ teamName: 'research' }) + '\n');
      expect(claudeTeamProvider.getTeamMetadataForSession(p)).toEqual({
        teamName: 'research',
        agentName: undefined,
      });
    });

    it('scans past untagged setting records to find team tags (newer harnesses)', () => {
      fsMod.mkdirSync(tmpRoot, { recursive: true });
      const p = path.join(tmpRoot, 'new-style.jsonl');
      fsMod.writeFileSync(
        p,
        JSON.stringify({ type: 'agent-setting', agentSetting: 'general-purpose' }) +
          '\n' +
          JSON.stringify({ type: 'mode', mode: 'default' }) +
          '\n' +
          JSON.stringify({ type: 'user', teamName: 'session-abc12345', agentName: 'researcher' }) +
          '\n',
      );
      expect(claudeTeamProvider.getTeamMetadataForSession(p)).toEqual({
        teamName: 'session-abc12345',
        agentName: 'researcher',
      });
    });

    it('returns null when the first conversational record is untagged', () => {
      fsMod.mkdirSync(tmpRoot, { recursive: true });
      const p = path.join(tmpRoot, 'plain-session.jsonl');
      fsMod.writeFileSync(
        p,
        JSON.stringify({ type: 'mode', mode: 'default' }) +
          '\n' +
          JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } }) +
          '\n' +
          JSON.stringify({ type: 'assistant', teamName: 'too-late' }) +
          '\n',
      );
      expect(claudeTeamProvider.getTeamMetadataForSession(p)).toBeNull();
    });
  });

  describe('extractTeamMetadataFromRecord', () => {
    it('returns teamName + agentName when both present', () => {
      expect(
        claudeTeamProvider.extractTeamMetadataFromRecord({
          teamName: 'research',
          agentName: 'web-researcher',
        }),
      ).toEqual({ teamName: 'research', agentName: 'web-researcher' });
    });

    it('returns teamName with undefined agentName for the lead', () => {
      expect(claudeTeamProvider.extractTeamMetadataFromRecord({ teamName: 'research' })).toEqual({
        teamName: 'research',
        agentName: undefined,
      });
    });

    it('returns null when teamName is missing', () => {
      expect(claudeTeamProvider.extractTeamMetadataFromRecord({})).toBeNull();
    });

    it('returns null when teamName is not a string', () => {
      expect(claudeTeamProvider.extractTeamMetadataFromRecord({ teamName: 42 })).toBeNull();
    });
  });
});
