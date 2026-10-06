/**
 * Persistence of one team task (task-state-machine.md §9):
 * `~/.pixel-agents/flows/<taskId>/events.jsonl` (one `{seq, at, event}` per
 * line, fsynced before the effects of that event run) and `snapshot.json`
 * (`{seq, state}`, tmp + rename). Load = snapshot + replay of the later events.
 * No secrets: MCP tokens never enter an event.
 */

import * as fs from 'fs';
import * as path from 'path';

import { FLOW_LOG_RETENTION_MS, FLOWS_DIR } from '../../constants.js';
import { reduce, startTask } from './taskReducer.js';
import type { TaskEvent, TaskState } from './types.js';

const EVENTS = 'events.jsonl';
const SNAPSHOT = 'snapshot.json';

export interface LoggedEvent {
  seq: number;
  at: number;
  event: TaskEvent;
}

export class EventLog {
  constructor(readonly dir: string) {}

  static of(stateDir: string, taskId: string): EventLog {
    return new EventLog(path.join(stateDir, FLOWS_DIR, taskId));
  }

  exists(): boolean {
    return fs.existsSync(path.join(this.dir, EVENTS));
  }

  append(entry: LoggedEvent): void {
    fs.mkdirSync(this.dir, { recursive: true });
    const fd = fs.openSync(path.join(this.dir, EVENTS), 'a', 0o600);
    try {
      fs.writeSync(fd, `${JSON.stringify(entry)}\n`);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }

  writeSnapshot(seq: number, state: TaskState): void {
    const file = path.join(this.dir, SNAPSHOT);
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ seq, state }), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }

  events(): LoggedEvent[] {
    let text: string;
    try {
      text = fs.readFileSync(path.join(this.dir, EVENTS), 'utf-8');
    } catch {
      return [];
    }
    // A torn last line (crash mid-write) is dropped.
    return text
      .split('\n')
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as LoggedEvent];
        } catch {
          return [];
        }
      });
  }

  snapshot(): { seq: number; state: TaskState } | undefined {
    try {
      return JSON.parse(fs.readFileSync(path.join(this.dir, SNAPSHOT), 'utf-8')) as {
        seq: number;
        state: TaskState;
      };
    } catch {
      return undefined;
    }
  }

  /** The state after the last logged event: the snapshot, then a replay of the events after it. */
  load(): { seq: number; state: TaskState } | undefined {
    const snap = this.snapshot();
    let state = snap?.state;
    let seq = snap?.seq ?? 0;
    for (const entry of this.events()) {
      if (entry.seq <= seq) continue;
      if (entry.event.type === 'TaskStarted') state = startTask(entry.event).state;
      else if (state) state = reduce(state, entry.event).state;
      seq = entry.seq;
    }
    return state ? { seq, state } : undefined;
  }
}

/** Delete the logs of tasks whose last write is older than the retention (server start). */
export function pruneFlowLogs(stateDir: string, now: number): void {
  const root = path.join(stateDir, FLOWS_DIR);
  let dirs: string[];
  try {
    dirs = fs.readdirSync(root);
  } catch {
    return;
  }
  for (const name of dirs) {
    const dir = path.join(root, name);
    try {
      if (now - fs.statSync(dir).mtimeMs > FLOW_LOG_RETENTION_MS) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    } catch {
      /* gone meanwhile */
    }
  }
}
