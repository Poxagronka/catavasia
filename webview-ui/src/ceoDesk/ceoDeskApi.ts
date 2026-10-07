/**
 * Commands of the CEO desk (server/src/ceoDesk/ceoRoutes.ts). Every route needs
 * the server token. The chat itself streams over the `cat-ceo` cat session
 * socket (catSessionApi.subscribe).
 */

import {
  CEO_API_PREFIX,
  type CeoApprovalAnswer,
  type CeoAttachment,
  type CeoAttachmentUpload,
  type CeoChatsResponse,
  type CeoCommandsResponse,
  type CeoConnectorAddRequest,
  type CeoConnectorsResponse,
  type CeoFilesResponse,
  type CeoFolderCancelled,
  type CeoFolderResponse,
  type CeoFoldersResponse,
  type CeoStopResponse,
} from '../../../core/src/ceoDesk.js';
import { sessionToken } from '../sessionToken.js';

/** The literal session id of the CEO desk chat (server: CAT_CEO_ID). */
export const CEO_DESK_SESSION = 'cat-ceo';

async function call<T>(method: string, leaf: string, body?: unknown, params = ''): Promise<T> {
  const parts = [params, sessionToken ? `token=${encodeURIComponent(sessionToken)}` : ''];
  const query = parts.some(Boolean) ? `?${parts.filter(Boolean).join('&')}` : '';
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
  /** Stop one background task of the CEO session (a command or a helper); the turn goes on. */
  stopTask: (id: string) => call<{ ok: boolean }>('POST', `tasks/${encodeURIComponent(id)}/stop`),
  newChat: () => call<{ chatId: string }>('POST', 'new'),
  /** Every chat with a message, newest first (the chat title menu). */
  chats: () => call<CeoChatsResponse>('GET', 'chats'),
  /** Open a chat: the server archives the open one (its running answer stops). */
  openChat: (id: string) => call<{ ok: boolean }>('POST', `chats/${encodeURIComponent(id)}/open`),
  renameChat: (id: string, title: string) =>
    call<{ ok: boolean }>('PUT', `chats/${encodeURIComponent(id)}`, { title }),
  deleteChat: (id: string) => call<{ ok: boolean }>('DELETE', `chats/${encodeURIComponent(id)}`),
  /** The user's answer to an approval card (a cat or the CEO waits for it). */
  answerApproval: (id: string, body: CeoApprovalAnswer) =>
    call<{ ok: boolean }>('POST', `approvals/${encodeURIComponent(id)}`, body),
  /** Files of the chat's folder for an `@` mention, best match first. */
  files: (query: string) =>
    call<CeoFilesResponse>('GET', 'files', undefined, `q=${encodeURIComponent(query)}`),
  /** The office's project: an absolute folder, or null for the sandbox. */
  setFolder: (path: string | null) => call<CeoFolderResponse>('PUT', 'folder', { path }),
  folders: () => call<CeoFoldersResponse>('GET', 'folders'),
  /** The system folder window (the server opens it); waits until the user closes it. */
  pickFolder: () => call<CeoFolderResponse | CeoFolderCancelled>('POST', 'folder/pick'),
  /** A new project in ~/catavasia-projects/<name>, with version history. */
  newProject: (name: string) => call<CeoFolderResponse>('POST', 'folder/new', { name }),
  /** Turn on version history (git) for the current project. */
  startHistory: () => call<CeoFolderResponse>('POST', 'folder/history'),
  /** Claude Code's slash commands in the CEO's folder. */
  commands: () => call<CeoCommandsResponse>('GET', 'commands'),
  /** Connectors (MCP servers) of Claude Code, shared by every cat; each change answers the new list. */
  connectors: () => call<CeoConnectorsResponse>('GET', 'connectors'),
  addConnector: (req: CeoConnectorAddRequest) =>
    call<CeoConnectorsResponse>('POST', 'connectors', req),
  removeConnector: (name: string, source: string) =>
    call<CeoConnectorsResponse>(
      'DELETE',
      `connectors/${encodeURIComponent(name)}`,
      undefined,
      `source=${encodeURIComponent(source)}`,
    ),
  toggleConnector: (name: string, enabled: boolean) =>
    call<CeoConnectorsResponse>('POST', `connectors/${encodeURIComponent(name)}/toggle`, {
      enabled,
    }),
  /** Opens the browser; resolves when the user signed in. */
  signIn: (name: string) =>
    call<CeoConnectorsResponse>('POST', `connectors/${encodeURIComponent(name)}/login`),
  /** A stored file back as a File: Stop returns the queued files to the composer. */
  fetchAttachment: async (file: CeoAttachment): Promise<File> => {
    const query = sessionToken ? `?token=${encodeURIComponent(sessionToken)}` : '';
    const res = await fetch(`${file.url}${query}`);
    if (!res.ok) throw new Error(`${file.name}: ${res.status} ${res.statusText}`);
    const blob = await res.blob();
    return new File([blob], file.name, { type: blob.type });
  },
};
