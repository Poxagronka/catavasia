import * as fs from 'fs';
import * as path from 'path';

import type { TeamProvider } from '../../../../../core/src/teamProvider.js';

/**
 * Claude Code implementation of the TeamProvider interface.
 *
 * Encapsulates every Claude-specific path, field name, and tool identifier
 * for sub-agent and teammate transcripts. Adding support for a new CLI means creating a
 * sibling file; no changes to hookEventHandler.ts or fileWatcher.ts.
 */

// ── Internal helpers (not exposed on the public TeamProvider interface) ──

/** Claude stores teammate metadata in a sidecar `<file>.meta.json`. */
function sidecarPath(jsonlPath: string): string {
  return jsonlPath.replace(/\.jsonl$/, '.meta.json');
}

/** Parse a sidecar's metadata: `agentType` (required), plus `toolUseId` when present. */
function parseSidecarMeta(jsonlPath: string): { agentType: string; toolUseId?: string } | null {
  const metaPath = sidecarPath(jsonlPath);
  try {
    const raw = fs.readFileSync(metaPath, 'utf-8');
    const data = JSON.parse(raw) as { agentType?: unknown; toolUseId?: unknown };
    if (typeof data.agentType !== 'string') return null;
    return {
      agentType: data.agentType,
      toolUseId: typeof data.toolUseId === 'string' ? data.toolUseId : undefined,
    };
  } catch {
    return null;
  }
}

/** Claude stores spawn JSONL files at `<projectDir>/<leadSessionId>/subagents/`. */
function spawnDir(projectDir: string, leadSessionId: string): string {
  return path.join(projectDir, leadSessionId, 'subagents');
}

/** Spawn tool_result line identifying the spawned agent: `agent_id: <name>@<team>`.
 *  Newer Claude harnesses run every Agent spawn in the background and this result
 *  line is the ONLY lead-side evidence of the (implicit) team. */
const AGENT_ID_RESULT_PATTERN = /agent_id:\s*([^\s@]+)@(\S+)/;

/** Flatten a tool_result content value (string or content-block array) to text. */
function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as { text?: unknown }).text === 'string'
          ? (item as { text: string }).text
          : '',
      )
      .join('\n');
  }
  return '';
}

/**
 * Read the first few records of a transcript and return its team tags.
 * Newer harnesses open teammate transcripts with setting records (`agent-setting`,
 * `mode`, `permission-mode`) that carry no team fields -- the tags appear on the
 * first user/assistant record -- so scanning just line 1 is not enough.
 *
 * Returns:
 *  - `{ teamName, agentName }` when a record carries team tags
 *  - `null` (definitive) when a user/assistant record appears without them
 *  - `undefined` (indeterminate) when only setting records exist so far
 */
const TEAM_METADATA_SCAN_BYTES = 16384;
function readTeamMetadata(
  jsonlPath: string,
): { teamName: string; agentName?: string } | null | undefined {
  let raw: string;
  try {
    const fd = fs.openSync(jsonlPath, 'r');
    try {
      const buf = Buffer.alloc(TEAM_METADATA_SCAN_BYTES);
      const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
      raw = buf.toString('utf-8', 0, bytesRead);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return undefined;
  }
  const lines = raw.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    let record: Record<string, unknown>;
    try {
      record = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue; // partial trailing line or mid-write garbage
    }
    if (typeof record.teamName === 'string') {
      return {
        teamName: record.teamName,
        agentName: typeof record.agentName === 'string' ? record.agentName : undefined,
      };
    }
    // A conversational record without team tags means this transcript will
    // never gain them (tags are stamped on every user/assistant record).
    if (record.type === 'user' || record.type === 'assistant') return null;
  }
  return undefined;
}

// ── Public TeamProvider implementation ──

const TEAMMATE_SPAWN_TOOLS: ReadonlySet<string> = new Set(['Agent']);

export const claudeTeamProvider: TeamProvider = {
  providerId: 'claude',

  teammateSpawnTools: TEAMMATE_SPAWN_TOOLS,
  withinTurnSubagentTools: new Set(['Task']),

  extractTeammateNameFromEvent(event) {
    const teammateName = event.teammate_name;
    if (typeof teammateName === 'string') return teammateName;
    const agentType = event.agent_type;
    return typeof agentType === 'string' ? agentType : undefined;
  },

  extractTeammateSpawnFromToolResult(toolName, resultContent) {
    if (!TEAMMATE_SPAWN_TOOLS.has(toolName)) return null;
    const match = AGENT_ID_RESULT_PATTERN.exec(toolResultText(resultContent));
    if (!match) return null;
    return { teammateName: match[1], teamName: match[2] };
  },

  discoverSpawnTranscripts(projectDir, leadSessionId) {
    const result: Array<{ jsonlPath: string; toolUseId?: string }> = [];
    const dir = spawnDir(projectDir, leadSessionId);
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return result; // directory missing -> no spawns
    }
    for (const entry of entries) {
      if (!entry.endsWith('.jsonl')) continue;
      const jsonlPath = path.join(dir, entry);
      const meta = parseSidecarMeta(jsonlPath);
      if (meta) result.push({ jsonlPath, toolUseId: meta.toolUseId });
    }
    return result;
  },

  getTeamMetadataForSession(jsonlPath) {
    // Scan the first few records: newer harnesses open transcripts with setting
    // records that carry no team fields, so line 1 alone is not sufficient.
    return readTeamMetadata(jsonlPath) ?? null;
  },

  extractTeamMetadataFromRecord(record) {
    const teamName = record.teamName;
    if (typeof teamName !== 'string') return null;
    const agentName = record.agentName;
    return {
      teamName,
      agentName: typeof agentName === 'string' ? agentName : undefined,
    };
  },
};
