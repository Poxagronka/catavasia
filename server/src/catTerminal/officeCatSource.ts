/**
 * The cat console for profile cats (the cat office). `catId` is the office
 * agent id of a resident cat (server/src/orchestrator/catResidents.ts).
 *
 * - Chat: the cat's turns across its tasks (CatConsoles).
 * - Send: during a live task, the message waits in the cat's inbox and its
 *   next turn reads it. A cat with no live task gets a new one-cat task in the
 *   folder of its newest task (else the server folder).
 * - Take the wheel: only between turns of a live task (no running or queued
 *   turn), and the wheel takes the same session lock as every turn.
 *
 * The Cat CEO is not a team cat: its chat is a one-off judge run that
 * answers (server/src/catCeo/ceoChat.ts), and it has no wheel.
 *
 * Any other cat id falls through to the task-board source.
 */

import type {
  CatSessionEntry,
  CatSessionFrame,
  CatSessionStatus,
} from '../../../core/src/catSession.js';
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

export class OfficeCatSource implements CatSessionSource {
  private readonly board: TaskBoardCatSource;
  /** Release functions of held wheels, by cat id (profile id). */
  private readonly wheels = new Map<string, () => void>();
  /** The office agent id of the Cat CEO last seen (its character goes when it is turned off). */
  private ceoAgent: string | undefined;

  constructor(
    private readonly office: Orchestrator,
    private readonly tasks: TaskManager,
  ) {
    this.board = new TaskBoardCatSource(tasks);
  }

  snapshot(agentId: string): CatSessionSnapshot | undefined {
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
    const cat = this.catOf(agentId);
    if (!cat) return this.board.send(agentId, text);
    if (cat === CAT_CEO_ID) {
      const busy = this.office.ceo.chat.send(text);
      if (busy) throw new CatSessionError(409, busy);
      return;
    }
    if (this.wheels.has(cat)) throw new CatSessionError(409, 'You hold the wheel of this cat');
    if (this.office.sendUserMessage(cat, text)) return;
    // Only team cats take tasks: never answer with the board's "Unknown target".
    if (!this.office.resolveTarget(cat)) {
      throw new CatSessionError(400, `${cat} is not a team cat, so it takes no tasks`);
    }
    const cwd = this.office.lastCwdOf(cat) ?? this.tasks.defaultCwd;
    try {
      await this.tasks.create(text, cwd, cat);
    } catch (err) {
      if (err instanceof TaskInputError) throw new CatSessionError(400, err.message);
      throw err;
    }
  }

  async beginWheel(agentId: string): Promise<WheelSession> {
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

  private catOf(agentId: string): string | undefined {
    const cat = /^\d+$/.test(agentId) ? this.office.residents.catOf(Number(agentId)) : undefined;
    if (cat === CAT_CEO_ID) this.ceoAgent = agentId;
    // An open chat of a Cat CEO that was turned off still reaches it (it says it is off).
    return cat ?? (agentId === this.ceoAgent ? CAT_CEO_ID : undefined);
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
      return {
        busy: this.office.ceo.chat.busy,
        wheelHeld: false,
        wheelUnavailable: CEO_NO_WHEEL,
        busyText: 'The Cat CEO is thinking…',
      };
    }
    const session = this.liveSession(cat);
    return {
      busy: this.office.hasPendingTurn(cat),
      wheelHeld: !!session && sessionLockHolder(session.sessionId) === 'wheel',
      wheelUnavailable: session ? undefined : NO_LIVE_SESSION,
    };
  }
}
