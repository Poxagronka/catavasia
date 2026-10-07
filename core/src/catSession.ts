/**
 * Cat terminal contract shared by the standalone server (server/src/catTerminal/)
 * and the webview console (webview-ui/src/catTerminal/).
 *
 * A cat's session travels over its own WebSocket, not the AsyncAPI `/ws`
 * protocol: the console is a standalone-only surface, one socket per open
 * panel. Today the source is the task board; the orchestrator (phase 1) plugs
 * in through the server's CatSessionSource interface without changing this file.
 */

import type { CeoApproval, CeoAttachment, JobCard } from './ceoDesk.js';

/**
 * One row of the chat console. `at` (CEO desk): when the row was added, in ms,
 * unique and rising within a chat; the dock marks the last row seen by it.
 */
export type CatSessionEntry = { at?: number } &
  /** `attachments`: files the user sent with the message (CEO desk). */
  (
    | { kind: 'user'; text: string; attachments?: CeoAttachment[] }
    | { kind: 'text'; text: string }
    /**
     * A tool call. `text`: its command, file or address in short. CEO desk only:
     * `about` (what a command or helper is for, in the model's words), `input`
     * (when it says more than `text`), `result`, `isError` and the `images` it
     * returned, all cut to a few KB.
     */
    | {
        kind: 'tool';
        name: string;
        text: string;
        about?: string;
        input?: string;
        result?: string;
        isError?: boolean;
        images?: CeoAttachment[];
      }
    /** The CEO thought before it acted (the thought itself is not shown by Claude Code). */
    | { kind: 'thought'; ms: number }
    /** A quiet line between rows ("Summarised the chat" after /compact). */
    | { kind: 'note'; text: string }
    /** `login`: the engine is logged out; the console offers its login (CEO desk). */
    | { kind: 'error'; text: string; login?: boolean }
    /** Prompt edits a chat applied (Cat CEO): the console links each cat's Prompt history. */
    | { kind: 'edits'; text: string; catIds: string[] }
    /**
     * A job the CEO started (CEO desk): a later `job` frame updates it in place
     * by jobId. `text` is the card as one line, for a console that has no card.
     */
    | { kind: 'job'; text: string; job: JobCard }
  );

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
  /** CEO desk: actions of the CEO or a cat that wait for the user's answer, oldest first. */
  approvals?: CeoApproval[];
  /** CEO desk: how full the CEO session's context window is (absent: not known yet). */
  context?: ContextUse;
  /** CEO desk: the Claude subscription's limits as the newest turn saw them. */
  limits?: UsageLimits;
}

/** Tokens of the last request (input + cache writes + cache reads) of the window. */
export interface ContextUse {
  used: number;
  window: number;
}

/** One limit window: `used` 0..1, `resetsAt` in Unix seconds. */
export interface LimitWindow {
  used: number;
  resetsAt: number;
}

/** The windows a Claude turn reported; a window the office has not seen is absent. */
export interface UsageLimits {
  fiveHour?: LimitWindow;
  weekly?: LimitWindow;
}

/** Server -> client frames on `/api/cat-sessions/:catId/events`. */
export type CatSessionFrame =
  | { type: 'snapshot'; entries: CatSessionEntry[]; status: CatSessionStatus; title: string }
  | { type: 'entries'; entries: CatSessionEntry[] }
  | { type: 'status'; status: CatSessionStatus }
  /** CEO desk: the new state of a job card (replace the `job` entry with this jobId). */
  | { type: 'job'; text: string; job: JobCard }
  /** CEO desk: a row changed (a tool's result came): replace the entry with the same `at`. */
  | { type: 'update'; entry: CatSessionEntry };

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
