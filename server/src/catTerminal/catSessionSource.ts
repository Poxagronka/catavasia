/**
 * Where the cat console gets a cat's session from.
 *
 * CatSessionSource is the seam the orchestrator plugs into: its own per-cat
 * stream-json sessions implement the same five calls (OfficeCatSource).
 */

import type {
  CatSessionEntry,
  CatSessionFrame,
  CatSessionStatus,
} from '../../../core/src/catSession.js';
import type { TaskLogEntry } from '../../../core/src/tasks.js';

export interface CatSessionSnapshot {
  title: string;
  entries: CatSessionEntry[];
  status: CatSessionStatus;
}

/** A request the caller must fix. `code` is the HTTP status (400, 404, 409). */
export class CatSessionError extends Error {
  constructor(
    readonly code: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

/** The session the wheel resumes; `launch` = the engine's resume command (default: Claude). */
export interface WheelSession {
  sessionId: string;
  cwd: string;
  launch?: { command: string; args: string[] };
}

export interface CatSessionSource {
  /** The cat's session so far, or undefined when this source does not know the cat. */
  snapshot(catId: string): CatSessionSnapshot | undefined;
  /** Live `entries` and `status` frames. Returns the unsubscribe function. */
  subscribe(catId: string, listener: (frame: CatSessionFrame) => void): () => void;
  /** Deliver a user message (a new turn). Throws CatSessionError. */
  send(catId: string, text: string): Promise<void>;
  /** Take the session lock for an interactive PTY. Throws CatSessionError. */
  beginWheel(catId: string): Promise<WheelSession>;
  /** The PTY ended: release the lock. */
  endWheel(catId: string): Promise<void>;
  /** Reading this session needs the server token too (the CEO desk: job reports, folders). */
  needsToken?(catId: string): boolean;
}

/** Task log row -> console row. Exported for tests. */
export function toConsoleEntry(entry: TaskLogEntry): CatSessionEntry {
  if (entry.kind === 'tool') return { kind: 'tool', name: entry.name ?? 'Tool', text: entry.text };
  // An office message (cat office) reads as text: "from -> to (kind): body".
  if (entry.kind === 'message') return { kind: 'text', text: `${entry.name}: ${entry.text}` };
  return { kind: entry.kind, text: entry.text };
}
