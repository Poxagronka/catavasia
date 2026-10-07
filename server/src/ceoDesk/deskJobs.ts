/**
 * The job cards of the CEO desk (ceoDesk.ts): a card follows its team task
 * (throttled while it runs), and an ended job becomes a notice for the CEO's
 * next turn.
 */

import type { CatSessionEntry } from '../../../core/src/catSession.js';
import type { JobCard } from '../../../core/src/ceoDesk.js';
import { CEO_DESK_CARD_THROTTLE_MS } from '../constants.js';
import type { Orchestrator } from '../orchestrator/orchestrator.js';
import type { TaskManager } from '../taskBoard/taskManager.js';
import { jobNotice } from './deskPrompt.js';
import { ADOPTED_TEXT, type DeskState } from './deskStore.js';
import { cardLine, jobCard } from './deskTools.js';

export interface DeskJobsHost {
  tasks: TaskManager;
  office: Orchestrator;
  state(): DeskState;
  save(): void;
  add(entry: CatSessionEntry): void;
  /** Replace the card row of this job and tell the open chats; false: the chat has none. */
  replaceCard(text: string, job: JobCard): boolean;
  statusChanged(): void;
  pump(): void;
  /** The project folder of a job's cwd (null: the sandbox). */
  folderOf(cwd: string): string | null;
}

export class DeskJobs {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly host: DeskJobsHost) {}

  /** No more card updates (a new chat, or the desk goes away). */
  clear(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  /** A task changed: update its card; an ended job queues its notice for the CEO. */
  taskChanged(id: string, now = false): void {
    const state = this.host.state();
    if (!state.liveJobs.includes(id)) return;
    const task = this.host.tasks.get(id);
    if (!task) {
      state.liveJobs = state.liveJobs.filter((j) => j !== id);
      this.host.save();
      return;
    }
    // A team job ends only in a final flow state: an interrupted job that is
    // being cancelled still has status `error` from the restart.
    const ended = task.flow
      ? ['done', 'error', 'cancelled'].includes(task.flow.state)
      : task.status !== 'running';
    if (ended || now) {
      clearTimeout(this.timers.get(id));
      this.timers.delete(id);
      this.updateCard(id);
    } else if (!this.timers.has(id)) {
      this.timers.set(
        id,
        setTimeout(() => {
          this.timers.delete(id);
          this.updateCard(id);
        }, CEO_DESK_CARD_THROTTLE_MS),
      );
    }
    if (!ended) return;
    state.liveJobs = state.liveJobs.filter((j) => j !== id);
    state.pending.push({ kind: 'notice', text: jobNotice(task, this.host.folderOf(task.cwd)) });
    this.host.save();
    this.host.statusChanged();
    this.host.pump();
  }

  /** First start after the board: its interrupted team tasks get cards with Resume and Cancel. */
  adoptBoardTasks(): void {
    const state = this.host.state();
    state.boardAdopted = true;
    const ids = this.host.tasks.adoptInterrupted(state.chatId);
    if (!ids.length) return;
    this.host.add({ kind: 'text', text: ADOPTED_TEXT });
    for (const id of ids) {
      state.liveJobs.push(id);
      this.updateCard(id);
    }
  }

  /** Replace the job's card row (or add it) and tell the open chats. */
  updateCard(id: string): void {
    const task = this.host.tasks.get(id);
    if (!task) return;
    const job = jobCard(task, this.host.office, this.host.folderOf(task.cwd));
    const text = cardLine(job);
    if (!this.host.replaceCard(text, job)) this.host.add({ kind: 'job', text, job });
  }
}
