/**
 * The CEO desk (docs/catavasia/ROADMAP.md, "CEO desk replaces the task board"):
 * one live CEO conversation per office. Each user message is one turn of a
 * resumable Claude session, in the project folder (or cat-ceo/chats/<chatId>/
 * without one; a new folder starts a new session). The CEO
 * answers itself or starts jobs (team tasks) with its desk tools; when a job
 * ends, a job notice with the full result becomes the CEO's next turn. One
 * turn at a time: messages and notices wait in `pending` (no TurnScheduler).
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

import type {
  CatSessionEntry,
  CatSessionFrame,
  CatSessionStatus,
} from '../../../core/src/catSession.js';
import type { CeoAttachmentUpload, CeoStopResponse } from '../../../core/src/ceoDesk.js';
import type { TaskLogEntry } from '../../../core/src/tasks.js';
import {
  CAT_CEO_DIR,
  CAT_CEO_ID,
  CAT_CEO_TIMEOUT_MS,
  CEO_DESK_CARD_THROTTLE_MS,
  CEO_DESK_HISTORY_MAX,
  CEO_DESK_TURN_BUDGET_USD,
} from '../constants.js';
import type { EngineAdapter, TurnOutcome } from '../orchestrator/engineAdapter.js';
import { isAuthError } from '../orchestrator/engineStatus.js';
import type { OfficeToolHandler, OfficeToolResult } from '../orchestrator/officeMcp.js';
import type { Orchestrator } from '../orchestrator/orchestrator.js';
import type { TaskManager } from '../taskBoard/taskManager.js';
import { saveAttachments, type SavedAttachments } from './attachments.js';
import { jobNotice } from './deskPrompt.js';
import { ADOPTED_TEXT, type DeskRow, type DeskState, DeskStore, freshDesk } from './deskStore.js';
import { callDeskTool, cardLine, DESK_MCP_NAME, type DeskToolHost, jobCard } from './deskTools.js';
import { logRows, spawnDeskTurn, type Turn } from './deskTurn.js';
import { RECENT_FOLDERS_MAX, recentFolders } from './workFolder.js';

export const CEO_NO_WHEEL = 'The CEO has no terminal session: talk to it in the chat';
export const RESTARTED_TEXT = 'The server restarted during this turn; send again.';
export const BUDGET_HIT_TEXT = `This turn hit the $${CEO_DESK_TURN_BUDGET_USD} budget limit. Ask again to continue.`;

export interface CeoDeskOptions {
  stateDir: string;
  office: Orchestrator;
  tasks: TaskManager;
  /** The Claude Code adapter: the CEO always runs on Claude. */
  adapter: EngineAdapter;
}

export class CeoDesk implements OfficeToolHandler {
  private readonly events = new EventEmitter<{ frame: [CatSessionFrame] }>();
  private readonly store: DeskStore;
  private state: DeskState;
  private rows: DeskRow[];
  private turn: Turn | undefined;
  private reworkCount = 0;
  private mcpUrl = '';
  private disposed = false;
  private readonly cardTimers = new Map<string, NodeJS.Timeout>();
  private readonly onTaskStatus = (id: string) => this.taskChanged(id);

  constructor(private readonly opts: CeoDeskOptions) {
    this.events.setMaxListeners(0);
    this.store = new DeskStore(path.join(opts.stateDir, CAT_CEO_DIR));
    this.state = this.store.load(Date.now());
    this.rows = this.store.readHistory(this.state.chatId);
    if (this.state.turnRunning) {
      this.state.turnRunning = false;
      // The cut turn may have created the session: a first turn starts a new one.
      if (!this.state.started) this.state.sessionId = freshDesk().sessionId;
      this.add({ kind: 'error', text: RESTARTED_TEXT });
    }
    // Jobs that ended while the server was down get their notice now.
    for (const id of [...this.state.liveJobs]) this.taskChanged(id, true);
    if (!this.state.boardAdopted) this.adoptBoardTasks();
    this.store.save(this.state);
    opts.tasks.events.on('status', this.onTaskStatus);
  }

  /** The server listens: the CEO reaches its desk tools here, and queued notices can run. */
  setServerUrl(baseUrl: string, mcpPath: string): void {
    this.mcpUrl = `${baseUrl}${mcpPath}`;
    this.pump();
  }

