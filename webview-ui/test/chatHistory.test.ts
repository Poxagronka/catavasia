/**
 * The chat title menu of the CEO dock: chats grouped by day like the Claude
 * app (Today, Yesterday, Previous 7 days, Older) and filtered by the search box.
 *
 * Run with: npm test
 */

import { describe, expect, it } from 'vitest';

import type { CeoChatSummary } from '../../core/src/ceoDesk.js';
import { groupChats } from '../src/ceoDesk/chatHistoryState.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// 2026-10-07 15:00 local time.
const NOW = new Date(2026, 9, 7, 15, 0).getTime();
const chat = (id: string, title: string, updatedAt: number): CeoChatSummary => ({
  id,
  title,
  updatedAt,
});

const CHATS = [
  chat('a', 'Plan the launch party', NOW - HOUR),
  chat('b', 'Fix the login page', NOW - 14 * HOUR), // 01:00 today
  chat('c', 'Cat food order', NOW - 16 * HOUR), // 23:00 yesterday
  chat('d', 'Weekly report', NOW - 3 * DAY),
  chat('e', 'Old idea', NOW - 7 * DAY),
  chat('f', 'Ancient chat', NOW - 40 * DAY),
];

const shape = (groups: ReturnType<typeof groupChats>) =>
  groups.map((g) => [g.label, g.chats.map((c) => c.id)]);

describe('chat history groups', () => {
  it('groups by calendar day, newest first, and skips empty groups', () => {
    expect(shape(groupChats(CHATS, NOW, ''))).toEqual([
      ['Today', ['a', 'b']],
      ['Yesterday', ['c']],
      ['Previous 7 days', ['d', 'e']],
      ['Older', ['f']],
    ]);
    expect(shape(groupChats([CHATS[5]], NOW, ''))).toEqual([['Older', ['f']]]);
  });

  it('filters by every word of the search, ignoring case', () => {
    expect(shape(groupChats(CHATS, NOW, '  the PAGE '))).toEqual([['Today', ['b']]]);
    expect(groupChats(CHATS, NOW, 'nothing like this')).toEqual([]);
  });

  it('a chat without a title shows as "New chat"', () => {
    const groups = groupChats([chat('x', '', NOW)], NOW, 'new');
    expect(groups[0].chats[0].title).toBe('New chat');
  });
});
