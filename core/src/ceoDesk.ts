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

/** GET /api/ceo/folders */
export interface CeoFoldersResponse {
  folder: string | null;
  /** Folders of earlier tasks, newest first. */
  recent: string[];
}
