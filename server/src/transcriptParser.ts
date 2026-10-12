const debug = process.env.PIXEL_AGENTS_DEBUG !== '0';

import type { HookProvider } from '../../core/src/provider.js';
import type { AgentStateStore } from './agentStateStore.js';
import { TEXT_IDLE_DELAY_MS, TOOL_DONE_DELAY_MS } from './constants.js';
import { updateContextUsage } from './contextUsage.js';
import {
  cancelPermissionTimer,
  cancelWaitingTimer,
  clearAgentActivity,
  startPermissionTimer,
  startWaitingTimer,
} from './timerManager.js';

/** Empty set used as safe fallback when no HookProvider is registered. */
const EMPTY_EXEMPT_TOOLS: ReadonlySet<string> = new Set();

/** Hook provider: supplies formatToolStatus + team.extractTeamMetadataFromRecord.
 *  Registered once at startup via setHookProvider(). Functions below assume it's set. */
let hookProvider: HookProvider | null = null;

/** Permission-exempt tools come from the active provider. Fail-open if unset. */
function exemptTools(): ReadonlySet<string> {
  return hookProvider?.permissionExemptTools ?? EMPTY_EXEMPT_TOOLS;
}

/** Whether the given tool name spawns a sub-agent according to the active provider. */
function isSubagentTool(toolName: string | null | undefined): boolean {
  if (!toolName || !hookProvider) return false;
  return hookProvider.subagentToolNames.has(toolName);
}

/** Register the HookProvider that owns CLI-specific formatting and team metadata extraction. */
export function setHookProvider(provider: HookProvider): void {
  hookProvider = provider;
}

/** The registered provider, for modules that need it outside line parsing
 *  (fileWatcher seeds context gauges before any line has been read). */
export function getHookProvider(): HookProvider | null {
  return hookProvider;
}

/** Called when a lead's tool_result reports an async agent launch. The host
 *  reacts by scanning the lead's subagents/ sidecars and watching each spawn's
 *  transcript in the shadow store (fileWatcher.scanForBackgroundAgentFiles). */
let backgroundAgentDetectedCallback: ((leadAgentId: number) => void) | null = null;

export function setBackgroundAgentDetectedCallback(cb: (leadAgentId: number) => void): void {
  backgroundAgentDetectedCallback = cb;
}

/** Called when a queue-operation record marks a background agent finished.
 *  The host stops the shadow watch. */
let backgroundAgentCompletedCallback: ((leadAgentId: number, toolUseId: string) => void) | null =
  null;

export function setBackgroundAgentCompletedCallback(
  cb: (leadAgentId: number, toolUseId: string) => void,
): void {
  backgroundAgentCompletedCallback = cb;
}

/** Notify the host that a spawn tool finished, so it can stop the spawn's
 *  shadow watch. Exported for hookEventHandler,
 *  which clears foreground tools on the Stop hook. Safe to fire for tools that
 *  never had a watch — the host's lookups simply miss. */
export function notifyBackgroundAgentCompleted(leadAgentId: number, toolUseId: string): void {
  backgroundAgentCompletedCallback?.(leadAgentId, toolUseId);
}

/** Format a tool status line. Delegates to the active HookProvider's formatToolStatus.
 *  Invariant: a provider is registered before any transcript lines are parsed. */
export function formatToolStatus(toolName: string, input: Record<string, unknown>): string {
  return hookProvider?.formatToolStatus(toolName, input) ?? `Using ${toolName}`;
}

