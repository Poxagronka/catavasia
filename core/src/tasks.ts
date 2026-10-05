/**
 * Task board contract shared by the standalone server (server/src/taskBoard/) and
 * the webview board (webview-ui/src/components/taskBoard/).
 *
 * A task is one headless `claude -p` run started from the board. It travels
 * over plain HTTP (`/api/tasks`), not the AsyncAPI WebSocket protocol: the
 * board is a standalone-only surface and polls while it is open.
 */

export type TaskStatus = 'running' | 'done' | 'error';

/** One line of the collapsible activity log in the task detail view. */
export interface TaskLogEntry {
  kind: 'tool' | 'text' | 'error';
  /** Tool name for `tool` entries. */
  name?: string;
  /** Tool input summary, assistant text, or error text (truncated). */
  text: string;
}

export interface TaskChangedFile {
  /** git --name-status letter: A, M, D, R, ... */
  status: string;
  path: string;
}

/** What GET /api/tasks returns per task (no diff, no log). */
export interface TaskSummary {
  id: string;
  /** First line of the prompt. */
  title: string;
  prompt: string;
  /** Target folder the user picked. */
  cwd: string;
  status: TaskStatus;
  createdAt: number;
  finishedAt?: number;
  /** Office agent id while the task runs. */
  agentId?: number;
  palette?: number;
  hueShift?: number;
  /** `task/<id>`; absent when the folder is not a git repo. */
  branch?: string;
  error?: string;
  costUsd?: number;
  durationMs?: number;
  numTurns?: number;
}

/** What GET /api/tasks/:id returns. */
export interface TaskDetail extends TaskSummary {
  /** Final text of the stream-json `result` event (markdown). */
  result?: string;
  changedFiles?: TaskChangedFile[];
  diff?: string;
  diffTruncated?: boolean;
  log: TaskLogEntry[];
}

export interface TaskListResponse {
  tasks: TaskSummary[];
  /** Folder the server was started in: the form's default target. */
  defaultCwd: string;
}

export interface CreateTaskRequest {
  prompt: string;
  cwd?: string;
}
