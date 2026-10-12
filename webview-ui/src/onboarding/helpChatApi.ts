/**
 * Client state of the help chat. The server runs the Claude turn; this store keeps the visible
 * conversation and talks to it over the transport (helpChatSend, helpChatStop, helpChatReset).
 */

import { useSyncExternalStore } from 'react';

import { transport } from '../transport/index.js';

/** Why the server ended a turn or refused it: the panel shows its own translated sentence. */
export type HelpCode = 'notInstalled' | 'notLoggedIn' | 'replaced' | 'noAnswer' | 'exited';

export interface HelpNote {
  /** The server's English text: shown when the code is unknown. */
  text: string;
  code?: HelpCode;
  exitCode?: number;
}

export interface HelpMessage {
  role: 'user' | 'assistant' | 'error';
  text: string;
  /** An error message: the server's reason code. */
  note?: HelpNote;
}

export interface HelpChatState {
  messages: HelpMessage[];
  /** The reply so far, while a turn runs. */
  draft: string;
  busy: boolean;
  /** Claude Code is missing or logged out: the text says how to fix it. */
  unavailable: HelpNote | undefined;
}

const EMPTY: HelpChatState = { messages: [], draft: '', busy: false, unavailable: undefined };

let state: HelpChatState = EMPTY;
const listeners = new Set<() => void>();

function set(next: Partial<HelpChatState>): void {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

function codeOf(msg: { code?: HelpCode; exitCode?: number }): Pick<HelpNote, 'code' | 'exitCode'> {
  return { code: msg.code, exitCode: msg.exitCode };
}

transport.onMessage((msg) => {
  if (msg.type !== 'helpChatEvent') return;
  const text = msg.text ?? '';
  switch (msg.event) {
    case 'draft':
      set({ draft: text });
      break;
    case 'reply':
      set({ messages: [...state.messages, { role: 'assistant', text }], draft: '', busy: false });
      break;
    case 'error':
      set({
        messages: [...state.messages, { role: 'error', text, note: { text, ...codeOf(msg) } }],
        draft: '',
        busy: false,
      });
      break;
    case 'unavailable':
      set({ unavailable: { text, ...codeOf(msg) }, draft: '', busy: false });
      break;
  }
});

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current state, outside React. */
export function helpChatSnapshot(): HelpChatState {
  return state;
}

export function useHelpChat(): HelpChatState {
  return useSyncExternalStore(subscribe, helpChatSnapshot);
}

/** Send the user's message. `language` is the UI language code (a hint for the first reply). */
export function sendHelpMessage(
  text: string,
  context: 'onboarding' | 'settings',
  language: string,
): void {
  const trimmed = text.trim();
  if (!trimmed || state.busy) return;
  set({
    messages: [...state.messages, { role: 'user', text: trimmed }],
    draft: '',
    busy: true,
    unavailable: undefined,
  });
  transport.send({ type: 'helpChatSend', text: trimmed, context, language });
}

/** End the running turn. The visible conversation stays. */
export function stopHelpChat(): void {
  if (!state.busy) return;
  set({ draft: '', busy: false });
  transport.send({ type: 'helpChatStop' });
}

/** Forget the conversation on both sides. */
export function resetHelpChat(): void {
  state = EMPTY;
  for (const l of listeners) l();
  transport.send({ type: 'helpChatReset' });
}
