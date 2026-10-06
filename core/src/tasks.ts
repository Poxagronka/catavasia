/**
 * Task board contract shared by the standalone server (server/src/taskBoard/) and
 * the webview board (webview-ui/src/components/taskBoard/).
 *
 * A task is one headless `claude -p` run started from the board. It travels
 * over plain HTTP (`/api/tasks`), not the AsyncAPI WebSocket protocol: the
 * board is a standalone-only surface and polls while it is open.
 */

import type { CatEngine, FlowState } from './messages.js';

export type TaskStatus = 'running' | 'done' | 'error';

/** One line of the collapsible activity log in the task detail view. */
export interface TaskLogEntry {
  /** `user`: a follow-up message the user sent from the cat console. */
  kind: 'user' | 'tool' | 'text' | 'error' | 'message';
  /** Tool name for `tool` entries; `from -> to (kind)` for office `message` entries. */
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
  /** Who runs the task: absent = one plain run, `team` = the root cat, or a cat id. */
  target?: string;
  /** Cat-office state of a `target` task. */
  flow?: TaskFlow;
  /** The Cat CEO review of a finished team task. */
  review?: TaskReview;
}

/** The Cat CEO review of one task (docs/catavasia/cat-ceo-judge.md). */
export interface TaskReview {
  state: 'pending' | 'reviewing' | 'reviewed' | 'failed';
  reviewId: string;
  verdict?: 'pass' | 'concerns' | 'fail';
  summary?: string;
  /** Lowest and highest assignment score. */
  minScore?: number;
  maxScore?: number;
  costUsd?: number;
  error?: string;
}

/** One delegation inside a team task: a cat working on a goal its parent gave it. */
export interface TaskFlowNode {
  cat: string;
  /** The cat that delegated. */
  from: string;
  goal: string;
  status: 'working' | 'reported' | 'failed';
  /** Worker branch `task/<id>-<cat>`; absent outside git. */
  branch?: string;
}

export interface TaskFlow {
  /** The cat that leads the task and reports the result to the user. */
  root: string;
  state: FlowState;
  nodes: TaskFlowNode[];
  /** The root cat's plan from the `brief` tool. */
  brief?: string;
  /** Turns started so far (all cats). */
  turns: number;
}

/** A choice in the new-task form's "Who" field. */
export interface TaskTarget {
  /** `team` or a cat id. */
  id: string;
  label: string;
  /** Why this choice cannot run now ("Codex CLI not found", "Claude Code: not logged in"). */
  disabled?: string;
  /** The engine of the cat that leads it (the boss for `team`). */
  engine?: CatEngine;
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
  /** Team and cats a task can go to (empty when the cat office is off). */
  targets: TaskTarget[];
}

export interface CreateTaskRequest {
  prompt: string;
  cwd?: string;
  /** `team`, a cat id, or absent for one plain run. */
  target?: string;
}
