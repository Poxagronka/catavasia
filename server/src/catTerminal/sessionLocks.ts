/**
 * Per-session lock: one process owns a Claude session id at a time.
 *
 * Two resumers of one session interleave their messages into one transcript
 * (docs/catavasia/orchestration-spec.md, section B.3), and nothing in the CLI
 * stops it. So every code path that starts a process on a session id takes
 * this lock first: a headless turn (`turn`) or the interactive "take the wheel"
 * PTY (`wheel`). The orchestrator (phase 1) must take the same lock.
 */

export type SessionLockHolder = 'turn' | 'wheel';

const holders = new Map<string, SessionLockHolder>();

/** Take the lock. Returns the release function, or null when it is held. */
export function acquireSessionLock(
  sessionId: string,
  holder: SessionLockHolder,
): (() => void) | null {
  if (holders.has(sessionId)) return null;
  holders.set(sessionId, holder);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders.delete(sessionId);
  };
}

/** Who holds the session, or undefined when it is free. */
export function sessionLockHolder(sessionId: string): SessionLockHolder | undefined {
  return holders.get(sessionId);
}
