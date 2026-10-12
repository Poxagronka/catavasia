import type { AgentStateStore } from './agentStateStore.js';

/**
 * Replay an agent's active state to a connecting client.
 *
 * Order matters:
 * 1. Regular tools
 * 2. Background tools with the runInBackground flag
 * 3. Finished task link
 * 4. Waiting status
 * 5. Context usage
 */
export function resendAgentActivity(
  send: (message: Record<string, unknown>) => void,
  store: AgentStateStore,
): void {
  for (const [id, agent] of store) {
    // 1. Regular (non-background) tools
    for (const [toolId, status] of agent.activeToolStatuses) {
      // Skip background tools here — they're sent separately below with proper flags
      if (agent.backgroundAgentToolIds.has(toolId)) continue;

      const toolName = agent.activeToolNames.get(toolId) ?? '';
      send({
        type: 'agentToolStart',
        id,
        toolId,
        status,
        toolName,
      });
    }

    // 2. Background tools with runInBackground flag.
    for (const toolId of agent.backgroundAgentToolIds) {
      const status = agent.activeToolStatuses.get(toolId);
      if (!status) continue;

      const toolName = agent.activeToolNames.get(toolId);
      send({
        type: 'agentToolStart',
        id,
        toolId,
        status,
        toolName,
        runInBackground: true,
      });
    }

    // 3. Finished task-board run: the idle cat links to its task.
    if (agent.finishedTaskId) {
      send({ type: 'agentTaskFinished', id, taskId: agent.finishedTaskId });
    }

    // 4. Waiting status
    if (agent.isWaiting) {
      send({
        type: 'agentStatus',
        id,
        status: 'waiting',
      });
    }

    // 5. Context usage
    if (agent.contextTokens > 0) {
      send({
        type: 'agentContextUsage',
        id,
        contextTokens: agent.contextTokens,
        maxContextTokens: agent.maxContextTokens,
      });
    }
  }
}
