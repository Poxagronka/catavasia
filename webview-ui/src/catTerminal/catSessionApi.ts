/**
 * Client side of the cat terminal: one contract, `catSessionApi`, for the chat
 * console and the "take the wheel" PTY. Today the server feeds it from the
 * task board; the orchestrator (phase 1) feeds the same endpoints later, so
 * this file does not change when it lands.
 */

import {
  CAT_SESSION_API_PREFIX,
  type CatSessionFrame,
  type CatSessionStatus,
  type WheelClientFrame,
  type WheelServerFrame,
} from '../../../core/src/catSession.js';
import { ENGINE_API_PREFIX } from '../../../core/src/constants.js';
import { sessionToken } from '../sessionToken.js';
import { wheelBlocker } from './consoleState.js';

export interface WheelHandlers {
  onOutput(data: string): void;
  onExit(exitCode: number): void;
  /** The server refused or failed: no PTY module, cat busy, bad token... */
  onError(message: string): void;
  onClose(): void;
}

export interface WheelConnection {
  write(data: string): void;
  resize(cols: number, rows: number): void;
}

export interface CatSessionApi {
  /** Live session frames for one cat (snapshot first). Returns unsubscribe.
   *  `onGone` fires when the server has no session for the cat (final). */
  subscribe(
    catId: string,
    onEvent: (frame: CatSessionFrame) => void,
    onGone?: (reason: string) => void,
  ): () => void;
  /** Send the cat a message. Rejects with the server's error text. */
  send(catId: string, text: string): Promise<void>;
  /** Whether the last known status allows the wheel (the server checks again). */
  canTakeWheel(catId: string): boolean;
  /** Open the interactive `claude --resume` PTY. */
  takeWheel(catId: string, size: { cols: number; rows: number }, h: WheelHandlers): WheelConnection;
  /** Close the PTY: the server ends the process and frees the session. */
  releaseWheel(catId: string): void;
  /** Open an engine's login flow (`claude auth login`, `codex login`) in a PTY. */
  openLogin(
    engine: string,
    size: { cols: number; rows: number },
    h: WheelHandlers,
  ): WheelConnection & { close(): void };
}

const RECONNECT_MS = 1500;

function wsUrl(path: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${path}`;
}

/** One PTY socket: output, exit and error frames in; input and resize frames out. */
function openPty(
  url: string,
  h: WheelHandlers,
  onClosed: (socket: WebSocket) => void,
): { socket: WebSocket; connection: WheelConnection } {
  const socket = new WebSocket(wsUrl(url));
  socket.onmessage = (event: MessageEvent) => {
    const frame = JSON.parse(String(event.data)) as WheelServerFrame;
    if (frame.type === 'output') h.onOutput(frame.data);
    else if (frame.type === 'exit') h.onExit(frame.exitCode);
    else h.onError(frame.message);
  };
  socket.onclose = () => {
    onClosed(socket);
    h.onClose();
  };
  const sendFrame = (frame: WheelClientFrame) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame));
  };
  return {
    socket,
    connection: {
      write: (data) => sendFrame({ type: 'input', data }),
      resize: (cols, rows) => sendFrame({ type: 'resize', cols, rows }),
    },
  };
}

function ptyQuery(size: { cols: number; rows: number }): string {
  return `token=${encodeURIComponent(sessionToken ?? '')}&cols=${size.cols}&rows=${size.rows}`;
}

function catPath(catId: string, leaf: string): string {
  return `${CAT_SESSION_API_PREFIX}/${encodeURIComponent(catId)}/${leaf}`;
}

function createCatSessionApi(): CatSessionApi {
  const lastStatus = new Map<string, CatSessionStatus>();
  const wheels = new Map<string, WebSocket>();

  return {
    subscribe(catId, onEvent, onGone) {
      let socket: WebSocket | null = null;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let disposed = false;
      const open = () => {
        socket = new WebSocket(wsUrl(catPath(catId, 'events')));
        socket.onmessage = (event: MessageEvent) => {
          const frame = JSON.parse(String(event.data)) as CatSessionFrame;
          if (frame.type !== 'entries') lastStatus.set(catId, frame.status);
          onEvent(frame);
        };
        socket.onclose = (event: CloseEvent) => {
          if (disposed) return;
          // 4xxx = final (no such cat, forbidden); anything else is a network drop.
          if (event.code >= 4000 && event.code < 5000) {
            onGone?.(event.reason);
            return;
          }
          timer = setTimeout(open, RECONNECT_MS);
        };
      };
      open();
      return () => {
        disposed = true;
        if (timer) clearTimeout(timer);
        socket?.close();
      };
    },

    async send(catId, text) {
      const query = sessionToken ? `?token=${encodeURIComponent(sessionToken)}` : '';
      const res = await fetch(`${catPath(catId, 'messages')}${query}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
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
    },

    canTakeWheel(catId) {
      const status = lastStatus.get(catId);
      return status !== undefined && wheelBlocker(status, !!sessionToken) === null;
    },

    takeWheel(catId, size, h) {
      wheels.get(catId)?.close();
      const { socket, connection } = openPty(
        `${catPath(catId, 'terminal')}?${ptyQuery(size)}`,
        h,
        (closed) => {
          if (wheels.get(catId) === closed) wheels.delete(catId);
        },
      );
      wheels.set(catId, socket);
      return connection;
    },

    openLogin(engine, size, h) {
      const url = `${ENGINE_API_PREFIX}/${encodeURIComponent(engine)}/login?${ptyQuery(size)}`;
      const { socket, connection } = openPty(url, h, () => {});
      return { ...connection, close: () => socket.close() };
    },

    releaseWheel(catId) {
      wheels.get(catId)?.close();
      wheels.delete(catId);
    },
  };
}

export const catSessionApi: CatSessionApi = createCatSessionApi();
