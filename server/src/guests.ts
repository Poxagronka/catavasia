/**
 * Guests: external Claude sessions the standalone server adopted (a terminal
 * session, Watch All Sessions). The office belongs to the user's own cats, so
 * guests stay hidden unless the `showGuests` setting is on; then the webview
 * draws them translucent, outside the hierarchy. Hidden guests are still
 * tracked: only the messages about them are held back from clients.
 */

import { resendAgentActivity } from './agentActivityResend.js';
import type { AgentStateStore } from './agentStateStore.js';

type Message = Record<string, unknown>;

function guestIds(store: AgentStateStore): Set<number> {
  const ids = new Set<number>();
  for (const [id, agent] of store) if (agent.isExternal) ids.add(id);
  return ids;
}

/**
 * The message a client may see while guests are hidden, or null. `agentClosed`
 * always passes, so hiding guests can remove characters a client already has.
 */
export function filterGuestMessage(
  msg: Message,
  store: AgentStateStore,
  showGuests: { current: boolean },
): Message | null {
  if (showGuests.current || msg.type === 'agentClosed') return msg;
  if (msg.type === 'existingAgents') {
    const hidden = guestIds(store);
    const keep = (rec: unknown) =>
      Object.fromEntries(
        Object.entries((rec ?? {}) as Message).filter(([id]) => !hidden.has(Number(id))),
      );
    return {
      ...msg,
      agents: (msg.agents as number[]).filter((id) => !hidden.has(id)),
      agentMeta: keep(msg.agentMeta),
      folderNames: keep(msg.folderNames),
      externalAgents: keep(msg.externalAgents),
    };
  }
  if (typeof msg.id === 'number' && store.get(msg.id)?.isExternal) return null;
  return msg;
}

/** Apply a new showGuests value to every connected client. */
export function applyShowGuests(
  store: AgentStateStore,
  showGuests: { current: boolean },
  enabled: boolean,
): void {
  if (showGuests.current === enabled) return;
  showGuests.current = enabled;
  const ids = guestIds(store);
  if (!enabled) {
    for (const id of ids) store.broadcast({ type: 'agentClosed', id });
    return;
  }
  for (const id of ids) store.reannounce(id);
  resendAgentActivity((m) => {
    if (ids.has(m.id as number)) store.broadcast(m);
  }, store);
}
