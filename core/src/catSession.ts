/**
 * Cat terminal contract shared by the standalone server (server/src/catTerminal/)
 * and the webview console (webview-ui/src/catTerminal/).
 *
 * A cat's session travels over its own WebSocket, not the AsyncAPI `/ws`
 * protocol: the console is a standalone-only surface, one socket per open
 * panel. Today the source is the task board; the orchestrator (phase 1) plugs
 * in through the server's CatSessionSource interface without changing this file.
 */

import type { JobCard } from './ceoDesk.js';

/** One row of the chat console. */
export type CatSessionEntry =
  | { kind: 'user'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'tool'; name: string; text: string }
  | { kind: 'error'; text: string }
  /** Prompt edits a chat applied (Cat CEO): the console links each cat's Prompt history. */
  | { kind: 'edits'; text: string; catIds: string[] }
  /**
   * A job the CEO started (CEO desk): a later `job` frame updates it in place
   * by jobId. `text` is the card as one line, for a console that has no card.
   */
  | { kind: 'job'; text: string; job: JobCard };

/** Whether a cat can hand its session to an interactive terminal right now. */
export interface CatSessionStatus {
  /** A turn is running: the cat cannot take a message or the wheel. */
  busy: boolean;
  /** Someone holds the wheel (an interactive `claude --resume` PTY is open). */
  wheelHeld: boolean;
  /** Why the wheel is not offered at all (no PTY module, no session id...). */
  wheelUnavailable?: string;
  /** What the console says while busy (default: the cat is working). */
  busyText?: string;
  /** CEO desk: messages and job notices waiting for the next CEO turn. */
  queued?: number;
  /** CEO desk: the chat's work folder (null = sandbox). */
  folder?: string | null;
  /** CEO desk: what the chat's CEO session has cost so far. */
  costUsd?: number;
}

/** Server -> client frames on `/api/cat-sessions/:catId/events`. */
export type CatSessionFrame =
  | { type: 'snapshot'; entries: CatSessionEntry[]; status: CatSessionStatus; title: string }
  | { type: 'entries'; entries: CatSessionEntry[] }
  | { type: 'status'; status: CatSessionStatus }
  /** CEO desk: the new state of a job card (replace the `job` entry with this jobId). */
  | { type: 'job'; text: string; job: JobCard };

/** Client -> server frames on `/api/cat-sessions/:catId/terminal`. */
export type WheelClientFrame =
  { type: 'input'; data: string } | { type: 'resize'; cols: number; rows: number };

/** Server -> client frames on `/api/cat-sessions/:catId/terminal`. */
export type WheelServerFrame =
  | { type: 'output'; data: string }
  | { type: 'exit'; exitCode: number }
  | { type: 'error'; message: string };

export const CAT_SESSION_API_PREFIX = '/api/cat-sessions';

/** WebSocket close codes of the cat terminal sockets (4000-4999: final, no retry). */
export const CAT_WS_CLOSE_UNAUTHORIZED = 4401;
export const CAT_WS_CLOSE_NOT_FOUND = 4404;
export const CAT_WS_CLOSE_BUSY = 4409;
