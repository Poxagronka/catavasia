/**
 * Pure state of the chat title menu (ChatHistoryMenu.tsx): the chats grouped
 * by calendar day like the Claude app, filtered by the search box. No DOM,
 * so the node-side tests import it.
 */

import type { CeoChatSummary } from '../../../core/src/ceoDesk.js';

export interface ChatGroup {
  label: string;
  chats: CeoChatSummary[];
}

/** The name of a chat with no message yet. */
export const NEW_CHAT_TITLE = 'New chat';

/**
 * Today, Yesterday, Previous 7 days and Older (local calendar days), newest
 * first; empty groups are left out. A chat matches the search when its title
 * has every word of it, in any case.
 */
export function groupChats(chats: CeoChatSummary[], now: number, query: string): ChatGroup[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  // The start of a day `back` days ago (setDate keeps local midnight across clock changes).
  const dayStart = (back: number) => {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    return day.setDate(day.getDate() - back);
  };
  const bounds: Array<[string, number]> = [
    ['Today', dayStart(0)],
    ['Yesterday', dayStart(1)],
    ['Previous 7 days', dayStart(7)],
    ['Older', -Infinity],
  ];
  const groups = bounds.map(([label]) => ({ label, chats: [] as CeoChatSummary[] }));
  const sorted = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);
  for (const chat of sorted) {
    const title = chat.title || NEW_CHAT_TITLE;
    if (!words.every((w) => title.toLowerCase().includes(w))) continue;
    const at = bounds.findIndex(([, from]) => chat.updatedAt >= from);
    groups[at].chats.push({ ...chat, title });
  }
  return groups.filter((g) => g.chats.length > 0);
}
