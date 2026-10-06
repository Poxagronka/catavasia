/**
 * Office MCP server: the tools a cat uses to talk to its team, served over the
 * MCP Streamable HTTP transport (JSON responses only, no SSE stream).
 *
 * Every tool returns at once. Claude Code times out an HTTP MCP request after
 * 60 s, so a tool never waits for another cat: the message is queued and lands
 * in the target cat's next turn. The bearer token names the calling cat and
 * its task; the handler enforces the hierarchy.
 */

import type { FastifyInstance } from 'fastify';

import { OFFICE_MCP_PATH } from '../constants.js';

export interface OfficeToolResult {
  text: string;
  isError?: boolean;
}

export interface OfficeToolHandler {
  /** Whether a bearer token belongs to a cat of a live task. */
  knowsToken(token: string): boolean;
  callTool(token: string, name: string, args: Record<string, unknown>): OfficeToolResult;
}

const PROTOCOL_VERSION = '2025-06-18';
const ROUTE_BODY_LIMIT = 512 * 1024;

const str = (description: string) => ({ type: 'string', description });

export const OFFICE_TOOLS = [
  {
    name: 'brief',
    description:
      'Share your plan with your direct reports before you delegate. Only the cat that leads the task may brief.',
    inputSchema: {
      type: 'object',
      properties: { plan: str('The plan: who does what, and how the parts fit.') },
      required: ['plan'],
    },
  },
  {
    name: 'delegate',
    description:
      'Give a task to one of your direct reports. Returns at once; the report arrives later as a new message.',
    inputSchema: {
      type: 'object',
      properties: {
        to: str('Cat id of a direct report (see list_team).'),
        task: str('What to do, with every detail the cat needs.'),
      },
      required: ['to', 'task'],
    },
  },
  {
    name: 'ask',
    description:
      'Ask your lead, a direct report, or a sibling a question. Returns at once; the reply arrives later as a new message.',
    inputSchema: {
      type: 'object',
      properties: { to: str('Cat id.'), question: str('The question.') },
      required: ['to', 'question'],
    },
  },
  {
    name: 'reply',
    description: 'Answer a question another cat asked you.',
    inputSchema: {
      type: 'object',
      properties: { to: str('Cat id of the cat that asked.'), answer: str('The answer.') },
      required: ['to', 'answer'],
    },
  },
  {
    name: 'report',
    description:
      'Report the result of your task to your lead. The cat that leads the task reports the final result to the user. Call it once, when the work is done.',
    inputSchema: {
      type: 'object',
      properties: { result: str('What you did, what changed, and anything left open.') },
      required: ['result'],
    },
  },
  {
    name: 'list_team',
    description:
      'List the cats you can talk to: your lead, your direct reports, and your siblings.',
    inputSchema: { type: 'object', properties: {} },
  },
];

interface RpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

function rpcResult(id: RpcRequest['id'], result: unknown) {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(id: RpcRequest['id'], code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

/** Answer one JSON-RPC message, or undefined for a notification. */
export function handleRpc(
  req: RpcRequest,
  token: string,
  handler: OfficeToolHandler,
): Record<string, unknown> | undefined {
  if (req.id === undefined) return undefined; // notification (e.g. notifications/initialized)
  switch (req.method) {
    case 'initialize': {
      const asked = req.params?.protocolVersion;
      return rpcResult(req.id, {
        protocolVersion: typeof asked === 'string' ? asked : PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'catavasia-office', version: process.env.PIXEL_AGENTS_VERSION ?? '0' },
      });
    }
    case 'ping':
      return rpcResult(req.id, {});
    case 'tools/list':
      return rpcResult(req.id, { tools: OFFICE_TOOLS });
    case 'tools/call': {
      const name = req.params?.name;
      const args = req.params?.arguments;
      if (typeof name !== 'string') return rpcError(req.id, -32602, 'tools/call needs a name');
      const result = handler.callTool(
        token,
        name,
        args && typeof args === 'object' ? (args as Record<string, unknown>) : {},
      );
      return rpcResult(req.id, {
        content: [{ type: 'text', text: result.text }],
        isError: result.isError === true,
      });
    }
    default:
      return rpcError(req.id, -32601, `Method not found: ${String(req.method)}`);
  }
}

export function registerOfficeMcpRoute(app: FastifyInstance, handler: OfficeToolHandler): void {
  app.post(OFFICE_MCP_PATH, { bodyLimit: ROUTE_BODY_LIMIT }, async (request, reply) => {
    const auth = request.headers.authorization ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
    if (!token || !handler.knowsToken(token)) {
      return reply.code(401).send(rpcError(null, -32001, 'Unknown or expired office token'));
    }
    const body = request.body as RpcRequest | RpcRequest[] | undefined;
    if (!body || typeof body !== 'object') {
      return reply.code(400).send(rpcError(null, -32700, 'Parse error'));
    }
    if (Array.isArray(body)) {
      const answers = body.map((r) => handleRpc(r, token, handler)).filter(Boolean);
      return answers.length ? reply.send(answers) : reply.code(202).send();
    }
    const answer = handleRpc(body, token, handler);
    return answer ? reply.send(answer) : reply.code(202).send();
  });
  // No server-initiated stream: the transport allows 405 for GET.
  app.get(OFFICE_MCP_PATH, async (_request, reply) => reply.code(405).send());
  app.delete(OFFICE_MCP_PATH, async (_request, reply) => reply.code(405).send());
}