  dispose(): void {
    this.disposed = true;
    this.opts.tasks.events.off('status', this.onTaskStatus);
    for (const timer of this.cardTimers.values()) clearTimeout(timer);
    this.cardTimers.clear();
    // turnRunning stays true on disk: the next start tells the user.
    if (this.turn) {
      clearTimeout(this.turn.timer);
      this.turn.stopped = true;
      this.turn.handle.kill();
    }
  }

  // ── Chat (officeCatSource.ts and ceoRoutes.ts) ──

  snapshot(): { title: string; entries: CatSessionEntry[]; status: CatSessionStatus } {
    return {
      title: this.opts.office.ceo.settings.name,
      entries: this.rows.slice(),
      status: this.status(),
    };
  }

  subscribe(listener: (frame: CatSessionFrame) => void): () => void {
    this.events.on('frame', listener);
    return () => this.events.off('frame', listener);
  }

  get folder(): string | null {
    return this.state.folder;
  }

  /** Save the files of a message in this chat (attachments.ts checks the limits). */
  saveAttachments(uploads: CeoAttachmentUpload[]): SavedAttachments | { error: string } {
    return saveAttachments(this.store.chatDir(this.state.chatId), this.state.chatId, uploads);
  }

  /** A user message. Returns how many messages and notices wait for the next turn. */
  send(text: string, files?: SavedAttachments): number {
    const attachments = files?.attachments.length ? { attachments: files.attachments } : {};
    this.add({ kind: 'user', text, ...attachments });
    this.state.pending.push({
      kind: 'user',
      text: [text, ...(files?.lines ?? [])].filter(Boolean).join('\n'),
      ...(files?.images.length ? { images: files.images } : {}),
      ...(files?.attachments.length ? { draft: text, ...attachments } : {}),
    });
    this.store.save(this.state);
    this.statusChanged();
    this.pump();
    return this.state.pending.length;
  }

  /**
   * Kill the turn, drop queued notices; queued user messages go back to the
   * draft, their files too (the stored files stay where they are).
   */
  stop(): CeoStopResponse {
    const queued = this.state.pending.filter((p) => p.kind === 'user');
    const draft = queued
      .map((p) => p.draft ?? p.text)
      .filter(Boolean)
      .join('\n\n');
    const attachments = queued.flatMap((p) => p.attachments ?? []);
    const had = !!this.turn || this.state.pending.length > 0;
    this.state.pending = [];
    this.store.save(this.state);
    if (this.turn) {
      this.turn.stopped = true;
      this.turn.handle.kill();
    }
    if (had) this.add({ kind: 'text', text: 'Stopped.' });
    this.statusChanged();
    return { draft, ...(attachments.length ? { attachments } : {}) };
  }

  /** Archive this chat and start a new one. Live jobs go on; their notices are dropped. */
  newChat(): string {
    this.stop();
    for (const timer of this.cardTimers.values()) clearTimeout(timer);
    this.cardTimers.clear();
    // The board's tasks were adopted once; a New chat never adopts them again.
    // The project is the office's: it stays for the new chat.
    const { folder, recent } = this.state;
    this.state = { ...freshDesk(), boardAdopted: true, folder, ...(recent ? { recent } : {}) };
    this.rows = [];
    this.reworkCount = 0;
    this.store.save(this.state);
    this.emit({ type: 'snapshot', ...this.snapshot() });
    return this.state.chatId;
  }

  /** The office's project folder (already checked), or null for the sandbox. */
  setFolder(folder: string | null): void {
    this.state.folder = folder;
    if (folder) {
      const rest = (this.state.recent ?? []).filter((f) => f !== folder);
      this.state.recent = [folder, ...rest].slice(0, RECENT_FOLDERS_MAX);
    }
    this.store.save(this.state);
    this.statusChanged();
  }

  /** Projects picked before, then folders of earlier tasks, newest first (the Project panel). */
  recentFolders(): string[] {
    return recentFolders(
      [...(this.state.recent ?? []), ...this.opts.tasks.list().map((t) => t.cwd)],
      this.store.chatsDir,
    );
  }

