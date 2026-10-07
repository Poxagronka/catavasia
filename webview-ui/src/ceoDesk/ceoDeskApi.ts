/**
 * Commands of the CEO desk (server/src/ceoDesk/ceoRoutes.ts). Every route needs
 * the server token. The chat itself streams over the `cat-ceo` cat session
 * socket (catSessionApi.subscribe).
 */

import {
  CEO_API_PREFIX,
  type CeoAttachment,
  type CeoAttachmentUpload,
  type CeoFolderCancelled,
  type CeoFolderResponse,
  type CeoFoldersResponse,
  type CeoStopResponse,
} from '../../../core/src/ceoDesk.js';
import { sessionToken } from '../sessionToken.js';

/** The literal session id of the CEO desk chat (server: CAT_CEO_ID). */
export const CEO_DESK_SESSION = 'cat-ceo';

async function call<T>(method: string, leaf: string, body?: unknown): Promise<T> {
  const query = sessionToken ? `?token=${encodeURIComponent(sessionToken)}` : '';
  const res = await fetch(`${CEO_API_PREFIX}/${leaf}${query}`, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      message = ((await res.json()) as { error?: string }).error ?? message;
    } catch {
      /* body was not JSON */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export const ceoDeskApi = {
  send: (text: string, attachments: CeoAttachmentUpload[] = []) =>
    call<{ ok: boolean; queued: number }>('POST', 'messages', {
      text,
      ...(attachments.length ? { attachments } : {}),
    }),
  /** Stop the turn; the queued user messages come back for the draft. */
  stop: () => call<CeoStopResponse>('POST', 'stop'),
  newChat: () => call<{ chatId: string }>('POST', 'new'),
  /** The office's project: an absolute folder, or null for the sandbox. */
  setFolder: (path: string | null) => call<CeoFolderResponse>('PUT', 'folder', { path }),
  folders: () => call<CeoFoldersResponse>('GET', 'folders'),
  /** The system folder window (the server opens it); waits until the user closes it. */
  pickFolder: () => call<CeoFolderResponse | CeoFolderCancelled>('POST', 'folder/pick'),
  /** A new project in ~/catavasia-projects/<name>, with version history. */
  newProject: (name: string) => call<CeoFolderResponse>('POST', 'folder/new', { name }),
  /** Turn on version history (git) for the current project. */
  startHistory: () => call<CeoFolderResponse>('POST', 'folder/history'),
  /** A stored file back as a File: Stop returns the queued files to the composer. */
  fetchAttachment: async (file: CeoAttachment): Promise<File> => {
    const query = sessionToken ? `?token=${encodeURIComponent(sessionToken)}` : '';
    const res = await fetch(`${file.url}${query}`);
    if (!res.ok) throw new Error(`${file.name}: ${res.status} ${res.statusText}`);
    const blob = await res.blob();
    return new File([blob], file.name, { type: blob.type });
  },
};
