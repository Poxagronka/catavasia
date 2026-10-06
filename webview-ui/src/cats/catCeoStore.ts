// Store of the Cat CEO and prompt history in the Cats menu (docs/catavasia/cat-ceo-judge.md §10).
//
// - Settings: `catCeoSettings` from the server; `setCatCeoSettings` changes them.
// - Prompt history of a cat: `getPromptHistory` -> `promptHistory`, a commit's
//   diff: `getPromptDiff` -> `promptDiff`. Revert, restore and item edits are
//   committed by the server, which answers with the new history (and new
//   profiles). A refused change comes back as `catProfileRejected` (useCats).
// - A Cat CEO review that edited a cat refreshes that cat's open history.

import type {
  CatCeoSettings,
  ClientMessage,
  PromptHistoryEntry,
  PromptSection,
  ServerMessage,
} from '../../../core/src/messages.js';

export type CeoSettings = Omit<CatCeoSettings, 'type'>;

export interface CeoSnapshot {
  /** null until the server office answers (VS Code, Vite dev: no Cat CEO). */
  settings: CeoSettings | null;
  history: Record<string, PromptHistoryEntry[]>;
  /** Diff text by `<catId>:<sha>`. */
  diffs: Record<string, string>;
}

interface Wire {
  send(msg: ClientMessage): void;
  onMessage(handler: (msg: ServerMessage) => void): () => void;
}

export function createCatCeoStore(wire: Wire) {
  let state: CeoSnapshot = { settings: null, history: {}, diffs: {} };
  const listeners = new Set<() => void>();
  const set = (next: Partial<CeoSnapshot>) => {
    state = { ...state, ...next };
    listeners.forEach((l) => l());
  };
  const requestHistory = (catId: string) => wire.send({ type: 'getPromptHistory', catId });

  wire.onMessage((msg) => {
    switch (msg.type) {
      case 'catCeoSettings':
        set({ settings: msg });
        break;
      case 'promptHistory':
        set({ history: { ...state.history, [msg.catId]: msg.entries } });
        break;
      case 'promptDiff':
        set({ diffs: { ...state.diffs, [`${msg.catId}:${msg.sha}`]: msg.diff } });
        break;
      case 'reviewFinished':
        for (const e of msg.edits) if (state.history[e.catId]) requestHistory(e.catId);
        break;
    }
  });

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    // No local update: the server answers with catCeoSettings, or refuses.
    setSettings(patch: Partial<CeoSettings>) {
      wire.send({ type: 'setCatCeoSettings', ...patch });
    },
    requestHistory,
    requestDiff: (catId: string, sha: string) => wire.send({ type: 'getPromptDiff', catId, sha }),
    revert: (catId: string, sha: string) => wire.send({ type: 'revertPromptEdit', catId, sha }),
    restore: (catId: string, sha: string) =>
      wire.send({ type: 'restorePromptVersion', catId, sha }),
    removeItem: (catId: string, itemId: string) =>
      wire.send({ type: 'removePromptItem', catId, itemId }),
    saveItem: (catId: string, section: PromptSection, text: string, itemId?: string) =>
      wire.send({ type: 'savePromptItem', catId, section, text, ...(itemId ? { itemId } : {}) }),
  };
}

export type CatCeoStore = ReturnType<typeof createCatCeoStore>;
