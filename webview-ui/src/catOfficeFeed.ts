/**
 * Cat office feed: orchestrator server messages -> the office.
 *
 * - catCharacters: the resident cat of each profile (name, coat, working) ->
 *   OfficeState.setResidentCats. Also the cat id -> agent id map below.
 * - catMessage, flowStateChanged: cat ids mapped to agent ids, then
 *   orchestratorEvents.emit (the office scenes). Messages to or from the
 *   user and office nudges have no second cat and are skipped. A brief goes
 *   to `team`: it plays as the boss speaking to one cat of the meeting.
 * - queueChanged: cats whose turn waits for a slot (not running one) line up
 *   by the coffee -> OfficeState.setQueuedCats.
 *
 * A lost connection ends every open briefing: the server cannot send the
 * final state then, and a meeting waits for a non-briefing state.
 *
 * DOM-free: App.tsx connects it to the transport.
 */

import type { ServerMessage } from '../../core/src/messages.js';
import type { Appearance } from './cats/catsApi.js';
import type { ResidentCat } from './office/engine/officeState.js';
import type { CatMessageKind, FlowState, OrchestratorEvents } from './orchestratorEvents.js';

export interface FeedWorld {
  setResidentCats(list: ResidentCat[]): void;
  setQueuedCats(ids: number[]): void;
}

const SCENE_KINDS: readonly string[] = ['brief', 'delegate', 'ask', 'reply', 'report'];

export class CatOfficeFeed {
  private readonly agentOf = new Map<string, number>();
  /** Team of every task seen: root first. */
  private readonly teams = new Map<string, { root: string; cats: string[] }>();
  private readonly briefing = new Set<string>();

  private readonly world: () => FeedWorld | null;
  private readonly bus: OrchestratorEvents;

  constructor(world: () => FeedWorld | null, bus: OrchestratorEvents) {
    this.world = world;
    this.bus = bus;
  }

  handle(msg: ServerMessage): void {
    switch (msg.type) {
      case 'catCharacters':
        this.agentOf.clear();
        for (const c of msg.characters) this.agentOf.set(c.catId, c.id);
        this.world()?.setResidentCats(
          msg.characters.map((c) => ({
            id: c.id,
            name: c.name,
            appearance: c.appearance as Appearance,
            working: c.working,
          })),
        );
        break;
      case 'queueChanged': {
        const waiting = msg.queued.filter((catId) => !msg.running.includes(catId));
        this.world()?.setQueuedCats(this.ids(waiting));
        break;
      }
      case 'flowStateChanged':
        this.onFlow(msg.taskId, msg.state, msg.rootCatId, msg.catIds);
        break;
      case 'catMessage':
        this.onMessage(msg.taskId, msg.from, msg.to, msg.kind, msg.text);
        break;
    }
  }

  /** The connection dropped: end every open meeting. */
  connectionLost(): void {
    for (const taskId of [...this.briefing]) this.onFlow(taskId, 'error');
  }

  private onFlow(taskId: string, wireState: string, rootCatId?: string, catIds?: string[]): void {
    if (rootCatId) this.teams.set(taskId, { root: rootCatId, cats: catIds ?? [rootCatId] });
    const team = this.teams.get(taskId);
    // The webview scenes know no 'interrupted' or 'cancelled': they end a meeting like an error.
    const ended = wireState === 'interrupted' || wireState === 'cancelled';
    const state = (ended ? 'error' : wireState) as FlowState;
    if (state === 'briefing') this.briefing.add(taskId);
    else this.briefing.delete(taskId);
    this.bus.emit({
      type: 'flowStateChanged',
      taskId,
      state,
      bossId: (team && this.agentOf.get(team.root)) ?? -1,
      participants: this.ids(team?.cats ?? []),
    });
    if (['done', 'error'].includes(state)) this.teams.delete(taskId);
  }

  private onMessage(taskId: string, from: string, to: string, kind: string, text: string): void {
    if (!SCENE_KINDS.includes(kind)) return;
    let target = to;
    if (to === 'team') {
      // The boss briefs the whole team: one listener stands for it.
      target = this.teams.get(taskId)?.cats.find((c) => c !== from && this.agentOf.has(c)) ?? '';
    }
    const fromId = this.agentOf.get(from);
    const toId = this.agentOf.get(target);
    if (fromId === undefined || toId === undefined) return;
    this.bus.emit({
      type: 'catMessage',
      from: fromId,
      to: toId,
      kind: kind as CatMessageKind,
      text,
    });
  }

  private ids(catIds: string[]): number[] {
    return catIds.flatMap((c) => {
      const id = this.agentOf.get(c);
      return id === undefined ? [] : [id];
    });
  }
}
