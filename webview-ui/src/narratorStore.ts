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
import { idleLine, showsIdleLine } from './narratorIdle.js';
import type { Character } from './office/types.js';
import { transport } from './transport/index.js';

/** Latest line per cat, with the time it arrived (epoch ms). */
const lines = new Map<number, NarratorLine & { at: number }>();
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
      lines.set(msg.catId, { catId: msg.catId, state: msg.state, line: msg.line, at: Date.now() });
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

/**
 * English hover text for a cat, or undefined to fall back to the raw tool
 * status. A cat between turns shows what it does now (see narratorIdle.ts).
 */
export function narratorHover(
  catId: number,
  ch: Pick<Character, 'isActive' | 'activity' | 'social'>,
): { line: string; summary?: string } | undefined {
  if (settings.rawToolStatus) return undefined;
  const line = lines.get(catId);
  if (!line) return undefined;
  const text = showsIdleLine(line, ch.isActive, Date.now()) ? idleLine(ch) : line.line;
  return { line: text, summary: summaries.get(catId) };
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
