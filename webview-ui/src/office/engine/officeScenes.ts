/**
 * Office scenes: real agent work shown in the office, driven by the
 * orchestrator events (see src/orchestratorEvents.ts). Distinct from the idle
 * social chat in catSocial.ts.
 *
 * Work talk (catMessage): the sender walks up to the receiver and says its
 * line in a text bubble; a reply from the receiver shows over the receiver.
 * Then the sender walks back to its desk. A receiver working at its desk
 * stays seated; an idle receiver stops and turns to the sender. Talks queue
 * in arrival order: a cat is in one talk at a time.
 *
 * Briefing meeting (flowStateChanged 'briefing'): the boss and every
 * participant walk to the meeting room (meetingRoom.ts). Participants sit on
 * its chairs; the chairs are reserved as seats (a seat outranks a napping
 * cat, see spotReservations.ts). The boss stands at the head and speaks.
 * When the task leaves 'briefing', everyone walks back to its desk. Talks
 * between two cats in the meeting play in place.
 *
 * OfficeState calls update() once per frame before the social layer, and
 * reads bubbles() for the overlay and meetingSeats() for the reservations.
 */
import {
  SCENE_APPROACH_TIMEOUT_SEC,
  SCENE_BRIEFING_TEXT,
  SCENE_REPLY_WAIT_SEC,
  SCENE_SPEAK_SEC,
} from '../../constants.js';
import type {
  CatMessageEvent,
  FlowStateChangedEvent,
  OrchestratorEvent,
} from '../../orchestratorEvents.js';
import type { Character, Seat } from '../types.js';
import { CharacterState } from '../types.js';
import type { MeetingPlan } from './meetingRoom.js';
import { assignPlaces } from './meetingRoom.js';
import type { PuppetWorld } from './scenePuppets.js';
import { Puppets, talkSpot } from './scenePuppets.js';
import type { SceneBubble } from './sceneText.js';
import { toBubble } from './sceneText.js';
import { faceEachOther } from './socialMoves.js';

export interface ScenesWorld extends PuppetWorld {
  seats: Map<string, Seat>;
  /** Where a briefing meets now, or null when the office has no meeting room. */
  planMeeting(): MeetingPlan | null;
}

type Line = Omit<CatMessageEvent, 'type'>;

interface Talk {
  id: number;
  msg: Line;
  reply: Line | null;
  phase: 'approach' | 'speak' | 'listen' | 'reply';
  t: number;
  /** Both cats are in the meeting: no walking. */
  inPlace: boolean;
}

interface Meeting {
  taskId: string;
  bossId: number;
  cats: number[];
  /** Chairs taken for the meeting that are not the cat's own desk seat. */
  chairs: Map<number, Seat>;
  brief: Line | null;
}

export class OfficeScenes {
  readonly puppets = new Puppets();
  private readonly w: ScenesWorld;
  private pending: Line[] = [];
  private talks: Talk[] = [];
  private meeting: Meeting | null = null;
  /** Cats walking back to their desks; released when they sit down. */
  private readonly returning = new Set<number>();
  private nextTalkId = 1;

  constructor(world: ScenesWorld) {
    this.w = world;
  }

  /** The scene moves this cat: the FSM and the social layer leave it alone. */
  owns(id: number): boolean {
    return this.puppets.owns(id);
  }

  handle(ev: OrchestratorEvent): void {
    if (ev.type === 'flowStateChanged') this.onFlow(ev);
    else this.onMessage(ev);
  }

  /** Messages waiting for their cats (tests). */
  get queued(): number {
    return this.pending.length;
  }

  /** Phase of the talk a cat is in (tests, hover). */
  talkPhase(id: number): Talk['phase'] | null {
    return this.talkOf(id)?.phase ?? null;
  }

  /** [seat tile key, cat id] of every meeting chair, for the seat reservations. */
  meetingSeats(): Array<[string, number]> {
    if (!this.meeting) return [];
    return [...this.meeting.chairs].map(([id, s]) => [`${s.seatCol},${s.seatRow}`, id]);
  }

  // ── Events ─────────────────────────────────────────────────────

  private onMessage(ev: CatMessageEvent): void {
    const msg: Line = {
      from: ev.from,
      to: ev.to,
      kind: ev.kind,
      text: ev.text,
      summary: ev.summary,
    };
    const chars = this.w.characters;
    if (msg.from === msg.to || !chars.has(msg.from) || !chars.has(msg.to)) return;
    const m = this.meeting;
    if (m && m.cats.includes(msg.from) && m.cats.includes(msg.to)) {
      if (msg.from === m.bossId && msg.kind === 'brief') {
        m.brief = msg;
        return;
      }
    }
    const open = this.talks.find(
      (t) =>
        !t.inPlace &&
        !t.reply &&
        t.msg.from === msg.to &&
        t.msg.to === msg.from &&
        t.phase !== 'reply',
    );
    if (open) open.reply = msg;
    else this.pending.push(msg);
  }

