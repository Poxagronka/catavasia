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
  type CeoFolderRequest,
  type CeoFoldersResponse,
  type CeoMessageRequest,
  type CeoStopResponse,
} from '../../../core/src/ceoDesk.js';
import { EDIT_RIGHTS_HINT } from '../../../core/src/constants.js';
import { CEO_DESK_MESSAGE_BODY_LIMIT, TASK_PROMPT_MAX_CHARS } from '../constants.js';
import { attachmentFile } from './attachments.js';
import type { CeoDesk } from './ceoDesk.js';
import { checkWorkFolder } from './workFolder.js';

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
      if (asked === null || !asked.trim()) {
        desk.setFolder(null);
        return { folder: null };
      }
      const checked = checkWorkFolder(asked, stateDir);
      if (!checked.ok) return reply.code(400).send({ error: checked.error });
      desk.setFolder(checked.path);
      return { folder: checked.path };
    },
  );

  app.get(`${CEO_API_PREFIX}/folders`, { onRequest }, async (): Promise<CeoFoldersResponse> => ({
    folder: desk.folder,
    recent: desk.recentFolders(),
  }));
}
