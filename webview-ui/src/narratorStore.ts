/**
 * Webview side of the narrator (server/src/narrator/): the latest Russian
 * status line and conversation summary per cat, plus the narrator settings.
 *
 * The narrator messages are not in core/asyncapi.yaml yet (see
 * core/src/narrator.ts), so this module subscribes to the transport itself
 * and casts at the boundary. ToolOverlay re-renders every frame and reads the
 * store directly; React components that need updates use useNarratorSettings.
 */

import { useSyncExternalStore } from 'react';

import type { ClientMessage } from '../../core/src/messages.js';
import type {
  NarratorLine,
  NarratorServerMessage,
  NarratorSettings,
  SetNarratorSettings,
} from '../../core/src/narrator.js';
import { transport } from './transport/index.js';

const lines = new Map<number, NarratorLine>();
const summaries = new Map<number, string>();
let settings: NarratorSettings = { aiSummaries: true, rawToolStatus: false };
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

transport.onMessage((raw) => {
  const msg = raw as unknown as NarratorServerMessage | { type: string; id?: number };
  switch (msg.type) {
    case 'narratorLine': {
      const m = msg as NarratorServerMessage & { type: 'narratorLine' };
      lines.set(m.catId, { catId: m.catId, state: m.state, line: m.line });
      break;
    }
    case 'narratorSummary': {
      const m = msg as NarratorServerMessage & { type: 'narratorSummary' };
      for (const id of m.catIds) summaries.set(id, m.summary);
      break;
    }
    case 'narratorSettings': {
      const m = msg as NarratorServerMessage & { type: 'narratorSettings' };
      settings = { aiSummaries: m.aiSummaries, rawToolStatus: m.rawToolStatus };
      emit();
      break;
    }
    case 'agentClosed': {
      const id = (msg as { id?: number }).id;
      if (id !== undefined) {
        lines.delete(id);
        summaries.delete(id);
      }
      break;
    }
  }
});

/** Russian hover text for a cat, or undefined to fall back to the raw tool status. */
export function narratorHover(catId: number): { line: string; summary?: string } | undefined {
  if (settings.rawToolStatus) return undefined;
  const line = lines.get(catId);
  return line ? { line: line.line, summary: summaries.get(catId) } : undefined;
}

export function setNarratorSettings(patch: Partial<NarratorSettings>): void {
  settings = { ...settings, ...patch };
  emit();
  const msg: SetNarratorSettings = { type: 'setNarratorSettings', ...patch };
  transport.send(msg as unknown as ClientMessage);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useNarratorSettings(): NarratorSettings {
  return useSyncExternalStore(subscribe, () => settings);
}
