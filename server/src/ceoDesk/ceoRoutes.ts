/**
 * HTTP commands of the CEO desk. Every route needs the out-of-band token (the
 * Bearer token or the printed `?token=`): a CEO turn starts agents with no
 * permission prompts. The chat itself streams over the cat session socket of
 * `cat-ceo` (officeCatSource.ts).
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
  CEO_API_PREFIX,
  type CeoFolderRequest,
  type CeoFoldersResponse,
  type CeoMessageRequest,
  type CeoStopResponse,
} from '../../../core/src/ceoDesk.js';
import { EDIT_RIGHTS_HINT } from '../../../core/src/constants.js';
import { TASK_PROMPT_MAX_CHARS } from '../constants.js';
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
      schema: {
        body: {
          type: 'object',
          properties: { text: { type: 'string', minLength: 1, maxLength: TASK_PROMPT_MAX_CHARS } },
          required: ['text'],
        },
      },
    },
    async (request, reply) => {
      const text = request.body.text.trim();
      if (!text) return reply.code(400).send({ error: 'Message is empty' });
      return reply.code(202).send({ ok: true, queued: desk.send(text) });
    },
  );

  app.post(`${CEO_API_PREFIX}/stop`, { onRequest }, async (): Promise<CeoStopResponse> => ({
    draft: desk.stop(),
  }));

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
