/**
 * CEO desk contract shared by the standalone server (server/src/ceoDesk/) and
 * the webview dock (docs/catavasia/ROADMAP.md, "CEO desk replaces the task board").
 *
 * The CEO's chat travels over the cat session socket of the literal id
 * `cat-ceo` (`/api/cat-sessions/cat-ceo/events`). Commands go over plain,
 * token-gated HTTP under CEO_API_PREFIX.
 */

export const CEO_API_PREFIX = '/api/ceo';

/** One worker inside a job: a cat working on a goal its parent gave it. */
export interface JobCardNode {
  catId: string;
  catName: string;
  fromId: string;
  fromName: string;
  /** The goal, cut to one short line. */
  goal: string;
  status: 'working' | 'reported' | 'failed';
}

/** A job the CEO started (one team task), as the chat card shows it. */
export interface JobCard {
  jobId: string;
  title: string;
  /** `team` or a cat id. */
  target: string;
  /** Name of the cat that leads the job. */
  leadName: string;
  /** The project folder, or null when the job runs in the chat sandbox. */
  folder: string | null;
  /** The flow state (`working`, `done`, `interrupted`...), else the task status. */
  state: string;
  turns: number;
  costUsd?: number;
  /** `task/<id>`; absent outside git. */
  branch?: string;
  error?: string;
  nodes: JobCardNode[];
}

/**
 * Attachment limits of one desk message. The dock downscales a bigger image
 * (longest edge CEO_IMAGE_EDGE_PX) before it sends.
 */
export const CEO_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const CEO_ATTACH_MAX_COUNT = 8;
export const CEO_ATTACH_MAX_TOTAL_BYTES = 25 * 1024 * 1024;
export const CEO_IMAGE_EDGE_PX = 2000;
/** Images the CEO sees (Claude image blocks). Other files: the CEO reads them by path. */
export const CEO_IMAGE_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
];

/** `12 KB`, `3.4 MB`: attachment sizes in the dock and in the CEO's message. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** A file the user attached to a desk message, as the chat row shows it. */
export interface CeoAttachment {
  /** The name of the user's file. */
  name: string;
  size: number;
  /** An image the CEO sees; else a file the CEO reads by path. */
  image: boolean;
  /** GET path of the stored file (the page adds the token). */
  url: string;
}

/** One file of POST /api/ceo/messages. */
export interface CeoAttachmentUpload {
  name: string;
  /** The MIME type the browser gave (may be empty). */
  type: string;
  /** The file content, base64. */
  data: string;
}

/** POST /api/ceo/messages: text, attachments, or both. */
export interface CeoMessageRequest {
  text: string;
  attachments?: CeoAttachmentUpload[];
}

/** POST /api/ceo/stop: the user messages that were still queued, for the draft. */
export interface CeoStopResponse {
  draft: string;
  /** Files of the queued messages, still stored: the dock puts them back in the composer. */
  attachments?: CeoAttachment[];
}

/** PUT /api/ceo/folder: an absolute project folder, or null for the sandbox. */
export interface CeoFolderRequest {
  path: string | null;
}

/**
 * The office's project after a change (PUT /api/ceo/folder, POST
 * folder/pick, folder/new, folder/history). `git`: the folder has version
 * history with a commit, so each job gets its own branch.
 */
export interface CeoFolderResponse {
  folder: string | null;
  git: boolean;
}

/** POST /api/ceo/folder/pick: the user closed the window without a folder. */
export interface CeoFolderCancelled {
  cancelled: true;
}

/** POST /api/ceo/folder/new: a project in ~/catavasia-projects/<name>. */
export interface CeoNewProjectRequest {
  name: string;
}

/** GET /api/ceo/folders */
export interface CeoFoldersResponse extends CeoFolderResponse {
  /** Projects picked before and folders of earlier tasks, newest first. */
  recent: string[];
  /** The server can show the system folder window (else the panel offers a path box). */
  canPick: boolean;
}

/**
 * A cat or the CEO waits for the user's yes or no before one action (its
 * permission mode asked). The CEO dock shows it as a card; the CEO session
 * status carries the open ones (`CatSessionStatus.approvals`).
 */
export interface CeoApproval {
  id: string;
  /** `cat-ceo` or the cat's id. */
  catId: string;
  /** The CEO's or the cat's name. */
  who: string;
  /** What it wants to do, in plain words ("run a command"). */
  action: string;
  /** The command, file or address, cut to one short block. */
  detail: string;
  /** The engine offers a rule so it does not ask again for this. */
  canAlwaysAllow: boolean;
  /** When an unanswered card counts as Deny (ms since epoch). */
  expiresAt: number;
  /** Claude's AskUserQuestion: the card shows these questions, not Allow / Deny. */
  questions?: CeoQuestion[];
}

/** One question of Claude Code's AskUserQuestion tool (SDK `AskUserQuestionInput`). */
export interface CeoQuestion {
  question: string;
  /** A short tag ("Color"). */
  header: string;
  options: { label: string; description: string }[];
  /** The user may pick more than one option. */
  multiSelect: boolean;
}

/** POST /api/ceo/approvals/:id */
export interface CeoApprovalAnswer {
  answer: 'allow' | 'always' | 'deny';
  /** A question card's answers (with `allow`): question text -> answer, picks comma-separated. */
  answers?: Record<string, string>;
}

/**
 * A slash command Claude Code offers in the CEO's folder (GET /api/ceo/commands):
 * built-ins, custom commands and skills, as the Agent SDK lists them.
 */
export interface DeskCommand {
  name: string;
  description: string;
  /** What to type after the name ("<model>"); empty when it takes nothing. */
  argumentHint: string;
  aliases?: string[];
  /** Claude Code's own command (not a user, project or plugin one). */
  builtin?: boolean;
}

/** GET /api/ceo/commands */
export interface CeoCommandsResponse {
  commands: DeskCommand[];
}

/**
 * One MCP server ("connector") of Claude Code, shared by the CEO and every cat.
 * `source`: user, project, local, claudeai, plugin, managed... (the SDK's word).
 */
export interface Connector {
  name: string;
  status: 'connected' | 'failed' | 'needs-auth' | 'pending' | 'disabled';
  source: string;
  /** The web address or the command it runs. */
  target?: string;
  error?: string;
  /** It talks over the web: Sign in can apply. */
  web: boolean;
}

/** GET /api/ceo/connectors and the answer of every change. */
export interface CeoConnectorsResponse {
  connectors: Connector[];
  /** The office's project: Turn off / on applies to it (null: no project, no toggle). */
  project: string | null;
}

/** POST /api/ceo/connectors: a command line or an http(s) address; `local`: this project only. */
export interface CeoConnectorAddRequest {
  name: string;
  target: string;
  scope: 'user' | 'local';
}

/** Names `claude mcp add` gets from the dock. */
export const CONNECTOR_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
