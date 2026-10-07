/**
 * The CEO desk (docs/catavasia/ROADMAP.md, "CEO desk replaces the task board"):
 * one live CEO conversation per office. The chat is one live Claude Code
 * session (claudeSession.ts), like the terminal: in the project folder (or
 * cat-ceo/chats/<chatId>/ without one; a new folder starts a new session).
 * A message goes into the session at once, also while Claude works. The CEO
 * answers itself or starts jobs (team tasks) with its desk tools; when a job
 * ends, a job notice with the full result goes into the session too. Parts
 * wait in `pending` only while no session can take them (no server URL yet,
 * a process closing, or a stale process still busy).
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
import { CAT_CEO_DIR, CAT_CEO_ID } from '../constants.js';
import type {
  PermissionAnswer,
  SessionEnd,
  SessionEngine,
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
  currentPersona,
  deskMessage,
  failureRow,
  newDeskStream,
  openDeskSession,
  queuedDraft,
  sessionSettings,
  takeTurnParts,
  type Turn,
  turnCwd,
} from './deskTurn.js';
import { RECENT_FOLDERS_MAX, recentFolders } from './workFolder.js';

export const CEO_NO_WHEEL = 'The CEO has no terminal session: talk to it in the chat';
export const RESTARTED_TEXT = 'The server restarted during this turn; send again.';

export interface CeoDeskOptions {
  stateDir: string;
  office: Orchestrator;
  tasks: TaskManager;
  /** The Claude Code adapter: the CEO always runs on Claude, in a live session. */
  adapter: SessionEngine;
}

export class CeoDesk implements OfficeToolHandler {
  private readonly events = new EventEmitter<{ frame: [CatSessionFrame] }>();
  private readonly store: DeskStore;
  private state: DeskState;
  private log: DeskLog;
  /** The chat's live session; none until the first message (and after a teardown). */
  private turn: Turn | undefined;
  /** A session that is closing: the next one opens only after it is gone. */
  private closing: Promise<void> | undefined;
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
  /** The dock's model or mode changed: the live session takes it, or opens anew. */
  private readonly onSettings = () => {
    const turn = this.turn;
    if (turn && !turn.session.update(sessionSettings(this.opts.office))) turn.stale = true;
    this.pump();
  };

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
    opts.office.ceo.events.on('change', this.onSettings);
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
    this.opts.office.ceo.events.off('change', this.onSettings);
    this.jobs.clear();
    // turnRunning stays true on disk: the next start tells the user.
    this.teardown();
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

