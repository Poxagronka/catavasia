/**
 * Webview side of the narrator (server/src/narrator/): the latest English
 * status line and conversation summary per cat, plus the narrator settings.
 *
 * This module subscribes to the transport itself. ToolOverlay re-renders every
 * frame and reads the store directly; React components that need updates use
 * useNarratorSettings.
 */

import { useSyncExternalStore } from 'react';

import { TRANSPORT_STATE_CONNECTED } from '../../core/src/constants.js';
import type { SetNarratorSettings } from '../../core/src/messages.js';
import type { NarratorLine, NarratorSettings } from '../../core/src/narrator.js';
import { transport } from './transport/index.js';

const lines = new Map<number, NarratorLine>();
const summaries = new Map<number, string>();
let settings: NarratorSettings = { aiSummaries: true, rawToolStatus: false };
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

// Agent ids restart after a server restart: drop everything on a lost
// connection. The server resends its lines on the next webviewReady.
transport.onStateChange((state) => {
  if (state !== TRANSPORT_STATE_CONNECTED) {
    lines.clear();
    summaries.clear();
  }
});

transport.onMessage((msg) => {
  switch (msg.type) {
    case 'narratorLine':
      lines.set(msg.catId, { catId: msg.catId, state: msg.state, line: msg.line });
      break;
    case 'narratorSummary':
      for (const id of msg.catIds) summaries.set(id, msg.summary);
      break;
    case 'narratorSettings':
      settings = { aiSummaries: msg.aiSummaries, rawToolStatus: msg.rawToolStatus };
      emit();
      break;
    case 'agentClosed':
      lines.delete(msg.id);
      summaries.delete(msg.id);
      break;
  }
});

/** English hover text for a cat, or undefined to fall back to the raw tool status. */
export function narratorHover(catId: number): { line: string; summary?: string } | undefined {
  if (settings.rawToolStatus) return undefined;
  const line = lines.get(catId);
  return line ? { line: line.line, summary: summaries.get(catId) } : undefined;
}

export function setNarratorSettings(patch: Partial<NarratorSettings>): void {
  settings = { ...settings, ...patch };
  emit();
  const msg: SetNarratorSettings = { type: 'setNarratorSettings', ...patch };
  transport.send(msg);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useNarratorSettings(): NarratorSettings {
  return useSyncExternalStore(subscribe, () => settings);
}
