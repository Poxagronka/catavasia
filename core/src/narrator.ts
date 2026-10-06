/**
 * Narrator contract shared by the server (server/src/narrator/) and the webview
 * (webview-ui/src/narratorStore.ts).
 *
 * The narrator turns raw agent events into short English status lines (templates)
 * and conversation summaries (batched one-shot Haiku calls).
 *
 * The wire messages (narratorLine, narratorSummary, narratorSettings,
 * setNarratorSettings) are part of core/asyncapi.yaml; their types come from
 * the generated messages.ts.
 */

import type {
  NarratorLine as NarratorLineMessage,
  NarratorSettings as NarratorSettingsMessage,
  NarratorSummary as NarratorSummaryMessage,
} from './messages.js';

/** Work state of a cat, as the narrator sees it. */
export type NarratorState =
  'thinking' | 'reading' | 'editing' | 'testing' | 'waiting' | 'done' | 'error';

/**
 * One normalized event the narrator consumes. Every event source (task board
 * stream-json, hook events, orchestrator messages) maps into this shape.
 *
 * - `tool`: a tool call. `tool` is the tool name, `file` its path when it has
 *   one, `text` the command / query.
 * - `message`: a cat-to-cat message (`from` -> `to`, `text` is the body).
 * - `state`: a state change. `text` is thinking | permission | input | done | error.
 * - `result`: the final result of a task or turn. `text` is the result body.
 */
export interface NarratorInput {
  /** Office agent id of the cat. */
  catId: number;
  /** Epoch ms. */
  ts: number;
  kind: 'tool' | 'message' | 'state' | 'result';
  tool?: string;
  file?: string;
  from?: string;
  to?: string;
  text?: string;
}

/** Status line for one cat (template output). */
export interface NarratorLine {
  catId: number;
  state: NarratorState;
  /** English, at most NARRATOR_LINE_MAX_CHARS characters. */
  line: string;
}

/** Summary of one conversation (Haiku output, validated by the server). */
export interface NarratorSummary {
  conversationId: string;
  /** Cats that took part, so the webview can show it on their hover. */
  catIds: number[];
  /** English, at most NARRATOR_SUMMARY_MAX_CHARS characters. */
  summary: string;
}

export const NARRATOR_LINE_MAX_CHARS = 60;
export const NARRATOR_SUMMARY_MAX_CHARS = 120;

/** User settings of the narrator (standalone server, per-namespace config). */
export interface NarratorSettings {
  /** Batched Haiku conversation summaries. Default ON. */
  aiSummaries: boolean;
  /** Show the raw tool status ("Reading foo.ts") instead of the narrator line. Default OFF. */
  rawToolStatus: boolean;
}

// ── Wire messages (core/asyncapi.yaml) ──

/** Server -> client. */
export type NarratorServerMessage =
  NarratorLineMessage | NarratorSummaryMessage | NarratorSettingsMessage;