  private onFlow(ev: FlowStateChangedEvent): void {
    if (ev.state !== 'briefing') {
      if (this.meeting?.taskId === ev.taskId) this.endMeeting();
      return;
    }
    if (this.meeting?.taskId === ev.taskId) return;
    if (this.meeting) this.endMeeting();
    this.startMeeting(ev);
  }

  // ── Meeting ────────────────────────────────────────────────────

  private startMeeting(ev: FlowStateChangedEvent): void {
    const chars = this.w.characters;
    const cats = [...new Set([ev.bossId, ...ev.participants])].filter((id) => {
      const ch = chars.get(id);
      return ch && !ch.matrixEffect && !ch.isSubagent;
    });
    if (!cats.includes(ev.bossId)) return;
    // The meeting comes first: talks of its cats go back to the queue front.
    const cut = this.talks.filter((t) => cats.includes(t.msg.from) || cats.includes(t.msg.to));
    this.talks = this.talks.filter((t) => !cut.includes(t));
    // The partner outside the meeting goes back to its own life.
    for (const t of cut) {
      if (!cats.includes(t.msg.from)) this.sendHome(t.msg.from);
      if (!cats.includes(t.msg.to) && this.puppets.owns(t.msg.to)) {
        this.puppets.release(t.msg.to, this.w);
      }
    }
    this.pending.unshift(
      ...cut.flatMap((t) => (t.inPlace ? [] : [t.msg, ...(t.reply ? [t.reply] : [])])),
    );
    const plan = this.w.planMeeting();
    const meeting: Meeting = {
      taskId: ev.taskId,
      bossId: ev.bossId,
      cats,
      chairs: new Map(),
      brief: null,
    };
    this.meeting = meeting;
    const places = assignPlaces(plan, cats, ev.bossId, (id) => chars.get(id)?.seatId ?? null);
    for (const id of cats) {
      this.returning.delete(id);
      this.puppets.take(chars.get(id)!, this.w);
      this.puppets.setTalking(id, false);
      const p = places.get(id)!;
      if (p.borrowed && p.seat) meeting.chairs.set(id, p.seat);
      this.puppets.goTo(id, p.goal, p.seat, p.face);
    }
  }

  private endMeeting(): void {
    const m = this.meeting;
    this.meeting = null;
    if (!m) return;
    for (const id of m.cats) this.sendHome(id);
    this.talks = this.talks.filter((t) => !t.inPlace);
  }

  // ── Talks ──────────────────────────────────────────────────────

  private newTalk(msg: Line, inPlace: boolean): Talk {
    return {
      id: this.nextTalkId++,
      msg,
      reply: null,
      phase: inPlace ? 'speak' : 'approach',
      t: 0,
      inPlace,
    };
  }

  private talkOf(id: number): Talk | undefined {
    return this.talks.find((t) => t.msg.from === id || t.msg.to === id);
  }

  private busy(id: number): boolean {
    return !!this.talkOf(id) || !!this.meeting?.cats.includes(id);
  }

  /**
   * Start queued talks whose cats are free, in arrival order per cat. A line
   * between two meeting cats plays in place. A queued answer of the receiver
   * becomes the reply of the talk that starts.
   */
  private startPending(): void {
    const held = new Set<number>();
    const keep: Line[] = [];
    const used = new Set<Line>();
    const m = this.meeting;
    const chars = this.w.characters;
    this.pending.forEach((msg, i) => {
      if (used.has(msg) || !chars.has(msg.from) || !chars.has(msg.to)) return;
      const inPlace = !!m && m.cats.includes(msg.from) && m.cats.includes(msg.to);
      const busy = (id: number) => (inPlace ? !!this.talkOf(id) : this.busy(id));
      const blocked = [msg.from, msg.to].some((id) => held.has(id) || busy(id));
      held.add(msg.from).add(msg.to);
      if (blocked) {
        keep.push(msg);
        return;
      }
      const talk = inPlace ? this.newTalk(msg, true) : this.beginTalk(msg);
      if (inPlace) this.talks.push(talk);
      const reply = this.pending
        .slice(i + 1)
        .find((l) => !used.has(l) && l.from === msg.to && l.to === msg.from);
      if (reply) {
        used.add(reply);
        talk.reply = reply;
      }
    });
    this.pending = keep;
  }

  private beginTalk(msg: Line): Talk {
    const chars = this.w.characters;
    const sender = chars.get(msg.from)!;
    const receiver = chars.get(msg.to)!;
    for (const id of [msg.from, msg.to]) this.returning.delete(id);
    this.puppets.take(sender, this.w);
    const seated = receiver.state === CharacterState.TYPE && !this.puppets.owns(receiver.id);
    if (!seated) {
      this.puppets.take(receiver, this.w);
      this.puppets.goTo(receiver.id, null);
    }
    const host = receiver.path[0] ?? { col: receiver.tileCol, row: receiver.tileRow };
    this.puppets.goTo(sender.id, talkSpot(sender, host, this.w));
    const talk = this.newTalk(msg, false);
    this.talks.push(talk);
    return talk;
  }

