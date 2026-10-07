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
import { CAT_CEO_DIR, CAT_CEO_ID, CAT_CEO_TIMEOUT_MS } from '../constants.js';
import type {
  EngineAdapter,
  PermissionAnswer,
  TurnHandle,
  TurnOutcome,
} from '../orchestrator/engineAdapter.js';
import type { OfficeToolHandler, OfficeToolResult } from '../orchestrator/officeMcp.js';
import type { Orchestrator } from '../orchestrator/orchestrator.js';
import type { TaskManager } from '../taskBoard/taskManager.js';
import { officeLimits } from '../usageLimits.js';
import { saveAttachments, type SavedAttachments } from './attachments.js';
import { ChatHistory, messageTitle } from './chatHistory.js';
import { DeskJobs } from './deskJobs.js';
import { DeskLog } from './deskLog.js';
import { type DeskState, DeskStore, freshDesk } from './deskStore.js';
import { callDeskTool, DESK_MCP_NAME, type DeskToolHost } from './deskTools.js';
import {
  claudeDown,
  failureRow,
  newDeskStream,
  queuedDraft,
  spawnDeskTurn,
  takeTurnParts,
  type Turn,
} from './deskTurn.js';
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
  private log: DeskLog;
  private turn: Turn | undefined;
  /** The ended turn whose stream still waits for Claude's suggestion. */
  private lingering: TurnHandle | undefined;
  /** Claude's guess of the user's next message; a new message or turn drops it. */
  private suggestion: string | undefined;
  private reworkCount = 0;
  private mcpUrl = '';
  private disposed = false;
  private readonly jobs: DeskJobs;
  /** The chat title menu: list, open, rename and delete chats. */
  readonly chats: ChatHistory;
  private readonly onTaskStatus = (id: string) => this.jobs.taskChanged(id);
  private readonly onApprovals = () => this.statusChanged();
  private readonly onLimits = () => this.statusChanged();

  constructor(private readonly opts: CeoDeskOptions) {
    this.events.setMaxListeners(0);
    this.store = new DeskStore(path.join(opts.stateDir, CAT_CEO_DIR));
    this.state = this.store.load(Date.now());
    this.log = new DeskLog(this.store, this.state.chatId, (f) => this.emit(f));
    this.chats = new ChatHistory(this.store, {
      state: () => this.state,
      rows: () => this.log.rows,
      switchTo: (next, note) => this.switchTo(next, note),
      newChat: () => this.newChat(),
      changed: () => (this.store.save(this.state), this.statusChanged()),
    });
    this.jobs = new DeskJobs({
      tasks: opts.tasks,
      office: opts.office,
      state: () => this.state,
      save: () => this.store.save(this.state),
      add: (entry) => this.log.add(entry),
      replaceCard: (text, job) => this.log.replaceCard(text, job),
      statusChanged: () => this.statusChanged(),
      pump: () => this.pump(),
      folderOf: (cwd) => this.folderOf(cwd),
    });
    if (this.state.turnRunning) {
      this.state.turnRunning = false;
      // The cut turn may have created the session: a first turn starts a new one.
      if (!this.state.started) this.state.sessionId = freshDesk().sessionId;
      this.log.add({ kind: 'error', text: RESTARTED_TEXT });
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
    if (this.turn) clearTimeout(this.turn.timer);
    this.killTurn();
    this.lingering?.kill();
  }

  // ── Chat (officeCatSource.ts and ceoRoutes.ts) ──

  snapshot(): { title: string; entries: CatSessionEntry[]; status: CatSessionStatus } {
    return {
      title: this.opts.office.ceo.settings.name,
      entries: this.log.rows.slice(),
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
    this.suggestion = undefined;
    const attachments = files?.attachments.length ? { attachments: files.attachments } : {};
    this.log.add({ kind: 'user', text, ...attachments });
    // A text typed while the CEO's question card waits is the answer to it
    // (the card closes; the waiting turn gets the text as every answer).
    const asked = this.opts.office.approvals
      .list()
      .find((a) => a.catId === CAT_CEO_ID && a.questions);
    if (asked?.questions && !files?.attachments.length) {
      const answers = Object.fromEntries(asked.questions.map((q) => [q.question, text]));
      this.opts.office.approvals.answer(asked.id, { answers });
      return this.state.pending.length;
    }
    this.state.title ||= messageTitle(text, files?.attachments);
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
    const queued = queuedDraft(this.state.pending);
    const had = !!this.turn || this.state.pending.length > 0;
    this.state.pending = [];
    this.suggestion = undefined;
    this.store.save(this.state);
    this.killTurn();
    if (had) this.log.add({ kind: 'text', text: 'Stopped.' });
    this.statusChanged();
    return queued;
  }

  /** The user's answer to an approval card. False: the card is gone (answered or timed out). */
  answerApproval(id: string, answer: PermissionAnswer): boolean {
    return this.opts.office.approvals.answer(id, answer);
  }

  /** Archive this chat and start a new one. */
  newChat(): string {
    // The board's tasks were adopted once; a New chat never adopts them again.
    // The project is the office's: it stays for the new chat.
    const { folder, recent } = this.state;
    this.switchTo({ ...freshDesk(), boardAdopted: true, folder, ...(recent ? { recent } : {}) });
    return this.state.chatId;
  }

  /**
   * Stop the turn, archive this chat and make `next` the live chat (chatHistory.ts).
   * Live jobs go on; their notices are dropped, their cards show the newest state.
   */
  private switchTo(next: DeskState, note?: string): void {
    this.stop();
    // The killed turn ends later: it must not touch `next`, even when `next` is its chat.
    if (this.turn) this.turn.chatId = '';
    this.jobs.clear();
    this.chats.archive(this.state, this.log.rows);
    this.state = next;
    this.log = new DeskLog(this.store, next.chatId, (f) => this.emit(f));
    this.reworkCount = 0;
    for (const row of this.log.rows) if (row.kind === 'job') this.jobs.updateCard(row.job.jobId);
    if (note) this.log.add({ kind: 'note', text: note });
    this.store.save(this.state);
    this.emit({ type: 'snapshot', ...this.snapshot() });
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
    if (row) this.log.add({ kind: 'tool', name: `mcp__${DESK_MCP_NAME}__${name}`, text: row });
    if (edits) this.log.add({ kind: 'edits', ...edits });
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
    const down = claudeDown(adapter, office);
    if (down) {
      this.state.pending = [];
      this.store.save(this.state);
      this.log.add({ kind: 'error', text: `The CEO cannot answer: ${down}` });
      this.statusChanged();
      return;
    }
    this.lingering?.kill();
    this.suggestion = undefined;
    const parts = takeTurnParts(this.state.pending);
    if (parts.some((p) => p.kind === 'user')) this.reworkCount = 0;
    const request = parts
      .filter((p) => p.kind === 'user')
      .map((p) => p.text)
      .join('\n\n');
    const stream = newDeskStream(this.store, this.state, {
      add: (entry) => this.log.add(entry),
      update: (row) => this.log.update(row),
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
      onSuggestion: (text) => {
        if (turn.stopped || turn.chatId !== this.state.chatId || this.turn) return;
        if (this.state.pending.length) return;
        this.suggestion = text;
        this.statusChanged();
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
    this.lingering = turn.handle;
    this.opts.office.residents.setWorking(CAT_CEO_ID, false);
    // A New chat during the turn: the old chat's state is archived as it was.
    if (turn.chatId === this.state.chatId) {
      this.state.turnRunning = false;
      if (outcome.sessionStarted) this.state.started = true;
      if (outcome.sessionCostUsd !== undefined) this.state.costUsd = outcome.sessionCostUsd;
      if (outcome.ok) this.chats.nameFromClaude();
      if (!turn.stopped) {
        const text = outcome.ok ? (outcome.text ?? turn.stream.held) : turn.stream.held;
        if (text) this.log.add({ kind: 'text', text });
        if (!outcome.ok) this.log.add(failureRow(outcome.error, this.opts.office));
      }
      this.store.save(this.state);
    }
    this.statusChanged();
    this.pump();
  }

  // ── Helpers ──

  private killTurn(): void {
    if (!this.turn) return;
    this.turn.stopped = true;
    this.turn.handle.kill();
  }

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
      chat: { id: this.state.chatId, title: this.state.title ?? '' },
      costUsd: this.state.costUsd,
      approvals: this.opts.office.approvals.list(),
      ...(this.suggestion ? { suggestion: this.suggestion } : {}),
      ...(this.state.context ? { context: this.state.context } : {}),
      limits: officeLimits.get(),
    };
  }

  private statusChanged(): void {
    this.emit({ type: 'status', status: this.status() });
  }

  private emit(frame: CatSessionFrame): void {
    this.events.emit('frame', frame);
  }
}
