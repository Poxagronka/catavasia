/**
 * Cat terminal routes (standalone only):
 *
 *   WS   /api/cat-sessions/:catId/events    snapshot, then live entries + status
 *   POST /api/cat-sessions/:catId/messages  { text } -> a new turn       [token]
 *   WS   /api/cat-sessions/:catId/terminal  "take the wheel" PTY          [token]
 *   WS   /api/engines/:engine/login         the engine's login flow PTY   [token]
 *
 * SECURITY: a message starts a turn with NO permission prompts and the wheel
 * pipes keystrokes into a real process. Both need the same out-of-band server
 * token as POST /api/tasks (`?token=` or Bearer). Reading the events needs a
 * same-origin handshake only, like the task board read routes, except for a
 * session whose source says it needs the token (the CEO desk: job reports and
 * project folders).
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import * as os from 'os';

import {
  CAT_SESSION_API_PREFIX,
  CAT_WS_CLOSE_BUSY,
  CAT_WS_CLOSE_NOT_FOUND,
  CAT_WS_CLOSE_UNAUTHORIZED,
  type CatSessionFrame,
  type WheelClientFrame,
  type WheelServerFrame,
} from '../../../core/src/catSession.js';
import { EDIT_RIGHTS_HINT, ENGINE_API_PREFIX } from '../../../core/src/constants.js';
import { claudeProvider } from '../providers/index.js';
import { CatSessionError, type CatSessionSource } from './catSessionSource.js';
import type { PtyModuleResolution } from './ptyModule.js';

/** Longest message the console accepts (same order as a task prompt). */
const MESSAGE_MAX_CHARS = 100_000;
const TERM_NAME = 'xterm-256color';
const DEFAULT_COLS = 100;
const DEFAULT_ROWS = 30;
const WS_OPEN = 1;

export interface CatTerminalRoutesOptions {
  source: CatSessionSource;
  /** The request carries the server token (Bearer or `?token=`). */
  isPrivileged: (request: FastifyRequest) => boolean;
  /** The WebSocket handshake is same-origin (or has no Origin). */
  isSameOrigin: (request: FastifyRequest) => boolean;
  /** Lazy PTY module resolution (tests inject a fake). */
  pty: () => PtyModuleResolution;
  /** CLI binary override (tests). Default: the provider's launch command. */
  claudeBin?: string;
  /** Engine login: the command per engine, and a hook when the login process ends (re-probe). */
  engineLogin?: {
    command(engine: string): { command: string; args: string[] } | undefined;
    ended(engine: string): void;
  };
}

interface CatSocket {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: 'message', listener: (data: Buffer | string) => void): void;
  on(event: 'close', listener: () => void): void;
}

type CatParams = { Params: { catId: string } };
const catParamsSchema = {
  params: {
    type: 'object',
    properties: { catId: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,64}$' } },
    required: ['catId'],
  },
};

function sendJson(socket: CatSocket, frame: CatSessionFrame | WheelServerFrame): void {
  if (socket.readyState === WS_OPEN) socket.send(JSON.stringify(frame));
}