export function processTranscriptLine(
  agentId: number,
  line: string,
  agents: AgentStateStore,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
): void {
  const agent = agents.get(agentId);
  if (!agent) return;
  agent.lastDataAt = Date.now();
  agent.linesProcessed++;
  try {
    const record = JSON.parse(line);

    // -- Agent Teams: the team name tells a lead's own team apart from a teammate's session --
    // The provider reads its CLI's own field names (Claude: record.teamName + record.agentName).
    const teamMeta = hookProvider?.team?.extractTeamMetadataFromRecord(record);
    if (teamMeta?.teamName && teamMeta.teamName !== agent.teamName) {
      agent.teamName = teamMeta.teamName;
      agent.teamNameFromTags = true;
      agent.agentName = teamMeta.agentName;
    }

    // -- Context window usage (drives every agent's context gauge) --
    updateContextUsage(agentId, agent, agents, record, hookProvider);

    // Resilient content extraction: support both record.message.content and record.content
    // Claude Code may change the JSONL structure across versions
    const assistantContent = record.message?.content ?? record.content;

    if (record.type === 'assistant' && Array.isArray(assistantContent)) {
      const blocks = assistantContent as Array<{
        type: string;
        id?: string;
        name?: string;
        input?: Record<string, unknown>;
      }>;
      const hasToolUse = blocks.some((b) => b.type === 'tool_use');

      if (hasToolUse) {
        cancelWaitingTimer(agentId, waitingTimers);
        agent.isWaiting = false;
        agent.hadToolsInTurn = true;
        agents.broadcast({ type: 'agentStatus', id: agentId, status: 'active' });
        let hasNonExemptTool = false;
        for (const block of blocks) {
          if (block.type === 'tool_use' && block.id) {
            const toolName = block.name || '';
            const status = formatToolStatus(toolName, block.input || {});
            console.log(`[catavasia] JSONL: Agent ${agentId} - tool start: ${block.id} ${status}`);
            agent.activeToolIds.add(block.id);
            agent.activeToolStatuses.set(block.id, status);
            agent.activeToolNames.set(block.id, toolName);
            if (!exemptTools().has(toolName)) {
              hasNonExemptTool = true;
            }
            // Skip webview message when hooks handle tool visuals (PreToolUse sent it instantly).
            // EXCEPTION: subagent-spawn tools (Task/Agent) ALWAYS use JSONL so the overlay row
            // carries the REAL tool id. subagentClear uses the real id -- a synthetic-id row
            // from PreToolUse could never be matched.
            const isSubagentSpawn = isSubagentTool(toolName);
            if (!agent.hookDelivered || isSubagentSpawn) {
              const runInBackground = isSubagentSpawn && block.input?.run_in_background === true;
              agents.broadcast({
                type: 'agentToolStart',
                id: agentId,
                toolId: block.id,
                status,
                toolName,
                permissionActive: agent.permissionSent,
                runInBackground,
              });
            }
          }
        }
        // Skip the heuristic timer when hooks are active and for shadow-store
        // sub-agents (their activity only feeds the lead's overlay rows).
        if (hasNonExemptTool && !agent.hookDelivered && !agent.leadAgentId) {
          startPermissionTimer(agentId, agents, permissionTimers, exemptTools());
        }
      } else if (blocks.some((b) => b.type === 'text') && !agent.hadToolsInTurn) {
        // Text-only response in a turn that hasn't used any tools.
        // turn_duration handles tool-using turns reliably but is never
        // emitted for text-only turns, so we use a silence-based timer:
        // if no new JSONL data arrives within TEXT_IDLE_DELAY_MS, mark as waiting.
        // Skip when hooks are active — Stop hook handles this exactly.
        if (!agent.hookDelivered) {
          startWaitingTimer(agentId, TEXT_IDLE_DELAY_MS, agents, waitingTimers);
        }
      }
    } else if (record.type === 'assistant' && typeof assistantContent === 'string') {
      // Text-only assistant response (content is a string, not an array)
      if (!agent.hadToolsInTurn && !agent.hookDelivered) {
        startWaitingTimer(agentId, TEXT_IDLE_DELAY_MS, agents, waitingTimers);
      }
    } else if (record.type === 'assistant' && assistantContent === undefined) {
      // Assistant record with no recognizable content structure
      console.warn(
        `[catavasia] Agent ${agentId}: assistant record has no content. Keys: ${Object.keys(record).join(', ')}`,
      );
    } else if (record.type === 'progress') {
      processProgressRecord(agentId, record, agents, waitingTimers, permissionTimers);
    } else if (record.type === 'user') {
      const content = record.message?.content ?? record.content;
      if (Array.isArray(content)) {
        const blocks = content as Array<{ type: string; tool_use_id?: string; content?: unknown }>;
        const hasToolResult = blocks.some((b) => b.type === 'tool_result');
        if (hasToolResult) {
          for (const block of blocks) {
            if (block.type === 'tool_result' && block.tool_use_id) {
              const completedToolId = block.tool_use_id;
              const completedToolName = agent.activeToolNames.get(completedToolId);

              // Teammate spawn result (newer harnesses: every Agent spawn is a
              // background teammate of an implicit team; the lead's own records
              // carry no team tags, so this result line is the only lead-side
              // signal). Latch the lead's team name, so the teammate's own
              // session is recognized and never adopted as a guest. Last wins:
              // a resumed session carries spawn results of several team
              // generations. Tag-derived identity stays.
              const teammateSpawn = completedToolName
                ? hookProvider?.team?.extractTeammateSpawnFromToolResult?.(
                    completedToolName,
                    block.content,
                  )
                : null;
              if (teammateSpawn && !agent.teamNameFromTags) {
                agent.teamName = teammateSpawn.teamName;
              }

              // Detect background agent launches — keep the tool alive until queue-operation
              if (
                !teammateSpawn &&
                isSubagentTool(completedToolName) &&
                isAsyncAgentResult(block)
              ) {
                console.log(
                  `[catavasia] Agent ${agentId} background agent launched: ${completedToolId}`,
                );
                agent.backgroundAgentToolIds.add(completedToolId);
                // Current harnesses OMIT run_in_background from the tool_use
                // input, so the spawn's original agentToolStart went out
                // unflagged. Re-broadcast it flagged now that the result
                // proves it's background: the webview marks the spawn as
                // background-parented BEFORE the first turn-end clear, or the
                // overlay rows of the spawn get dropped.
                const spawnStatus = agent.activeToolStatuses.get(completedToolId);
                if (spawnStatus) {
                  agents.broadcast({
                    type: 'agentToolStart',
                    id: agentId,
                    toolId: completedToolId,
                    status: spawnStatus,
                    toolName: completedToolName,
                    runInBackground: true,
                  });
                }
                // Watch the spawn right away (sidecar may lag; the periodic
                // scan retries until it lands).
                backgroundAgentDetectedCallback?.(agentId);
                continue; // don't mark as done yet
              }

              console.log(`[catavasia] JSONL: Agent ${agentId} - tool done: ${block.tool_use_id}`);
              // If the completed tool spawned a subagent, clear its subagent tools
              if (isSubagentTool(completedToolName)) {
                agent.activeSubagentToolIds.delete(completedToolId);
                agent.activeSubagentToolNames.delete(completedToolId);
                agents.broadcast({
                  type: 'subagentClear',
                  id: agentId,
                  parentToolId: completedToolId,
                });
                // Stop the shadow watch on a foreground spawn's transcript.
                backgroundAgentCompletedCallback?.(agentId, completedToolId);
              }
              agent.activeToolIds.delete(completedToolId);
              agent.activeToolStatuses.delete(completedToolId);
              agent.activeToolNames.delete(completedToolId);
              // Send agentToolDone when hooks are off, or for Task/Agent tools
              // (which always use JSONL path for consistent sub-agent lifecycle).
              const isCompletedAgentTool =
                completedToolName === 'Task' || completedToolName === 'Agent';
              if (!agent.hookDelivered || isCompletedAgentTool) {
                const toolId = completedToolId;
                setTimeout(() => {
                  agents.broadcast({
                    type: 'agentToolDone',
                    id: agentId,
                    toolId,
                  });
                }, TOOL_DONE_DELAY_MS);
              }
            }
          }
          // All tools completed — allow text-idle timer as fallback
          // for turn-end detection when turn_duration is not emitted
          if (agent.activeToolIds.size === 0) {
            agent.hadToolsInTurn = false;
          }
        } else {
          // New user text prompt — new turn starting
          cancelWaitingTimer(agentId, waitingTimers);
          clearAgentActivity(agent, agentId, agents, permissionTimers);
          agent.hadToolsInTurn = false;
        }
      } else if (typeof content === 'string' && content.trim()) {
        // New user text prompt — new turn starting
        cancelWaitingTimer(agentId, waitingTimers);
        clearAgentActivity(agent, agentId, agents, permissionTimers);
        agent.hadToolsInTurn = false;
      }
    } else if (record.type === 'queue-operation' && record.operation === 'enqueue') {
      // Background agent completed — parse tool-use-id from XML content
      const content = record.content as string | undefined;
      if (content) {
        const toolIdMatch = content.match(/<tool-use-id>(.*?)<\/tool-use-id>/);
        if (toolIdMatch) {
          const completedToolId = toolIdMatch[1];
          if (agent.backgroundAgentToolIds.has(completedToolId)) {
            console.log(`[catavasia] Agent ${agentId} background agent done: ${completedToolId}`);
            agent.backgroundAgentToolIds.delete(completedToolId);
            agent.activeSubagentToolIds.delete(completedToolId);
            agent.activeSubagentToolNames.delete(completedToolId);
            agents.broadcast({
              type: 'subagentClear',
              id: agentId,
              parentToolId: completedToolId,
            });
            agent.activeToolIds.delete(completedToolId);
            agent.activeToolStatuses.delete(completedToolId);
            agent.activeToolNames.delete(completedToolId);
            // Stop the spawn's shadow watch.
            backgroundAgentCompletedCallback?.(agentId, completedToolId);
            if (!agent.hookDelivered) {
              const toolId = completedToolId;
              setTimeout(() => {
                agents.broadcast({
                  type: 'agentToolDone',
                  id: agentId,
                  toolId,
                });
              }, TOOL_DONE_DELAY_MS);
            }
          }
        }
      }
    } else if (record.type === 'system' && record.subtype === 'turn_duration') {
      cancelWaitingTimer(agentId, waitingTimers);
      cancelPermissionTimer(agentId, permissionTimers);

      // Definitive turn-end: clean up any stale tool state, but preserve background agents.
      // When hooks are active, the Stop hook already handled the status change,
      // but we still perform state cleanup here as a safety net.
      const hasForegroundTools = agent.activeToolIds.size > agent.backgroundAgentToolIds.size;
      if (hasForegroundTools) {
        // Remove only non-background tool state
        for (const toolId of agent.activeToolIds) {
          if (agent.backgroundAgentToolIds.has(toolId)) continue;
          agent.activeToolIds.delete(toolId);
          agent.activeToolStatuses.delete(toolId);
          const toolName = agent.activeToolNames.get(toolId);
          agent.activeToolNames.delete(toolId);
          if (isSubagentTool(toolName)) {
            agent.activeSubagentToolIds.delete(toolId);
            agent.activeSubagentToolNames.delete(toolId);
            // A foreground spawn dropped at turn end without a tool_result:
            // stop its shadow watch too, or it lingers until sessionEnd.
            backgroundAgentCompletedCallback?.(agentId, toolId);
          }
        }
        if (!agent.hookDelivered) {
          agents.broadcast({ type: 'agentToolsClear', id: agentId });
        }
        // Re-send background agent tools so the webview keeps their overlay rows.
        // toolName + runInBackground are REQUIRED: without them the webview can't
        // recognize the re-sent tool as a background spawn.
        for (const toolId of agent.backgroundAgentToolIds) {
          const status = agent.activeToolStatuses.get(toolId);
          if (status) {
            agents.broadcast({
              type: 'agentToolStart',
              id: agentId,
              toolId,
              status,
              toolName: agent.activeToolNames.get(toolId),
              runInBackground: true,
            });
          }
        }
      } else if (agent.activeToolIds.size > 0 && agent.backgroundAgentToolIds.size === 0) {
        agent.activeToolIds.clear();
        agent.activeToolStatuses.clear();
        agent.activeToolNames.clear();
        agent.activeSubagentToolIds.clear();
        agent.activeSubagentToolNames.clear();
        if (!agent.hookDelivered) {
          agents.broadcast({ type: 'agentToolsClear', id: agentId });
        }
      }

      agent.isWaiting = true;
      agent.permissionSent = false;
      agent.hadToolsInTurn = false;
      // Skip status post when hooks already handled it
      if (!agent.hookDelivered) {
        agents.broadcast({
          type: 'agentStatus',
          id: agentId,
          status: 'waiting',
          // turn_duration = the turn completed, so this is "Done".
          awaitingInput: false,
        });
      }
    } else if (record.type && !agent.seenUnknownRecordTypes.has(record.type)) {
      // Log first occurrence of unrecognized record types to help diagnose issues
      // where Claude Code changes JSONL format. Known types we intentionally skip:
      // file-history-snapshot, queue-operation (non-enqueue), etc.
      const knownSkippableTypes = new Set(['file-history-snapshot', 'system', 'queue-operation']);
      if (!knownSkippableTypes.has(record.type)) {
        agent.seenUnknownRecordTypes.add(record.type);
        if (debug) {
          console.log(
            `[catavasia] JSONL: Agent ${agentId} - unrecognized record type '${record.type}'. ` +
              `Keys: ${Object.keys(record).join(', ')}`,
          );
        }
      }
    }
  } catch {
    // Ignore malformed lines
  }
}

