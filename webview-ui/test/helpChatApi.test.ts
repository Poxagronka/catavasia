/** The help chat store: sends over the transport and folds server events into the conversation. */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { handlers, send } = vi.hoisted(() => ({
  handlers: [] as Array<(msg: Record<string, unknown>) => void>,
  send: vi.fn(),
}));
vi.mock('../src/transport/index.js', () => ({
  transport: {
    send: (m: unknown) => send(m),
    onMessage: (h: (msg: Record<string, unknown>) => void) => handlers.push(h),
  },
}));

import {
  helpChatSnapshot,
  resetHelpChat,
  sendHelpMessage,
  stopHelpChat,
} from '../src/onboarding/helpChatApi.js';

const emit = (msg: Record<string, unknown>) => handlers.forEach((h) => h(msg));

const snapshot = helpChatSnapshot;

describe('helpChatApi', () => {
  beforeEach(() => {
    send.mockClear();
    resetHelpChat();
    send.mockClear();
  });

  it('sends a message and folds draft and reply events', () => {
    sendHelpMessage('  hello ', 'onboarding', 'ru');
    expect(send).toHaveBeenCalledWith({
      type: 'helpChatSend',
      text: 'hello',
      context: 'onboarding',
      language: 'ru',
    });
    expect(snapshot().busy).toBe(true);
    emit({ type: 'helpChatEvent', event: 'draft', text: 'Hi th' });
    expect(snapshot().draft).toBe('Hi th');
    emit({ type: 'helpChatEvent', event: 'reply', text: 'Hi there' });
    const s = snapshot();
    expect(s.busy).toBe(false);
    expect(s.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('shows the unavailable notice and stops a running turn', () => {
    sendHelpMessage('hi', 'settings', 'en');
    emit({ type: 'helpChatEvent', event: 'unavailable', text: 'Claude Code is not installed.' });
    expect(snapshot().unavailable).toBe('Claude Code is not installed.');
    sendHelpMessage('again', 'settings', 'en');
    send.mockClear();
    stopHelpChat();
    expect(send).toHaveBeenCalledWith({ type: 'helpChatStop' });
    expect(snapshot().busy).toBe(false);
  });
});