  private stepTalk(t: Talk, dt: number): boolean {
    const chars = this.w.characters;
    const sender = chars.get(t.msg.from);
    const receiver = chars.get(t.msg.to);
    if (!sender || !receiver) return this.endTalk(t);
    t.t += dt;
    switch (t.phase) {
      case 'approach': {
        const ready =
          this.puppets.isSettled(sender.id) &&
          (!this.puppets.owns(receiver.id) || this.puppets.isSettled(receiver.id));
        if (!ready && t.t < SCENE_APPROACH_TIMEOUT_SEC) return true;
        this.faceTalkers(sender, receiver);
        this.next(t, 'speak');
        return true;
      }
      case 'speak':
        this.puppets.setTalking(sender.id, true);
        if (t.t >= SCENE_SPEAK_SEC) this.next(t, 'listen');
        return true;
      case 'listen':
        this.puppets.setTalking(sender.id, false);
        if (t.reply) this.next(t, 'reply');
        else if (t.inPlace || t.t >= SCENE_REPLY_WAIT_SEC) return this.endTalk(t);
        return true;
      case 'reply':
        this.puppets.setTalking(receiver.id, t.t < SCENE_SPEAK_SEC);
        return t.t < SCENE_SPEAK_SEC || this.endTalk(t);
    }
  }

  private next(t: Talk, phase: Talk['phase']): void {
    t.phase = phase;
    t.t = 0;
  }

  /** Both turn to each other; a seated receiver keeps facing its desk. */
  private faceTalkers(sender: Character, receiver: Character): void {
    const keep = receiver.dir;
    faceEachOther(sender, receiver);
    this.puppets.face(sender.id, sender.dir);
    if (this.puppets.owns(receiver.id)) this.puppets.face(receiver.id, receiver.dir);
    else receiver.dir = keep;
  }

  /** The talk is over: the sender walks home, the receiver goes back to its life. */
  private endTalk(t: Talk): false {
    this.talks = this.talks.filter((x) => x !== t);
    if (t.inPlace) {
      for (const id of [t.msg.from, t.msg.to]) this.puppets.setTalking(id, false);
      return false;
    }
    this.sendHome(t.msg.from);
    if (this.puppets.owns(t.msg.to)) this.puppets.release(t.msg.to, this.w);
    return false;
  }

  private sendHome(id: number): void {
    const ch = this.w.characters.get(id);
    const seat = ch?.seatId ? this.w.seats.get(ch.seatId) : undefined;
    this.puppets.setTalking(id, false);
    if (!seat) {
      this.puppets.release(id, this.w);
      return;
    }
    this.puppets.goTo(id, null, seat);
    this.returning.add(id);
  }

  // ── Frame ──────────────────────────────────────────────────────

  update(dt: number): void {
    this.puppets.update(dt, this.w);
    for (const id of [...this.returning]) {
      if (!this.puppets.owns(id)) this.returning.delete(id);
      else if (this.puppets.isSettled(id) && !this.busy(id)) {
        this.returning.delete(id);
        this.puppets.release(id, this.w);
      }
    }
    const m = this.meeting;
    if (m) {
      m.cats = m.cats.filter((id) => this.puppets.owns(id));
      for (const id of [...m.chairs.keys()]) if (!m.cats.includes(id)) m.chairs.delete(id);
      if (!m.cats.includes(m.bossId)) this.endMeeting();
      else
        this.puppets.setTalking(
          m.bossId,
          this.puppets.isSettled(m.bossId) && !this.talkOf(m.bossId),
        );
    }
    for (const t of [...this.talks]) this.stepTalk(t, dt);
    this.startPending();
  }

  /** Text bubbles to draw this frame. */
  bubbles(): SceneBubble[] {
    const out: SceneBubble[] = [];
    const add = (key: string, catId: number, line: Line) => out.push(toBubble(key, catId, line));
    for (const t of this.talks) {
      if (t.phase === 'approach') continue;
      add(`talk-${t.id}`, t.msg.from, t.msg);
      if (t.phase === 'reply' && t.reply) add(`reply-${t.id}`, t.msg.to, t.reply);
    }
    const m = this.meeting;
    if (m && this.puppets.isSettled(m.bossId) && !this.talkOf(m.bossId)) {
      const brief: Line = m.brief ?? {
        from: m.bossId,
        to: m.bossId,
        kind: 'brief',
        text: SCENE_BRIEFING_TEXT,
      };
      add(`brief-${m.taskId}`, m.bossId, brief);
    }
    return out;
  }
}

export type { SceneBubble } from './sceneText.js';
