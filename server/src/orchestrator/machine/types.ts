/**
 * Types of the team-task state machine (docs/catavasia/task-state-machine.md).
 *
 * One task = one TaskState: the task machine (`phase`), one assignment
 * machine per `delegate` call, and one turn region per member cat. The
 * reducer is pure: `reduce(state, event) -> { state, effects, reply }`.
 * Time, ids and every I/O result come in as events.
 */

import type { CatMessageKind, CatProfile, ServerMessage } from '../../../../core/src/messages.js';
import type { TaskLogEntry } from '../../../../core/src/tasks.js';
import type { MergeOutcome, RepoInfo } from '../../taskBoard/gitWorktree.js';
import type { StreamUsage } from '../../taskBoard/streamJson.js';

export type ActivePhase = 'briefing' | 'delegating' | 'working' | 'reporting';
export type TaskPhase = ActivePhase | 'finalizing' | 'done' | 'error' | 'cancelled' | 'interrupted';
export type FinalizeMode = 'ok' | 'fail' | 'cancel';

export type AssignmentState =
  | 'assigned'
  | 'working'
  | 'awaiting_children'
  | 'merging'
  | 'owing'
  | 'reporting'
  | 'reported'
  | 'done'
  | 'rejected'
  | 'failed'
  | 'cancelled';

export type TurnState = 'idle' | 'queued' | 'lock_wait' | 'preparing' | 'running';

/** Cat CEO review of a finished task (region of `done` / `error`). */
export type ReviewState =
  'review_pending' | 'reviewing' | 'reviewed' | 'review_skipped' | 'review_failed';

export interface Assignment {
  /** `a1`, `a2`, ... in delegation order. */
  id: string;
  parent: string;
  child: string;
  goal: string;
  state: AssignmentState;
  /** Worker branch `task/<id>-<cat>`; absent outside git. */
  branch?: string;
  /** The assignment this one reworks (`delegate` with `rework: true`). */
  reworkOf?: string;
  /** The report text (set when the child reports, before the commit). */
  report?: string;
  /** The report is a failure report. */
  failed?: boolean;
  /** Prompt repo commit of the child's prompt file when it joined (context-policy.md §6). */
  promptSha?: string;
}

export interface MemberState {
  catId: string;
  /** From `MemberJoined`. Kept across a restart once the session exists. */
  sessionId?: string;
  promptSha?: string;
  /** Token and persona files exist (false until MemberJoined, and after a restart). */
  joined: boolean;
  /** The session exists, so the next turn resumes it. */
  started: boolean;
  turn: TurnState;
  turnId?: string;
  /** Office character of the running turn. */
  agentId?: number;
  cwd?: string;
  worktreePath?: string;
  branch?: string;
  /** Messages for the next turn. */
  inbox: string[];
  /** Messages the running turn reads (requeued on retry and on resume). */
  inFlight: string[];
  /** Merge notes for the next message (they go first). */
  notes: string[];
  /** Child cat ids whose report branch merges into this worktree before the next turn. */
  pendingMerges: string[];
  /** Report messages by child id: read right after their branch merged (I4). */
  pendingReports: Record<string, string>;
  /** A merge conflict is open in this worktree: no other branch merges into it. */
  conflict: boolean;
  /** Cats that asked this cat and wait for a reply. */
  askedBy: string[];
  /** Cats this cat asked and waits for. */
  waitingOn: string[];
  /** The questions the running turn reads. */
  askedThisTurn: string[];
  /** Reports delivered to this cat that it has not read yet. */
  unreadReports: number;
  nudged: boolean;
  /** A report made in the running turn, sent when the turn ends. */
  outgoingReport?: string;
  /** The root's final result, made in the running turn. */
  final?: string;
  /** Failed turns of the current message (A14). */
  retries: number;
  /** A retry timer runs: no turn before it fires. */
  retryWait: boolean;
  /** The ended turn keeps its scheduler slot until the report commit ends (phase 1 order). */
  holdsSlot: boolean;
  /** The running turn hit TURN_TIMEOUT_MS and was killed. */
  timedOut: boolean;
  /** Cumulative session cost after the last turn. */
  sessionCostUsd: number;
}

export interface TaskState {
  taskId: string;
  rootId: string;
  prompt: string;
  /** The hierarchy as it was when the task started. */
  cats: CatProfile[];
  /** Cats whose engine has an adapter (others cannot run a turn). */
  runnable: string[];
  repo: RepoInfo | null;
  /** The Cat CEO reviews finished tasks (cat-ceo-judge.md). Off until it is built. */
  catCeo: boolean;
  phase: TaskPhase;
  /** History `H`: the phase to return to on Resume. */
  history?: Exclude<TaskPhase, 'interrupted' | 'done' | 'error' | 'cancelled'>;
  finalize?: { mode: FinalizeMode; text: string };
  brief?: string;
  turns: number;
  costUsd: number;
  members: Record<string, MemberState>;
  assignments: Assignment[];
  review?: ReviewState;
  /** Text of the final result (done) or the error (error, cancelled). */
  result?: string;
  error?: string;
}