export function registerCatTerminalRoutes(
  app: FastifyInstance,
  options: CatTerminalRoutesOptions,
): void {
  const { source } = options;
  if (options.engineLogin) registerEngineLoginRoute(app, options, options.engineLogin);

  /** Status with the PTY verdict folded in: no module means no wheel. */
  const withPty = (frame: CatSessionFrame): CatSessionFrame => {
    if (frame.type !== 'snapshot' && frame.type !== 'status') return frame;
    const reason = frame.status.wheelUnavailable ?? ptyReason(options);
    return { ...frame, status: { ...frame.status, wheelUnavailable: reason } };
  };

  app.get<CatParams>(
    `${CAT_SESSION_API_PREFIX}/:catId/events`,
    { websocket: true, schema: catParamsSchema },
    (socket: CatSocket, request) => {
      if (!options.isSameOrigin(request)) {
        socket.close(CAT_WS_CLOSE_UNAUTHORIZED, 'forbidden origin');
        return;
      }
      const { catId } = request.params;
      if (source.needsToken?.(catId) && !options.isPrivileged(request)) {
        socket.close(CAT_WS_CLOSE_UNAUTHORIZED, 'token required');
        return;
      }
      const snapshot = source.snapshot(catId);
      if (!snapshot) {
        socket.close(CAT_WS_CLOSE_NOT_FOUND, 'no session for this cat');
        return;
      }
      sendJson(socket, withPty({ type: 'snapshot', ...snapshot }));
      const off = source.subscribe(catId, (frame) => sendJson(socket, withPty(frame)));
      socket.on('close', off);
    },
  );

  app.post<CatParams & { Body: { text: string } }>(
    `${CAT_SESSION_API_PREFIX}/:catId/messages`,
    {
      // Before body validation: an untokened caller learns nothing about the payload rules.
      onRequest: async (request, reply) => {
        if (!options.isPrivileged(request)) {
          return reply.code(401).send({ error: EDIT_RIGHTS_HINT });
        }
      },
      schema: {
        ...catParamsSchema,
        body: {
          type: 'object',
          properties: { text: { type: 'string', minLength: 1, maxLength: MESSAGE_MAX_CHARS } },
          required: ['text'],
        },
      },
    },
    async (request, reply) => {
      const text = request.body.text.trim();
      if (!text) return reply.code(400).send({ error: 'Message is empty' });
      try {
        await source.send(request.params.catId, text);
        return reply.code(202).send({ ok: true });
      } catch (err) {
        if (err instanceof CatSessionError)
          return reply.code(err.code).send({ error: err.message });
        throw err;
      }
    },
  );

  app.get<CatParams & { Querystring: { cols?: string; rows?: string } }>(
    `${CAT_SESSION_API_PREFIX}/:catId/terminal`,
    { websocket: true, schema: catParamsSchema },
    (socket: CatSocket, request) => {
      if (!options.isPrivileged(request) || !options.isSameOrigin(request)) {
        socket.close(CAT_WS_CLOSE_UNAUTHORIZED, 'unauthorized');
        return;
      }
      const { module } = options.pty();
      if (!module) {
        sendJson(socket, { type: 'error', message: ptyReason(options) ?? 'No PTY module' });
        socket.close(CAT_WS_CLOSE_NOT_FOUND, 'no pty');
        return;
      }
      const { catId } = request.params;
      const cols = clampDimension(request.query.cols, DEFAULT_COLS);
      const rows = clampDimension(request.query.rows, DEFAULT_ROWS);

      // Messages that arrive while the lock and worktree are prepared are dropped:
      // the client sends nothing before the first output frame.
      let onInput: (frame: WheelClientFrame) => void = () => {};
      let closed = false;
      let stop: () => void = () => {};
      socket.on('message', (raw) => {
        const frame = parseClientFrame(raw.toString());
        if (frame) onInput(frame);
      });
      socket.on('close', () => {
        closed = true;
        stop();
      });

      void source.beginWheel(catId).then(
        ({ sessionId, cwd, launch: engineLaunch }) => {
          let pty;
          try {
            const env: Record<string, string> = {};
            for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
            let command: string;
            let args: string[];
            if (engineLaunch) {
              ({ command, args } = engineLaunch);
            } else {
              const launch = claudeProvider.buildLaunchCommand!(sessionId, cwd);
              args = launch.args.map((a) => (a === '--session-id' ? '--resume' : a));
              command = options.claudeBin ?? launch.command;
              Object.assign(env, launch.env);
            }
            env.TERM = TERM_NAME;
            pty = module.spawn(command, args, {
              name: TERM_NAME,
              cols,
              rows,
              cwd,
              env,
            });
          } catch (err) {
            sendJson(socket, { type: 'error', message: `Could not start the CLI: ${String(err)}` });
            socket.close(CAT_WS_CLOSE_BUSY, 'spawn failed');
            void source.endWheel(catId);
            return;
          }
          const live = pty;
          let exited = false;
          live.onData((data) => sendJson(socket, { type: 'output', data }));
          live.onExit(({ exitCode }) => {
            exited = true;
            sendJson(socket, { type: 'exit', exitCode });
            socket.close(1000, 'exited');
            void source.endWheel(catId);
          });
          onInput = (frame) => {
            if (frame.type === 'input') live.write(frame.data);
            else live.resize(frame.cols, frame.rows);
          };
          // The user closed the tab: end the interactive session, then release.
          stop = () => {
            if (exited) return;
            try {
              live.kill();
            } catch {
              // Already gone.
            }
          };
          if (closed) stop();
        },
        (err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          sendJson(socket, { type: 'error', message });
          const code =
            err instanceof CatSessionError && err.code === 404
              ? CAT_WS_CLOSE_NOT_FOUND
              : CAT_WS_CLOSE_BUSY;
          socket.close(code, 'wheel refused');
        },
      );
    },
  );
}

