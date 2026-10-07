/**
 * HTTP commands of the CEO desk. Every route needs the out-of-band token (the
 * Bearer token or the printed `?token=`): a CEO turn starts agents with no
 * permission prompts. The chat itself streams over the cat session socket of
 * `cat-ceo` (officeCatSource.ts).
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import * as fs from 'fs';

import {
  CEO_API_PREFIX,
  CEO_ATTACH_MAX_COUNT,
  type CeoApprovalAnswer,
  type CeoFolderRequest,
  type CeoFolderResponse,
  type CeoFoldersResponse,
  type CeoMessageRequest,
  type CeoNewProjectRequest,
  type CeoStopResponse,
} from '../../../core/src/ceoDesk.js';
import { EDIT_RIGHTS_HINT } from '../../../core/src/constants.js';
import { CEO_DESK_MESSAGE_BODY_LIMIT, TASK_PROMPT_MAX_CHARS } from '../constants.js';
import { inspectRepo, startHistory } from '../taskBoard/gitWorktree.js';
import { attachmentFile } from './attachments.js';
import type { CeoDesk } from './ceoDesk.js';
import { dialogCommand, openFolderDialog } from './folderDialog.js';
import { checkWorkFolder, newProjectPath } from './workFolder.js';

export function registerCeoRoutes(
  app: FastifyInstance,
  desk: CeoDesk,
  stateDir: string,
  isPrivileged: (req: FastifyRequest) => boolean,
): void {
  // Before body validation: an untokened caller learns nothing about the payload rules.
  const onRequest = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isPrivileged(request)) return reply.code(401).send({ error: EDIT_RIGHTS_HINT });
  };

  app.post<{ Body: CeoMessageRequest }>(
    `${CEO_API_PREFIX}/messages`,
    {
      onRequest,
      // Files travel as base64 JSON: 25 MB of files is about 34 MB of body.
      bodyLimit: CEO_DESK_MESSAGE_BODY_LIMIT,
      schema: {
        body: {
          type: 'object',
          properties: {
            text: { type: 'string', maxLength: TASK_PROMPT_MAX_CHARS },
            attachments: {
              type: 'array',
              maxItems: CEO_ATTACH_MAX_COUNT,
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', maxLength: 255 },
                  type: { type: 'string', maxLength: 255 },
                  data: { type: 'string' },
                },
                required: ['name', 'type', 'data'],
              },
            },
          },
          required: ['text'],
        },
      },
    },
    async (request, reply) => {
      const text = request.body.text.trim();
      const uploads = request.body.attachments ?? [];
      if (!text && !uploads.length) return reply.code(400).send({ error: 'Message is empty' });
      const files = desk.saveAttachments(uploads);
      if ('error' in files) return reply.code(400).send({ error: files.error });
      return reply.code(202).send({ ok: true, queued: desk.send(text, files) });
    },
  );

  // Thumbnails and downloads of attached files (the page adds `?token=`).
  app.get<{ Params: { chat: string; file: string } }>(
    `${CEO_API_PREFIX}/attachments/:chat/:file`,
    { onRequest },
    async (request, reply) => {
      const found = attachmentFile(stateDir, request.params.chat, request.params.file);
      if (!found) return reply.code(404).send({ error: 'No such attachment' });
      return reply
        .header('Content-Type', found.type)
        .header('X-Content-Type-Options', 'nosniff')
        .header('Cache-Control', 'private, max-age=86400')
        .send(fs.createReadStream(found.path));
    },
  );

  app.post(`${CEO_API_PREFIX}/stop`, { onRequest }, async (): Promise<CeoStopResponse> =>
    desk.stop(),
  );

  app.post(`${CEO_API_PREFIX}/new`, { onRequest }, async () => ({ chatId: desk.newChat() }));

  // The user's answer to an approval card (a cat or the CEO waits for it).
  app.post<{ Params: { id: string }; Body: CeoApprovalAnswer }>(
    `${CEO_API_PREFIX}/approvals/:id`,
    {
      onRequest,
      schema: {
        body: {
          type: 'object',
          properties: { answer: { type: 'string', enum: ['allow', 'always', 'deny'] } },
          required: ['answer'],
        },
      },
    },
    async (request, reply) =>
      desk.answerApproval(request.params.id, request.body.answer)
        ? { ok: true }
        : reply.code(404).send({ error: 'This question is no longer open' }),
  );

  // ── The office's project (the Project button of the bottom bar) ──

  const folderReply = async (folder: string | null): Promise<CeoFolderResponse> => ({
    folder,
    git: !!folder && (await inspectRepo(folder)) !== null,
  });
  const use = async (folder: string | null) => {
    desk.setFolder(folder);
    return folderReply(folder);
  };

  app.put<{ Body: CeoFolderRequest }>(
    `${CEO_API_PREFIX}/folder`,
    {
      onRequest,
      schema: {
        body: {
          type: 'object',
          properties: { path: { type: ['string', 'null'], maxLength: 4096 } },
          required: ['path'],
        },
      },
    },
    async (request, reply) => {
      const asked = request.body.path;
      if (asked === null || !asked.trim()) return use(null);
      const checked = checkWorkFolder(asked, stateDir);
      if (!checked.ok) return reply.code(400).send({ error: checked.error });
      return use(checked.path);
    },
  );

  // The system folder window. The request waits until the user closes it.
  app.post(`${CEO_API_PREFIX}/folder/pick`, { onRequest }, async (_request, reply) => {
    const cmd = dialogCommand();
    if (!cmd) return reply.code(400).send({ error: NO_WINDOW_TEXT });
    const picked = await openFolderDialog(cmd);
    if ('busy' in picked) return reply.code(409).send({ error: WINDOW_OPEN_TEXT });
    if ('cancelled' in picked) return picked;
    const checked = checkWorkFolder(picked.path, stateDir);
    if (!checked.ok) return reply.code(400).send({ error: checked.error });
    return use(checked.path);
  });

  // A new project: ~/catavasia-projects/<name> with version history (an existing one opens).
  app.post<{ Body: CeoNewProjectRequest }>(
    `${CEO_API_PREFIX}/folder/new`,
    {
      onRequest,
      schema: {
        body: {
          type: 'object',
          properties: { name: { type: 'string', maxLength: 255 } },
          required: ['name'],
        },
      },
    },
    async (request, reply) => {
      const target = newProjectPath(request.body.name);
      if (!target.ok) return reply.code(400).send({ error: target.error });
      try {
        fs.mkdirSync(target.path, { recursive: true });
        if (!(await inspectRepo(target.path))) await startHistory(target.path);
      } catch (err) {
        return reply.code(500).send({ error: `Could not make the project: ${errorText(err)}` });
      }
      const checked = checkWorkFolder(target.path, stateDir);
      if (!checked.ok) return reply.code(400).send({ error: checked.error });
      return use(checked.path);
    },
  );

  // Turn on version history (git) for the current project.
  app.post(`${CEO_API_PREFIX}/folder/history`, { onRequest }, async (_request, reply) => {
    const folder = desk.folder;
    if (!folder) return reply.code(400).send({ error: 'Pick a project first' });
    try {
      if (!(await inspectRepo(folder))) await startHistory(folder);
    } catch (err) {
      return reply
        .code(500)
        .send({ error: `Could not turn on version history: ${errorText(err)}` });
    }
    return folderReply(folder);
  });

  app.get(`${CEO_API_PREFIX}/folders`, { onRequest }, async (): Promise<CeoFoldersResponse> => ({
    ...(await folderReply(desk.folder)),
    recent: desk.recentFolders(),
    canPick: dialogCommand() !== null,
  }));
}

const NO_WINDOW_TEXT = 'This computer cannot show a folder window. Type the folder path instead.';
const WINDOW_OPEN_TEXT = 'The folder window is already open. Look for it on your screen.';

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