export interface ToolReply {
  text: string;
  isError?: boolean;
}

export interface TurnResult {
  ok: boolean;
  text?: string;
  error?: string;
  sessionCostUsd?: number;
  usage?: StreamUsage;
  sessionStarted: boolean;
  /** The engine chose the session id (Codex): the member resumes this one. */
  sessionId?: string;
  /** The engine is not installed or logged out: no retry, the task fails (A14). */
  engineDown?: boolean;
}

export type TaskEvent =
  | {
      type: 'TaskStarted';
      taskId: string;
      rootId: string;
      prompt: string;
      cats: CatProfile[];
      runnable: string[];
      repo: RepoInfo | null;
      catCeo: boolean;
      /** The root's folder (the task worktree, or the plain folder). */
      cwd: string;
      worktreePath?: string;
      branch?: string;
    }
  | { type: 'MemberJoined'; catId: string; sessionId: string; promptSha?: string }
  | { type: 'ToolCalled'; catId: string; name: string; args: Record<string, unknown> }
  | { type: 'UserMessage'; catId: string; text: string }
  | { type: 'TurnGranted'; catId: string; turnId: string }
  | { type: 'TurnLockBusy'; catId: string }
  | {
      type: 'WorkspaceReady';
      catId: string;
      cwd: string;
      worktreePath?: string;
      branch?: string;
    }
  | { type: 'WorkspaceFailed'; catId: string; error: string }
  | {
      type: 'MergeFinished';
      catId: string;
      /** Paths of an earlier merge still in conflict: nothing merged. */
      blocked?: string[];
      results: Array<{ childId: string; branch: string; outcome: MergeOutcome }>;
      error?: string;
    }
  | { type: 'TurnStarted'; catId: string; turnId: string; agentId: number }
  | { type: 'TurnFinished'; catId: string; turnId: string; result: TurnResult }
  | { type: 'CommitFinished'; assignmentId: string; ok: boolean; error?: string }
  | { type: 'TimerFired'; id: string }
  | { type: 'FinalizeFinished'; error?: string }
  | { type: 'CancelRequested' }
  | { type: 'ServerRestarted' }
  | { type: 'ResumeRequested' }
  /** The office itself failed (a reducer error or a broken invariant): the task ends with an error. */
  | { type: 'OfficeFailed'; error: string }
  | { type: 'ReviewStarted'; reviewId: string }
  | { type: 'ReviewFinished'; reviewId: string }
  | { type: 'ReviewFailed'; error: string }
  // Log-only events: no state change, kept for the Cat CEO digest.
  | { type: 'ToolActivity'; catId: string; tool: string }
  | {
      type: 'CompactHappened';
      catId: string;
      trigger: string;
      preTokens?: number;
      postTokens?: number;
    };

export type Effect =
  | { type: 'JoinMember'; catId: string; sessionId?: string }
  | { type: 'RequestTurn'; catId: string }
  | { type: 'ReleaseTurn'; catId: string }
  | { type: 'PrepareWorkspace'; catId: string }
  | {
      type: 'MergeBranches';
      catId: string;
      worktreePath: string;
      branches: Array<{ childId: string; branch: string }>;
    }
  | {
      type: 'SpawnTurn';
      catId: string;
      turnId: string;
      sessionId: string;
      resume: boolean;
      cwd: string;
      message: string;
    }
  | { type: 'KillTurn'; catId: string }
  | { type: 'CommitWorktree'; assignmentId: string; worktreePath: string; message: string }
  | { type: 'StartTimer'; id: string; ms: number }
  | { type: 'CancelTimer'; id: string }
  | { type: 'Emit'; message: ServerMessage }
  /** One office message: catMessage + task log + narrator. */
  | { type: 'Message'; from: string; to: string; kind: CatMessageKind; text: string }
  | { type: 'Log'; entry: TaskLogEntry }
  | { type: 'FinalizeWorkspaces'; mode: FinalizeMode }
  /** The task left the machine: release characters and tokens, hand the task back. */
  | { type: 'EndTask' }
  | { type: 'RequestReview'; taskId: string };

export interface Step {
  state: TaskState;
  effects: Effect[];
  reply?: ToolReply;
}
