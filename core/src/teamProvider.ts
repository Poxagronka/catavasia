/**
 * TeamProvider: optional extension on HookProvider for CLIs that support the
 * Lead + Teammates pattern (Claude Agent Teams today; hypothetical future CLIs).
 *
 * Semantic-level interface: the host asks *what* (who's on this team? what
 * metadata does this session have?) rather than *how* (what's the sidecar file
 * path? what's the JSON field name?). Providers choose their own storage
 * (filesystem, API, database) and expose only the queries.
 *
 * Providers without team support simply don't set `HookProvider.team`. No team-
 * gated code runs for them -- no stubs, no dead branches.
 */
export interface TeamProvider {
  /** CLI identifier (e.g. 'claude', 'codex'). Used for logging. */
  providerId: string;

  /** Extract a sub-agent's label (name or type) from a raw hook event payload
   *  (pre-normalization). Labels the sub-agent's row in the parent's overlay.
   *  Claude: prefers `teammate_name`, with `agent_type` kept for SubagentStart compatibility. */
  extractTeammateNameFromEvent(event: Record<string, unknown>): string | undefined;

  /** Tool names that spawn sub-agents or teammates (Claude: 'Agent', 'Task').
   *  The union is the set of tools whose result opens a sub-agent overlay row. */
  teammateSpawnTools: ReadonlySet<string>;
  withinTurnSubagentTools: ReadonlySet<string>;

  /** Find the transcripts of a lead session's spawns (sub-agents and teammates).
   *  Provider chooses how to discover them (filesystem scan, API call, cache).
   *  The returned `jsonlPath` is an opaque transcript handle the caller watches.
   *  `toolUseId` is the lead's spawn tool_use id: the host matches it to the
   *  lead's live spawn tools. */
  discoverSpawnTranscripts(
    projectDir: string,
    leadSessionId: string,
  ): Array<{ jsonlPath: string; toolUseId?: string }>;

  /** Detect a teammate spawn from a completed spawn-tool result on the LEAD's
   *  transcript. Some CLI versions never tag the lead's own records with team
   *  metadata; the only lead-side evidence of the team is the spawn tool's
   *  result (Claude: `agent_id: <name>@<team>` in the Agent tool_result). The
   *  host uses the team name to recognize the teammate's own session and never
   *  adopt it as a guest.
   *  Returns the spawned teammate's identity, or null when the result is not a
   *  teammate spawn. `resultContent` is the raw tool_result content (string or
   *  content-block array). */
  extractTeammateSpawnFromToolResult?(
    toolName: string,
    resultContent: unknown,
  ): { teamName: string; teammateName: string } | null;

  /** Return team metadata for a session if it participates in a team.
   *  Provider decides where to look (sidecar file, JSONL header, DB, etc.).
   *  Returns null if the session is not part of a team.
   *  agentName is undefined for the lead and set to the teammate's name for a teammate. */
  getTeamMetadataForSession(jsonlPath: string): { teamName: string; agentName?: string } | null;

  /** Extract team metadata from a transcript record (one parsed JSONL line).
   *  In-memory counterpart to getTeamMetadataForSession; used by transcriptParser
   *  where it already has the parsed record and shouldn't re-open the file. */
  extractTeamMetadataFromRecord(
    record: Record<string, unknown>,
  ): { teamName?: string; agentName?: string } | null;
}
