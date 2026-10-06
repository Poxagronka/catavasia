/**
 * Self-update HTTP API (standalone). Every route needs the server token
 * (Bearer or `?token=`): installing software is the most privileged action
 * the server has, and the status carries local paths.
 *
 *   GET  /api/update            status: check state + install run state
 *   POST /api/update/check      check now
 *   POST /api/update/start      install the branch build (409 with a reason when refused)
 *   POST /api/update/settings   { autoCheck: boolean }
 *   POST /api/update/dismiss    { version } ("Later" until a newer version or a restart)
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { UpdateStatus } from '../../../core/src/selfUpdate.js';
import type { UpdateChecker } from './updateChecker.js';
import type { UpdateRunner } from './updateRunner.js';

export interface SelfUpdate {
  checker: UpdateChecker;
  runner: UpdateRunner;
}

function status({ checker, runner }: SelfUpdate): UpdateStatus {
  return { ...checker.state(), run: runner.state(), serverPid: process.pid };
}

export function registerUpdateRoutes(
  app: FastifyInstance,
  update: SelfUpdate,
  isPrivileged: (req: FastifyRequest) => boolean,
): void {
  const onRequest = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isPrivileged(request)) {
      return reply.code(401).send({ error: 'A valid session token is required' });
    }
  };

  app.get('/api/update', { onRequest }, async () => status(update));

  // A manual check also takes back "Later": the user asked to see the offer.
  app.post('/api/update/check', { onRequest }, async () => {
    update.checker.dismiss(undefined);
    await update.checker.check();
    return status(update);
  });

  app.post('/api/update/start', { onRequest }, async (_request, reply) => {
    const result = update.runner.start();
    if (!result.ok) return reply.code(409).send({ error: result.reason });
    return reply.code(202).send(status(update));
  });

  app.post<{ Body: { autoCheck: boolean } }>(
    '/api/update/settings',
    {
      onRequest,
      schema: {
        body: {
          type: 'object',
          properties: { autoCheck: { type: 'boolean' } },
          required: ['autoCheck'],
        },
      },
    },
    async (request) => {
      update.checker.setAutoCheck(request.body.autoCheck);
      return status(update);
    },
  );

  app.post<{ Body: { version: string } }>(
    '/api/update/dismiss',
    {
      onRequest,
      schema: {
        body: {
          type: 'object',
          properties: { version: { type: 'string', minLength: 1, maxLength: 64 } },
          required: ['version'],
        },
      },
    },
    async (request) => {
      update.checker.dismiss(request.body.version);
      return status(update);
    },
  );
}