/** WS /api/engines/:engine/login: `claude auth login` / `codex login` in a PTY, for the browser login. */
function registerEngineLoginRoute(
  app: FastifyInstance,
  options: CatTerminalRoutesOptions,
  login: NonNullable<CatTerminalRoutesOptions['engineLogin']>,
): void {
  app.get<{ Params: { engine: string }; Querystring: { cols?: string; rows?: string } }>(
    `${ENGINE_API_PREFIX}/:engine/login`,
    { websocket: true },
    (socket: CatSocket, request) => {
      if (!options.isPrivileged(request) || !options.isSameOrigin(request)) {
        socket.close(CAT_WS_CLOSE_UNAUTHORIZED, 'unauthorized');
        return;
      }
      const { engine } = request.params;
      const launch = login.command(engine);
      const { module } = options.pty();
      if (!launch || !module) {
        const message = launch
          ? (ptyReason(options) ?? 'No PTY module')
          : `Unknown engine ${engine}`;
        sendJson(socket, { type: 'error', message });
        socket.close(CAT_WS_CLOSE_NOT_FOUND, 'no login');
        return;
      }
      const env: Record<string, string> = {};
      for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
      env.TERM = TERM_NAME;
      let pty;
      try {
        pty = module.spawn(launch.command, launch.args, {
          name: TERM_NAME,
          cols: clampDimension(request.query.cols, DEFAULT_COLS),
          rows: clampDimension(request.query.rows, DEFAULT_ROWS),
          cwd: os.homedir(),
          env,
        });
      } catch (err) {
        sendJson(socket, {
          type: 'error',
          message: `Could not start ${launch.command}: ${String(err)}`,
        });
        socket.close(CAT_WS_CLOSE_BUSY, 'spawn failed');
        return;
      }
      const live = pty;
      let exited = false;
      // Once per login: the process exit and the tab close both end it.
      const end = () => {
        if (exited) return;
        exited = true;
        login.ended(engine);
      };
      live.onData((data) => sendJson(socket, { type: 'output', data }));
      live.onExit(({ exitCode }) => {
        sendJson(socket, { type: 'exit', exitCode });
        socket.close(1000, 'exited');
        end();
      });
      socket.on('message', (raw) => {
        const frame = parseClientFrame(raw.toString());
        if (frame?.type === 'input') live.write(frame.data);
        else if (frame) live.resize(frame.cols, frame.rows);
      });
      socket.on('close', () => {
        if (exited) return;
        try {
          live.kill();
        } catch {
          // Already gone.
        }
        end();
      });
    },
  );
}

function ptyReason(options: CatTerminalRoutesOptions): string | undefined {
  return options.pty().reason ?? undefined;
}

function clampDimension(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n <= 1000 ? n : fallback;
}

/** Parse a client frame; malformed or unknown frames are ignored. Exported for tests. */
export function parseClientFrame(raw: string): WheelClientFrame | null {
  try {
    const f = JSON.parse(raw) as Partial<WheelClientFrame> & Record<string, unknown>;
    if (f.type === 'input' && typeof f.data === 'string') return { type: 'input', data: f.data };
    if (f.type === 'resize') {
      const cols = clampDimension(String(f.cols), 0);
      const rows = clampDimension(String(f.rows), 0);
      if (cols && rows) return { type: 'resize', cols, rows };
    }
  } catch {
    // Not JSON.
  }
  return null;
}
