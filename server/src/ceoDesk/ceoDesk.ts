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
import type { CeoAttachmentUpload, CeoStopResponse, JobCard } from '../../../core/src/ceoDesk.js';
import { CAT_CEO_DIR, CAT_CEO_ID, CAT_CEO_TIMEOUT_MS, CEO_DESK_HISTORY_MAX } from '../constants.js';
import type {
  EngineAdapter,
  PermissionAnswer,
  TurnOutcome,
} from '../orchestrator/engineAdapter.js';
import { isAuthError } from '../orchestrator/engineStatus.js';
import type { OfficeToolHandler, OfficeToolResult } from '../orchestrator/officeMcp.js';
import type { Orchestrator } from '../orchestrator/orchestrator.js';
import type { TaskManager } from '../taskBoard/taskManager.js';
import { officeLimits } from '../usageLimits.js';
import { saveAttachments, type SavedAttachments } from './attachments.js';
import { DeskJobs } from './deskJobs.js';
import { type DeskRow, type DeskState, DeskStore, freshDesk } from './deskStore.js';
import { callDeskTool, DESK_MCP_NAME, type DeskToolHost } from './deskTools.js';
import { newDeskStream, spawnDeskTurn, takeTurnParts, type Turn } from './deskTurn.js';
import { RECENT_FOLDERS_MAX, recentFolders } from './workFolder.js';

export const CEO_NO_WHEEL = 'The CEO has no terminal session: talk to it in the chat';
export const RESTARTED_TEXT = 'The server restarted during this turn; send again.';

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
  private readonly jobs: DeskJobs;
  private readonly onTaskStatus = (id: string) => this.jobs.taskChanged(id);
  private readonly onApprovals = () => this.statusChanged();
  private readonly onLimits = () => this.statusChanged();

  constructor(private readonly opts: CeoDeskOptions) {
    this.events.setMaxListeners(0);
    this.store = new DeskStore(path.join(opts.stateDir, CAT_CEO_DIR));
    this.state = this.store.load(Date.now());
    this.rows = this.store.readHistory(this.state.chatId);
    this.jobs = new DeskJobs({
      tasks: opts.tasks,
      office: opts.office,
      state: () => this.state,
      save: () => this.store.save(this.state),
      add: (entry) => this.add(entry),
      replaceCard: (text, job) => this.replaceCard(text, job),
      statusChanged: () => this.statusChanged(),
      pump: () => this.pump(),
      folderOf: (cwd) => this.folderOf(cwd),
    });
    if (this.state.turnRunning) {
      this.state.turnRunning = false;
      // The cut turn may have created the session: a first turn starts a new one.
      if (!this.state.started) this.state.sessionId = freshDesk().sessionId;
      this.add({ kind: 'error', text: RESTARTED_TEXT });
    }
    // Jobs that ended while the server was down get their notice now.
    for (const id of [...this.state.liveJobs]) this.jobs.taskChanged(id, true);
    if (!this.state.boardAdopted) this.jobs.adoptBoardTasks();
    this.store.save(this.state);
    opts.tasks.events.on('status', this.onTaskStatus);
    opts.office.approvals.events.on('change', this.onApprovals);
    officeLimits.events.on('change', this.onLimits);
  }

  /** The server listens: the CEO reaches its desk tools here, and queued notices can run. */
  setServerUrl(baseUrl: string, mcpPath: string): void {
    this.mcpUrl = `${baseUrl}${mcpPath}`;
    this.pump();
  }

  dispose(): void {
    this.disposed = true;
    this.opts.tasks.events.off('status', this.onTaskStatus);
    this.opts.office.approvals.events.off('change', this.onApprovals);
    officeLimits.events.off('change', this.onLimits);
    this.jobs.clear();
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

  /** The user's answer to an approval card. False: the card is gone (answered or timed out). */
  answerApproval(id: string, answer: PermissionAnswer): boolean {
    return this.opts.office.approvals.answer(id, answer);
  }

  /** Archive this chat and start a new one. Live jobs go on; their notices are dropped. */
  newChat(): string {
    this.stop();
    this.jobs.clear();
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

  /** Runs the tool; on success the chat gets a readable row ("Gave the job to Oliver's team"). */
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
    if (jobId) this.jobs.updateCard(jobId);
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
    const parts = takeTurnParts(this.state.pending);
    if (parts.some((p) => p.kind === 'user')) this.reworkCount = 0;
    const request = parts
      .filter((p) => p.kind === 'user')
      .map((p) => p.text)
      .join('\n\n');
    const stream = newDeskStream(this.store, this.state, {
      add: (entry) => this.add(entry),
      update: (row) => this.update(row),
      statusChanged: () => this.statusChanged(),
      emit: (frame) => this.emit(frame),
    });
    const handle = spawnDeskTurn({
      adapter,
      office,
      store: this.store,
      state: this.state,
      mcpUrl: this.mcpUrl,
      parts,
      onLine: (line) => {
        if (!turn.stopped && turn.chatId === this.state.chatId) stream.line(line);
      },
    });
    const turn: Turn = {
      chatId: this.state.chatId,
      handle,
      request,
      stream,
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
        const text = outcome.ok ? (outcome.text ?? turn.stream.held) : turn.stream.held;
        if (text) this.add({ kind: 'text', text });
        if (!outcome.ok) {
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
      approvals: this.opts.office.approvals.list(),
      ...(this.state.context ? { context: this.state.context } : {}),
      limits: officeLimits.get(),
    };
  }

  private add(entry: CatSessionEntry): DeskRow {
    // `at` is the row's id for the dock's unread mark: unique and rising.
    const row = { ...entry, at: Math.max(Date.now(), (this.rows.at(-1)?.at ?? 0) + 1) } as DeskRow;
    this.rows.push(row);
    if (this.rows.length > CEO_DESK_HISTORY_MAX)
      this.rows.splice(0, this.rows.length - CEO_DESK_HISTORY_MAX);
    this.store.writeHistory(this.state.chatId, this.rows);
    this.emit({ type: 'entries', entries: [row] });
    return row;
  }

  /** Replace the job's card row; false: this chat has none. */
  private replaceCard(text: string, job: JobCard): boolean {
    const at = this.rows.findIndex((r) => r.kind === 'job' && r.job.jobId === job.jobId);
    if (at < 0) return false;
    this.rows[at] = { kind: 'job', text, job, at: this.rows[at].at };
    this.store.writeHistory(this.state.chatId, this.rows);
    this.emit({ type: 'job', text, job });
    return true;
  }

  /** A row changed in place (a tool's result came). */
  private update(row: DeskRow): void {
    const at = this.rows.findIndex((r) => r.at === row.at);
    if (at < 0) return;
    this.rows[at] = row;
    this.store.writeHistory(this.state.chatId, this.rows);
    this.emit({ type: 'update', entry: row });
  }

  private statusChanged(): void {
    this.emit({ type: 'status', status: this.status() });
  }

  private emit(frame: CatSessionFrame): void {
    this.events.emit('frame', frame);
  }
}
