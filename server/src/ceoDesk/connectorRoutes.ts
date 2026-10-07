/**
 * HTTP routes of the CEO dock's slash commands and Connectors card
 * (claudeControl.ts). Token-gated like every CEO route. They work in the
 * CEO's folder: the office's project, else the CEO's own folder (no project).
 * Connectors live in the user's Claude config: a change applies to every cat.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';

import {
  CEO_API_PREFIX,
  type CeoCommandsResponse,
  type CeoConnectorAddRequest,
  type CeoConnectorsResponse,
  type Connector,
  CONNECTOR_NAME_PATTERN,
} from '../../../core/src/ceoDesk.js';
import { EDIT_RIGHTS_HINT } from '../../../core/src/constants.js';
import { CAT_CEO_DIR } from '../constants.js';
import type { CeoDesk } from './ceoDesk.js';
import { ClaudeControl } from './claudeControl.js';

/** A server name as the SDK reports it ("claude.ai Gmail", "plugin:x:y"); never a flag. */
const SERVER_NAME = { type: 'string', pattern: '^[A-Za-z0-9][^\\u0000-\\u001f]{0,199}$' };

export function registerConnectorRoutes(
  app: FastifyInstance,
  desk: Pick<CeoDesk, 'folder'>,
  stateDir: string,
  isPrivileged: (req: FastifyRequest) => boolean,
  control = new ClaudeControl(),
): void {
  const onRequest = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isPrivileged(request)) return reply.code(401).send({ error: EDIT_RIGHTS_HINT });
  };
  const cwd = (): string => {
    if (desk.folder && fs.existsSync(desk.folder)) return desk.folder;
    const own = path.join(stateDir, CAT_CEO_DIR);
    fs.mkdirSync(own, { recursive: true });
    return own;
  };
  const answer = (connectors: Connector[]): CeoConnectorsResponse => ({
    connectors,
    project: desk.folder,
  });
  // Every failure is the CLI's own words, as a 400 the card shows.
  const attempt = async <T>(reply: FastifyReply, run: () => Promise<T>) => {
    try {
      return await run();
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  };

  app.get(`${CEO_API_PREFIX}/commands`, { onRequest }, async (_request, reply) =>
    attempt(reply, async (): Promise<CeoCommandsResponse> => ({
      commands: await control.commands(cwd()),
    })),
  );

  app.get(`${CEO_API_PREFIX}/connectors`, { onRequest }, async (_request, reply) =>
    attempt(reply, async () => answer(await control.connectors(cwd()))),
  );

  app.post<{ Body: CeoConnectorAddRequest }>(
    `${CEO_API_PREFIX}/connectors`,
    {
      onRequest,
      schema: {
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', pattern: CONNECTOR_NAME_PATTERN.source },
            target: { type: 'string', minLength: 1, maxLength: 2000, pattern: '\\S' },
            scope: { type: 'string', enum: ['user', 'local'] },
          },
          required: ['name', 'target', 'scope'],
        },
      },
    },
    async (request, reply) =>
      attempt(reply, async () => {
        await control.add(cwd(), request.body);
        return answer(await control.connectors(cwd()));
      }),
  );

  app.delete<{ Params: { name: string }; Querystring: { source?: string } }>(
    `${CEO_API_PREFIX}/connectors/:name`,
    {
      onRequest,
      schema: {
        params: { type: 'object', properties: { name: SERVER_NAME } },
        querystring: { type: 'object', properties: { source: { type: 'string' } } },
      },
    },
    async (request, reply) =>
      attempt(reply, async () => {
        await control.remove(cwd(), request.params.name, request.query.source ?? '');
        return answer(await control.connectors(cwd()));
      }),
  );

  // Off / on applies to the project (Claude Code keeps it per folder).
  app.post<{ Params: { name: string }; Body: { enabled: boolean } }>(
    `${CEO_API_PREFIX}/connectors/:name/toggle`,
    {
      onRequest,
      schema: {
        params: { type: 'object', properties: { name: SERVER_NAME } },
        body: {
          type: 'object',
          properties: { enabled: { type: 'boolean' } },
          required: ['enabled'],
        },
      },
    },
    async (request, reply) => {
      if (!desk.folder) return reply.code(400).send({ error: 'Pick a project first' });
      return attempt(reply, async () =>
        answer(await control.toggle(cwd(), request.params.name, request.body.enabled)),
      );
    },
  );

  // Opens the browser; the request waits until the user signed in (or gave up).
  app.post<{ Params: { name: string } }>(
    `${CEO_API_PREFIX}/connectors/:name/login`,
    { onRequest, schema: { params: { type: 'object', properties: { name: SERVER_NAME } } } },
    async (request, reply) =>
      attempt(reply, async () => {
        await control.login(cwd(), request.params.name);
        return answer(await control.connectors(cwd()));
      }),
  );
}