  // ── Desk tools (MCP at CEO_MCP_PATH) ──

  knowsToken(token: string): boolean {
    return token === this.state.mcpToken;
  }

  /** Runs the tool; on success the chat gets a readable row ("Started job a1b2 → Team (Oliver)"). */
  async callTool(
    _token: string,
    name: string,
    args: Record<string, unknown>,
  ): Promise<OfficeToolResult> {
    const chatId = this.state.chatId;
    const { row, jobId, edits, ...result } = await callDeskTool(this.toolHost(), name, args);
    if (chatId !== this.state.chatId) return result;
    if (row) this.add({ kind: 'tool', name: `mcp__${DESK_MCP_NAME}__${name}`, text: row });
    if (edits) this.add({ kind: 'edits', ...edits });
    // The job's card follows the row that started it.
    if (jobId) this.updateCard(jobId);
    return result;
  }

  private toolHost(): DeskToolHost {
    const { office, tasks } = this.opts;
    return {
      office,
      tasks,
      chatId: () => this.state.chatId,
      folder: () => this.state.folder,
      sandbox: () => this.sandbox(),
      folderOf: (cwd) => this.folderOf(cwd),
      liveJobs: () => this.state.liveJobs,
      reworks: () => this.reworkCount,
      request: () => this.turn?.request ?? '',
      jobStarted: (task, rework, chatId) => {
        // New chat while start_job waited: the job stays with the old chat.
        if (chatId !== this.state.chatId) return;
        if (rework) this.reworkCount++;
        this.state.liveJobs.push(task.id);
        this.store.save(this.state);
      },
    };
  }

  // ── Turns ──

  private pump(): void {
    if (this.turn || !this.state.pending.length || !this.mcpUrl) return;
    const { adapter, office } = this.opts;
    const missing = adapter.choices().unavailable;
    const down = missing
      ? `${missing}.`
      : office.notReady('claude') && office.engineDown('claude', false);
    if (down) {
      this.state.pending = [];
      this.store.save(this.state);
      this.add({ kind: 'error', text: `The CEO cannot answer: ${down}` });
      this.statusChanged();
      return;
    }
    const parts = this.state.pending.splice(0);
    if (parts.some((p) => p.kind === 'user')) this.reworkCount = 0;
    const request = parts
      .filter((p) => p.kind === 'user')
      .map((p) => p.text)
      .join('\n\n');
    const handle = spawnDeskTurn({
      adapter,
      office,
      store: this.store,
      state: this.state,
      mcpUrl: this.mcpUrl,
      parts,
      onLog: (entry) => this.onLog(turn, entry),
    });
    const turn: Turn = {
      chatId: this.state.chatId,
      handle,
      request,
      stopped: false,
      timer: setTimeout(() => handle.kill(), CAT_CEO_TIMEOUT_MS),
    };
    this.turn = turn;
    this.state.turnRunning = true;
    this.store.save(this.state);
    office.residents.setWorking(CAT_CEO_ID, true);
    this.statusChanged();
    void handle.done.then((outcome) => this.finishTurn(turn, outcome));
  }

  private onLog(turn: Turn, entry: TaskLogEntry): void {
    if (turn.stopped || turn.chatId !== this.state.chatId) return;
    logRows(turn, entry, (e) => this.add(e));
  }

  private finishTurn(turn: Turn, outcome: TurnOutcome): void {
    clearTimeout(turn.timer);
    if (this.disposed) return;
    if (this.turn === turn) this.turn = undefined;
    this.opts.office.residents.setWorking(CAT_CEO_ID, false);
    // A New chat during the turn: the old chat's state is archived as it was.
    if (turn.chatId === this.state.chatId) {
      this.state.turnRunning = false;
      if (outcome.sessionStarted) this.state.started = true;
      if (outcome.sessionCostUsd !== undefined) this.state.costUsd = outcome.sessionCostUsd;
      if (!turn.stopped) {
        const text = outcome.ok ? (outcome.text ?? turn.held) : turn.held;
        if (text) this.add({ kind: 'text', text });
        if (!outcome.ok && outcome.budgetHit) {
          this.add({ kind: 'error', text: BUDGET_HIT_TEXT });
        } else if (!outcome.ok) {
          const auth = isAuthError(outcome.error);
          const fix = auth ? ` ${this.opts.office.engineDown('claude', true)}` : '';
          const text = `The CEO could not answer: ${outcome.error}${fix}`;
          this.add({ kind: 'error', text, ...(auth ? { login: true } : {}) });
        }
      }
      this.store.save(this.state);
    }
    this.statusChanged();
    this.pump();
  }

