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

/** POST /api/ceo/messages */
export interface CeoMessageRequest {
  text: string;
}

/** POST /api/ceo/stop: the user messages that were still queued, for the draft. */
export interface CeoStopResponse {
  draft: string;
}

/** PUT /api/ceo/folder: an absolute project folder, or null for the sandbox. */
export interface CeoFolderRequest {
  path: string | null;
}

/** GET /api/ceo/folders */
export interface CeoFoldersResponse {
  folder: string | null;
  /** Folders of earlier tasks, newest first. */
  recent: string[];
}
