/**
 * The rows of the CEO desk's live chat (ceoDesk.ts): kept newest
 * CEO_DESK_HISTORY_MAX, saved to the chat's history file on every change and
 * sent to the open docks as frames. A chat switch makes a new log.
 */

import type { CatSessionEntry, CatSessionFrame } from '../../../core/src/catSession.js';
import type { JobCard } from '../../../core/src/ceoDesk.js';
import { CEO_DESK_HISTORY_MAX } from '../constants.js';
import type { DeskRow, DeskStore } from './deskStore.js';

export class DeskLog {
  readonly rows: DeskRow[];

  constructor(
    private readonly store: DeskStore,
    readonly chatId: string,
    private readonly emit: (frame: CatSessionFrame) => void,
  ) {
    this.rows = store.readHistory(chatId);
  }

  add(entry: CatSessionEntry): DeskRow {
    // `at` is the row's id for the dock's unread mark: unique and rising.
    const row = { ...entry, at: Math.max(Date.now(), (this.rows.at(-1)?.at ?? 0) + 1) } as DeskRow;
    this.rows.push(row);
    if (this.rows.length > CEO_DESK_HISTORY_MAX)
      this.rows.splice(0, this.rows.length - CEO_DESK_HISTORY_MAX);
    this.store.writeHistory(this.chatId, this.rows);
    this.emit({ type: 'entries', entries: [row] });
    return row;
  }

  /** Replace the job's card row; false: this chat has none. */
  replaceCard(text: string, job: JobCard): boolean {
    const at = this.rows.findIndex((r) => r.kind === 'job' && r.job.jobId === job.jobId);
    if (at < 0) return false;
    this.rows[at] = { kind: 'job', text, job, at: this.rows[at].at };
    this.store.writeHistory(this.chatId, this.rows);
    this.emit({ type: 'job', text, job });
    return true;
  }

  /** A row changed in place (a tool's result came). */
  update(row: DeskRow): void {
    const at = this.rows.findIndex((r) => r.at === row.at);
    if (at < 0) return;
    this.rows[at] = row;
    this.store.writeHistory(this.chatId, this.rows);
    this.emit({ type: 'update', entry: row });
  }
}
