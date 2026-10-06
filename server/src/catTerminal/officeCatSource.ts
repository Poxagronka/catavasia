/**
 * The cat console for profile cats (the cat office). `catId` is the office
 * agent id of a resident cat (server/src/orchestrator/catResidents.ts).
 *
 * - Chat: the cat's turns across its tasks (CatConsoles).
 * - Send: during a live task, the message waits in the cat's inbox and its
 *   next turn reads it. A cat with no live task gets a new one-cat task in the
 *   folder of its newest task; with no such folder, the CEO gives it work.
 * - Take the wheel: only between turns of a live task (no running or queued
 *   turn), and the wheel takes the same session lock as every turn.
 *
 * The Cat CEO is not a team cat and has no wheel. The literal id `cat-ceo`
 * is the CEO desk (server/src/ceoDesk/); reading it needs the server token.
 * The webview opens the desk dock for the CEO character. Its agent id shows
 * the review and tidy log, and a message there points to the desk chat.
 *
 * Any other cat id falls through to the task-board source.
 */

import type {
  CatSessionEntry,
  CatSessionFrame,
  CatSessionStatus,
} from '../../../core/src/catSession.js';
import type { CeoDesk } from '../ceoDesk/ceoDesk.js';
import { CAT_CEO_ID } from '../constants.js';
import type { Orchestrator } from '../orchestrator/orchestrator.js';
import { TaskInputError, type TaskManager } from '../taskBoard/taskManager.js';
import {
  CatSessionError,
  type CatSessionSnapshot,
  type CatSessionSource,
  TaskBoardCatSource,
  type WheelSession,
} from './catSessionSource.js';
import { acquireSessionLock, sessionLockHolder } from './sessionLocks.js';

const NO_LIVE_SESSION = 'The wheel needs a live task session: give the cat a task first';
const CEO_NO_WHEEL = 'The Cat CEO has no terminal session: talk to it in the chat';
const NO_FOLDER = 'Ask the CEO in the chat to give this cat work';
const CEO_USE_DESK = 'Talk to the CEO in the CEO chat on the right';

export class OfficeCatSource implements CatSessionSource {
  private readonly board: TaskBoardCatSource;
  /** Release functions of held wheels, by cat id (profile id). */
  private readonly wheels = new Map<string, () => void>();

  constructor(
    private readonly office: Orchestrator,
    private readonly tasks: TaskManager,
    private readonly desk?: CeoDesk,
  ) {
    this.board = new TaskBoardCatSource(tasks);
  }

  snapshot(agentId: string): CatSessionSnapshot | undefined {
    if (this.isDesk(agentId)) return this.desk!.snapshot();
    const cat = this.catOf(agentId);
    if (!cat) return this.board.snapshot(agentId);
    const profile = this.office.cats.get(cat);
    return {
      title:
        cat === CAT_CEO_ID
          ? this.office.ceo.settings.name
          : profile
            ? `${profile.name}${profile.role ? `: ${profile.role}` : ''}`
            : cat,
      entries: this.office.consoles.entries(cat),
      status: this.status(cat),
    };
  }

  subscribe(agentId: string, listener: (frame: CatSessionFrame) => void): () => void {
    if (this.isDesk(agentId)) return this.desk!.subscribe(listener);
    const cat = this.catOf(agentId);
    if (!cat) return this.board.subscribe(agentId, listener);
    const { events } = this.office.consoles;
    const onEntries = (id: string, entries: CatSessionEntry[]) => {
      if (id === cat) listener({ type: 'entries', entries });
    };
    const onStatus = () => listener({ type: 'status', status: this.status(cat) });
    events.on('entries', onEntries);
    events.on('status', onStatus);
    return () => {
      events.off('entries', onEntries);
      events.off('status', onStatus);
    };
  }

  async send(agentId: string, text: string): Promise<void> {
    if (this.isDesk(agentId)) {
      this.desk!.send(text);
      return;
    }
    const cat = this.catOf(agentId);
    if (!cat) return this.board.send(agentId, text);
    if (cat === CAT_CEO_ID) throw new CatSessionError(400, CEO_USE_DESK);
    if (this.wheels.has(cat)) throw new CatSessionError(409, 'You hold the wheel of this cat');
    if (this.office.sendUserMessage(cat, text)) return;
    // Only team cats take tasks: never answer with the board's "Unknown target".
    if (!this.office.resolveTarget(cat)) {
      throw new CatSessionError(400, `${cat} is not a team cat, so it takes no tasks`);
    }
    const cwd = this.office.lastCwdOf(cat);
    if (!cwd) throw new CatSessionError(400, NO_FOLDER);
    try {
      await this.tasks.create(text, cwd, cat);
    } catch (err) {
      if (err instanceof TaskInputError) throw new CatSessionError(400, err.message);
      throw err;
    }
  }

  async beginWheel(agentId: string): Promise<WheelSession> {
    if (this.isDesk(agentId)) throw new CatSessionError(400, CEO_NO_WHEEL);
    const cat = this.catOf(agentId);
    if (!cat) return this.board.beginWheel(agentId);
    if (cat === CAT_CEO_ID) throw new CatSessionError(400, CEO_NO_WHEEL);
    if (this.office.hasPendingTurn(cat) || this.wheels.has(cat)) {
      throw new CatSessionError(409, 'The cat is busy with its session');
    }
    const member = this.liveSession(cat);
    if (!member) throw new CatSessionError(400, NO_LIVE_SESSION);
    const release = acquireSessionLock(member.sessionId, 'wheel');
    if (!release) throw new CatSessionError(409, 'The session is in use');
    this.wheels.set(cat, release);
    this.office.consoles.statusChanged();
    // Claude cats keep the route's default (the provider's launch command).
    const profile = this.office.cats.get(cat);
    // The raw adapter, not adapterFor(): a logged-out Codex cat still resumes with codex.
    const adapter =
      profile?.engine !== 'claude' &&
      profile &&
      this.office.opts.adapters.find((a) => a.engine === profile.engine);
    return {
      ...member,
      ...(adapter ? { launch: adapter.interactiveResumeCommand(member.sessionId) } : {}),
    };
  }

  async endWheel(agentId: string): Promise<void> {
    const cat = this.catOf(agentId);
    if (!cat) return this.board.endWheel(agentId);
    this.wheels.get(cat)?.();
    this.wheels.delete(cat);
    this.office.consoles.statusChanged();
  }

  needsToken(agentId: string): boolean {
    return this.isDesk(agentId);
  }

  /** The literal `cat-ceo` id: the CEO desk chat. */
  private isDesk(agentId: string): boolean {
    return agentId === CAT_CEO_ID && !!this.desk;
  }

  private catOf(agentId: string): string | undefined {
    return /^\d+$/.test(agentId) ? this.office.residents.catOf(Number(agentId)) : undefined;
  }

  /** The live task session of a cat that the wheel can resume. */
  private liveSession(cat: string): { sessionId: string; cwd: string } | undefined {
    const member = this.office.liveMember(cat)?.member;
    return member?.started && member.cwd && member.sessionId
      ? { sessionId: member.sessionId, cwd: member.cwd }
      : undefined;
  }

  private status(cat: string): CatSessionStatus {
    if (cat === CAT_CEO_ID) {
      return { busy: false, wheelHeld: false, wheelUnavailable: CEO_NO_WHEEL };
    }
    const session = this.liveSession(cat);
    return {
      busy: this.office.hasPendingTurn(cat),
      wheelHeld: !!session && sessionLockHolder(session.sessionId) === 'wheel',
      wheelUnavailable: session ? undefined : NO_LIVE_SESSION,
    };
  }
}
