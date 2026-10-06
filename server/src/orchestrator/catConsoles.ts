/**
 * What the cat console shows for a profile cat: its turns, across all its
 * tasks (the message it read, its tools and text, errors). Kept in memory
 * only, capped per cat: after a server restart the console starts empty.
 */

import { EventEmitter } from 'events';

import type { CatSessionEntry } from '../../../core/src/catSession.js';
import { CAT_CONSOLE_MAX_ENTRIES } from '../constants.js';

export interface CatConsoleEvents {
  /** New rows of one cat. */
  entries: [catId: string, entries: CatSessionEntry[]];
  /** Busy or wheel state may have changed (any cat). */
  status: [];
}

export class CatConsoles {
  private readonly rows = new Map<string, CatSessionEntry[]>();
  readonly events = new EventEmitter<CatConsoleEvents>();

  constructor() {
    // One listener per open console panel.
    this.events.setMaxListeners(0);
  }

  entries(catId: string): CatSessionEntry[] {
    return [...(this.rows.get(catId) ?? [])];
  }

  push(catId: string, ...entries: CatSessionEntry[]): void {
    const rows = this.rows.get(catId) ?? [];
    rows.push(...entries);
    if (rows.length > CAT_CONSOLE_MAX_ENTRIES)
      rows.splice(0, rows.length - CAT_CONSOLE_MAX_ENTRIES);
    this.rows.set(catId, rows);
    this.events.emit('entries', catId, entries);
  }

  statusChanged(): void {
    this.events.emit('status');
  }
}