  // ── Jobs ──

  private taskChanged(id: string, now = false): void {
    if (!this.state.liveJobs.includes(id)) return;
    const task = this.opts.tasks.get(id);
    if (!task) {
      this.state.liveJobs = this.state.liveJobs.filter((j) => j !== id);
      this.store.save(this.state);
      return;
    }
    // A team job ends only in a final flow state: an interrupted job that is
    // being cancelled still has status `error` from the restart.
    const ended = task.flow
      ? ['done', 'error', 'cancelled'].includes(task.flow.state)
      : task.status !== 'running';
    if (ended || now) {
      clearTimeout(this.cardTimers.get(id));
      this.cardTimers.delete(id);
      this.updateCard(id);
    } else if (!this.cardTimers.has(id)) {
      this.cardTimers.set(
        id,
        setTimeout(() => {
          this.cardTimers.delete(id);
          this.updateCard(id);
        }, CEO_DESK_CARD_THROTTLE_MS),
      );
    }
    if (!ended) return;
    this.state.liveJobs = this.state.liveJobs.filter((j) => j !== id);
    this.state.pending.push({ kind: 'notice', text: jobNotice(task, this.folderOf(task.cwd)) });
    this.store.save(this.state);
    this.statusChanged();
    this.pump();
  }

  /** First start after the board: its interrupted team tasks get cards with Resume and Cancel. */
  private adoptBoardTasks(): void {
    this.state.boardAdopted = true;
    const ids = this.opts.tasks.adoptInterrupted(this.state.chatId);
    if (!ids.length) return;
    this.add({ kind: 'text', text: ADOPTED_TEXT });
    for (const id of ids) {
      this.state.liveJobs.push(id);
      this.updateCard(id);
    }
  }

  /** Replace the job's card row (or add it) and tell the open chats. */
  private updateCard(id: string): void {
    const task = this.opts.tasks.get(id);
    if (!task) return;
    const job = jobCard(task, this.opts.office, this.folderOf(task.cwd));
    const text = cardLine(job);
    const at = this.rows.findIndex((r) => r.kind === 'job' && r.job.jobId === id);
    if (at < 0) {
      this.add({ kind: 'job', text, job });
      return;
    }
    this.rows[at] = { kind: 'job', text, job, at: this.rows[at].at };
    this.store.writeHistory(this.state.chatId, this.rows);
    this.emit({ type: 'job', text, job });
  }

  // ── Helpers ──

  private sandbox(): string {
    const dir = path.join(this.store.chatDir(this.state.chatId), 'work');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  private folderOf(cwd: string): string | null {
    return cwd.startsWith(this.store.chatsDir) ? null : cwd;
  }

  private status(): CatSessionStatus {
    return {
      busy: !!this.turn,
      wheelHeld: false,
      wheelUnavailable: CEO_NO_WHEEL,
      busyText: `${this.opts.office.ceo.settings.name} is thinking…`,
      queued: this.state.pending.length,
      folder: this.state.folder,
      costUsd: this.state.costUsd,
    };
  }

  private add(entry: CatSessionEntry): void {
    // `at` is the row's id for the dock's unread mark: unique and rising.
    const row = { ...entry, at: Math.max(Date.now(), (this.rows.at(-1)?.at ?? 0) + 1) } as DeskRow;
    this.rows.push(row);
    if (this.rows.length > CEO_DESK_HISTORY_MAX)
      this.rows.splice(0, this.rows.length - CEO_DESK_HISTORY_MAX);
    this.store.writeHistory(this.state.chatId, this.rows);
    this.emit({ type: 'entries', entries: [row] });
  }

  private statusChanged(): void {
    this.emit({ type: 'status', status: this.status() });
  }

  private emit(frame: CatSessionFrame): void {
    this.events.emit('frame', frame);
  }
}