function processProgressRecord(
  agentId: number,
  record: Record<string, unknown>,
  agents: AgentStateStore,
  _waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
): void {
  const agent = agents.get(agentId);
  if (!agent) return;

  const parentToolId = record.parentToolUseID as string | undefined;
  if (!parentToolId) return;

  const data = record.data as Record<string, unknown> | undefined;
  if (!data) return;

  // bash_progress / mcp_progress: tool is actively executing, not stuck on permission.
  // Restart the permission timer to give the running tool another window.
  // Skip when hooks are active — Notification hook handles permission detection exactly.
  const dataType = data.type as string | undefined;
  if (dataType === 'bash_progress' || dataType === 'mcp_progress') {
    if (agent.activeToolIds.has(parentToolId) && !agent.hookDelivered && !agent.leadAgentId) {
      startPermissionTimer(agentId, agents, permissionTimers, exemptTools());
    }
    return;
  }

  // Verify parent is an active subagent-spawning tool (agent_progress handling)
  const parentToolName = agent.activeToolNames.get(parentToolId);
  if (!isSubagentTool(parentToolName)) return;

  const msg = data.message as Record<string, unknown> | undefined;
  if (!msg) return;

  const msgType = msg.type as string;
  const innerMsg = msg.message as Record<string, unknown> | undefined;
  const content = innerMsg?.content;
  if (!Array.isArray(content)) return;

  if (msgType === 'assistant') {
    let hasNonExemptSubTool = false;
    for (const block of content) {
      if (block.type === 'tool_use' && block.id) {
        const toolName = block.name || '';
        const status = formatToolStatus(toolName, block.input || {});
        console.log(
          `[catavasia] Agent ${agentId} subagent tool start: ${block.id} ${status} (parent: ${parentToolId})`,
        );

        // Track sub-tool IDs
        let subTools = agent.activeSubagentToolIds.get(parentToolId);
        if (!subTools) {
          subTools = new Set();
          agent.activeSubagentToolIds.set(parentToolId, subTools);
        }
        subTools.add(block.id);

        // Track sub-tool names (for permission checking)
        let subNames = agent.activeSubagentToolNames.get(parentToolId);
        if (!subNames) {
          subNames = new Map();
          agent.activeSubagentToolNames.set(parentToolId, subNames);
        }
        subNames.set(block.id, toolName);

        if (!exemptTools().has(toolName)) {
          hasNonExemptSubTool = true;
        }

        agents.broadcast({
          type: 'subagentToolStart',
          id: agentId,
          parentToolId,
          toolId: block.id,
          status,
        });
      }
    }
    if (hasNonExemptSubTool && !agent.hookDelivered) {
      startPermissionTimer(agentId, agents, permissionTimers, exemptTools());
    }
  } else if (msgType === 'user') {
    for (const block of content) {
      if (block.type === 'tool_result' && block.tool_use_id) {
        console.log(
          `[catavasia] Agent ${agentId} subagent tool done: ${block.tool_use_id} (parent: ${parentToolId})`,
        );

        // Remove from tracking
        const subTools = agent.activeSubagentToolIds.get(parentToolId);
        if (subTools) {
          subTools.delete(block.tool_use_id);
        }
        const subNames = agent.activeSubagentToolNames.get(parentToolId);
        if (subNames) {
          subNames.delete(block.tool_use_id);
        }

        const toolId = block.tool_use_id;
        setTimeout(() => {
          agents.broadcast({
            type: 'subagentToolDone',
            id: agentId,
            parentToolId,
            toolId,
          });
        }, 300);
      }
    }
    // If there are still active non-exempt sub-agent tools, restart the permission timer
    // (handles the case where one sub-agent completes but another is still stuck)
    let stillHasNonExempt = false;
    for (const [, subNames] of agent.activeSubagentToolNames) {
      for (const [, toolName] of subNames) {
        if (!exemptTools().has(toolName)) {
          stillHasNonExempt = true;
          break;
        }
      }
      if (stillHasNonExempt) break;
    }
    if (stillHasNonExempt && !agent.hookDelivered) {
      startPermissionTimer(agentId, agents, permissionTimers, exemptTools());
    }
  }
}

/** Check if a tool_result block indicates an async/background agent launch */
function isAsyncAgentResult(block: Record<string, unknown>): boolean {
  const content = block.content;
  if (Array.isArray(content)) {
    for (const item of content) {
      if (
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Record<string, unknown>).text === 'string' &&
        ((item as Record<string, unknown>).text as string).startsWith(
          'Async agent launched successfully.',
        )
      ) {
        return true;
      }
    }
  } else if (typeof content === 'string') {
    return content.startsWith('Async agent launched successfully.');
  }
  return false;
}