  /** The folder the chat's next turn runs in (the `@` menu lists its files). */
  get cwd(): string {
    return turnCwd(this.state, this.store.chatDir(this.state.chatId));
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
    // A slash command ("/review", not a path like "/Users/me") and a message
    // with files still queue: the tool takes text answers only.
    const asked = this.opts.office.approvals
      .list()
      .find((a) => a.catId === CAT_CEO_ID && a.questions);
    const command = /^\/[\w-]+(\s|$)/.test(text);
    if (asked?.questions && !files?.attachments.length && !command) {
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
   * Interrupt the running turn (Esc in the terminal: the session stays), drop
   * queued notices; user messages that did not start go back to the draft,
   * their files too (the stored files stay where they are).
   */
  async stop(): Promise<CeoStopResponse> {
    const held = this.state.pending;
    const turn = this.turn?.busy ? this.turn : undefined;
    this.halt();
    if (!turn) return queuedDraft(held);
    turn.stopped = true;
    // New messages wait in `pending` until the interrupt settles: a teardown
    // below must not take them with it.
    turn.stopping = true;
    let waiting: DeskState['pending'] = [];
    try {
      const ids = await turn.session.interrupt();
      waiting = ids.flatMap((id) => turn.sent.get(id) ?? []);
      // The CLI would still run them after the interrupt: a new process
      // (resumed) drops them, and they go back to the draft.
      if (waiting.length && this.turn === turn) this.teardown();
    } catch (err) {
      console.error(`[catavasia] CEO desk: interrupt failed: ${String(err)}`);
      if (this.turn === turn) this.teardown();
    } finally {
      turn.stopping = false;
      this.pump();
    }
    // A chat switch during the wait: these parts belong to the old chat.
    if (turn.chatId !== this.state.chatId) return { draft: '' };
    return queuedDraft([...waiting, ...held]);
  }

  /** Stop one background task of the session (its own Stop in the dock). False: no session. */
  async stopTask(taskId: string): Promise<boolean> {
    if (!this.turn) return false;
    await this.turn.session.stopTask(taskId);
    return true;
  }

  /** Drop what waits and the suggestion; say "Stopped." when a turn ran or parts waited. */
  private halt(): void {
    const had = !!this.turn?.busy || this.state.pending.length > 0;
    this.state.pending = [];
    this.suggestion = undefined;
    this.store.save(this.state);
    if (had) this.log.add({ kind: 'text', text: 'Stopped.' });
    this.statusChanged();
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
    this.halt();
    // The session belongs to this chat: `next` opens its own (resumed) one.
    this.teardown();
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
    // Claude keys sessions by folder: the next message opens a session there.
    if (this.turn && folder !== this.state.folder) this.turn.stale = true;
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

  // ── The live session ──

  /** Send what waits into the live session; open one first when there is none. */
  private pump(): void {
    if (!this.state.pending.length || !this.mcpUrl || this.disposed || this.closing) return;
    if (this.turn?.stopping) return;
    const { adapter, office } = this.opts;
    let turn = this.turn;
    // A changed persona (name, Role & conduct) also needs a new process.
    if (turn && !turn.busy && turn.persona !== currentPersona(office)) turn.stale = true;
    if (turn?.stale) {
      // A busy session ends its turn first: its idle pumps again.
      if (!turn.busy) this.teardown();
      return;
    }
    if (!turn) {
      const down = claudeDown(adapter, office);
      if (down) {
        this.state.pending = [];
        this.store.save(this.state);
        this.log.add({ kind: 'error', text: `The CEO cannot answer: ${down}` });
        this.statusChanged();
        return;
      }
      turn = this.openTurn();
    }
    this.suggestion = undefined;
    while (this.state.pending.length) {
      const parts = takeTurnParts(this.state.pending);
      const users = parts.filter((p) => p.kind === 'user').map((p) => p.text);
      if (users.length) this.reworkCount = 0;
      turn.request = [turn.request, ...users].filter(Boolean).join('\n\n');
      const id = turn.session.send(
        deskMessage(this.state.folder, parts),
        parts.flatMap((p) => p.images ?? []),
      );
      turn.sent.set(id, parts);
    }
    this.store.save(this.state);
    this.statusChanged();
  }

  private openTurn(): Turn {
    const { adapter, office } = this.opts;
    const stream = newDeskStream(this.store, this.state, {
      add: (entry) => this.log.add(entry),
      update: (row) => this.log.update(row),
      statusChanged: () => this.statusChanged(),
      emit: (frame) => this.emit(frame),
    });
    // A resumed session goes on with the chat's to-do list (TaskUpdate names its items).
    for (const row of this.log.rows) if (row.kind === 'tool' && row.todos) stream.todos = row.todos;
    const persona = currentPersona(office);
    const live = () => this.turn === turn && !this.disposed;
    const session = openDeskSession({
      adapter,
      office,
      store: this.store,
      state: this.state,
      mcpUrl: this.mcpUrl,
      persona,
      onLine: (line) => {
        if (live()) stream.line(line, turn.stopped);
      },
      onResult: (outcome) => {
        if (live()) this.turnResult(turn, outcome);
      },
      onBusy: (busy) => {
        if (live()) this.turnBusy(turn, busy);
      },
      onSuggestion: (text) => {
        if (!live() || turn.busy || this.state.pending.length) return;
        this.suggestion = text;
        this.statusChanged();
      },
    });
    const turn: Turn = {
      session,
      chatId: this.state.chatId,
      stopping: false,
      request: '',
      stream,
      busy: false,
      stopped: false,
      stale: false,
      persona,
      sent: new Map(),
    };
    this.turn = turn;
    void session.ended.then((end) => {
      if (live()) this.sessionEnded(turn, end);
    });
    return turn;
  }

  /** One turn ended (its result): the final text, or why it failed. */
  private turnResult(turn: Turn, outcome: TurnOutcome): void {
    if (outcome.sessionStarted) this.state.started = true;
    if (outcome.sessionCostUsd !== undefined) this.state.costUsd = outcome.sessionCostUsd;
    if (outcome.ok) this.chats.nameFromClaude();
    // An interrupted turn ends with an error result: Stop already said so.
    if (!turn.stopped) {
      const text = outcome.ok ? (outcome.text ?? turn.stream.held) : turn.stream.held;
      if (text) this.log.add({ kind: 'text', text });
      if (!outcome.ok) this.log.add(failureRow(outcome.error, this.opts.office));
    }
    turn.stream.held = undefined;
    turn.stopped = false;
    turn.request = '';
    this.store.save(this.state);
    this.statusChanged();
  }

  private turnBusy(turn: Turn, busy: boolean): void {
    turn.busy = busy;
    if (!busy) {
      // Idle: every sent message was answered.
      turn.stopped = false;
      turn.sent.clear();
    }
    this.state.turnRunning = busy;
    this.store.save(this.state);
    this.opts.office.residents.setWorking(CAT_CEO_ID, busy);
    this.statusChanged();
    if (!busy) this.pump();
  }

  /** The process ended on its own (crash, CLI gone): the next message resumes in a new one. */
  private sessionEnded(turn: Turn, { error, sessionStarted }: SessionEnd): void {
    this.turn = undefined;
    // The next process resumes the session; one that never started gets a new id.
    if (sessionStarted) this.state.started = true;
    else if (!this.state.started) this.state.sessionId = freshDesk().sessionId;
    if (turn.busy) {
      this.state.turnRunning = false;
      this.opts.office.residents.setWorking(CAT_CEO_ID, false);
      if (!turn.stopped) {
        if (turn.stream.held) this.log.add({ kind: 'text', text: turn.stream.held });
        this.log.add(failureRow(error ?? 'Claude Code ended the session', this.opts.office));
      }
    }
    this.store.save(this.state);
    this.statusChanged();
    this.pump();
  }

  /**
   * End the live session: close its input and its process. The next message
   * opens a new one (resumed), only after this one is gone.
   */
  private teardown(): void {
    const turn = this.turn;
    if (!turn) return;
    this.turn = undefined;
    if (turn.busy) {
      this.opts.office.residents.setWorking(CAT_CEO_ID, false);
      // On dispose turnRunning stays true on disk: the next start tells the user.
      if (!this.disposed) this.state.turnRunning = false;
    }
    const state = this.state;
    void turn.session.close();
    const closing = turn.session.ended
      .then(({ sessionStarted }) => {
        // A message of this chat made the session: the next process resumes it.
        if (!sessionStarted || state !== this.state || state.started || this.disposed) return;
        state.started = true;
        this.store.save(state);
      })
      .finally(() => {
        if (this.closing === closing) this.closing = undefined;
        this.pump();
      });
    this.closing = closing;
    this.statusChanged();
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
      busy: !!this.turn?.busy,
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
      ...(this.turn?.stream.tasks.length ? { tasks: this.turn.stream.tasks } : {}),
      ...(this.turn?.stream.notice ? { notice: this.turn.stream.notice } : {}),
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
