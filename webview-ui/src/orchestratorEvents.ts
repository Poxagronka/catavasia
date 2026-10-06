/**
 * Orchestrator events: the client-side interface the office scenes listen to.
 *
 * The types mirror the server messages of the orchestrator (core/asyncapi.yaml).
 * `catOfficeFeed.ts` translates the server's `catMessage` and
 * `flowStateChanged` into `orchestratorEvents.emit(...)`; the e2e test hook
 * `emitOrchestratorEvent` drives the scenes directly.
 *
 * Ids are webview agent ids (the keys of OfficeState.characters). The feed
 * maps a cat id to its agent id (the resident cat) before it emits.
 *
 * DOM-free: no window, no transport.
 */

export type CatMessageKind = 'brief' | 'delegate' | 'ask' | 'reply' | 'report';

/** One cat talks to another (a real agent message, not idle social chat). */
export interface CatMessageEvent {
  type: 'catMessage';
  from: number;
  to: number;
  kind: CatMessageKind;
  /** The full message text. */
  text: string;
  /** Short narrator summary. The bubble shows it when present. */
  summary?: string;
}

export type FlowState =
  'briefing' | 'delegating' | 'working' | 'reporting' | 'merging' | 'done' | 'error';

/** A task moves to a new stage. 'briefing' gathers its cats in one room. */
export interface FlowStateChangedEvent {
  type: 'flowStateChanged';
  taskId: string;
  state: FlowState;
  bossId: number;
  /** Every cat of the task. The boss may be listed too. */
  participants: number[];
}

export type OrchestratorEvent = CatMessageEvent | FlowStateChangedEvent;

export type OrchestratorListener = (event: OrchestratorEvent) => void;

export class OrchestratorEvents {
  private readonly listeners = new Set<OrchestratorListener>();

  /** Subscribe. Returns the unsubscribe function. */
  on(listener: OrchestratorListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: OrchestratorEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }
}

/** The one bus of the webview. */
export const orchestratorEvents = new OrchestratorEvents();
