/**
 * Pick what a plain `catavasia` run does: open the server that already runs
 * for this HOME, or start one on the default port (3100), or start one on an
 * OS-assigned port when another program holds the default port.
 */

import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';

import { MAX_PORT, MIN_PORT, SERVER_JSON_DIR, SERVERS_DIR } from '../constants.js';
import { isProcessRunning } from '../server.js';
import { isServerConfig, type ServerConfig } from '../serverConfig.js';

export const DEFAULT_PORT = 3100;

/** The default port: CATAVASIA_PORT when it is a valid port, else 3100. */
export function defaultPort(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env['CATAVASIA_PORT']);
  return Number.isInteger(n) && n >= MIN_PORT && n <= MAX_PORT ? n : DEFAULT_PORT;
}

/** Registry entries of this HOME whose process is alive. Read-only: the
 *  server prunes dead entries itself when it starts. */
export function readOwnServers(home: string = os.homedir()): ServerConfig[] {
  const dir = path.join(home, SERVER_JSON_DIR, SERVERS_DIR);
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  const live: ServerConfig[] = [];
  for (const file of files) {
    try {
      const entry = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')) as unknown;
      if (isServerConfig(entry) && isProcessRunning(entry.pid)) live.push(entry);
    } catch {
      // Mid-write or malformed entry: not a server to open.
    }
  }
  return live;
}

/** True when something accepts TCP connections on 127.0.0.1:port. */
export function isPortListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.setTimeout(1_000);
    const done = (result: boolean): void => {
      socket.destroy();
      resolve(result);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.once('timeout', () => done(false));
  });
}

/** True when this process can bind host:port right now. */
export function isPortFree(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, host, () => probe.close(() => resolve(true)));
  });
}

export function serverUrl(server: Pick<ServerConfig, 'port' | 'token'>): string {
  return `http://127.0.0.1:${server.port}/?token=${server.token}`;
}

export type LaunchPlan =
  { kind: 'open'; url: string } | { kind: 'start'; port: number | undefined; note?: string };

export interface PlanOptions {
  /** --port N, when the user gave one. */
  explicitPort?: number;
  defaultPort: number;
  host: string;
  servers: ServerConfig[];
  isListening?: (port: number) => Promise<boolean>;
  isFree?: (port: number, host: string) => Promise<boolean>;
}

export async function planLaunch(opts: PlanOptions): Promise<LaunchPlan> {
  const isListening = opts.isListening ?? isPortListening;
  const isFree = opts.isFree ?? isPortFree;
  const findOurs = async (port?: number): Promise<ServerConfig | undefined> => {
    for (const s of opts.servers) {
      if (s.servesSpa && (port === undefined || s.port === port) && (await isListening(s.port))) {
        return s;
      }
    }
    return undefined;
  };

  const target = opts.explicitPort ?? opts.defaultPort;
  const running = await findOurs(target);
  if (running) return { kind: 'open', url: serverUrl(running) };
  // An explicit port is a request for THAT port: a busy one fails with a clear error.
  if (opts.explicitPort !== undefined) return { kind: 'start', port: opts.explicitPort };
  if (await isFree(target, opts.host)) return { kind: 'start', port: target };
  const other = await findOurs();
  if (other) return { kind: 'open', url: serverUrl(other) };
  return {
    kind: 'start',
    port: undefined,
    note: `Port ${target} is busy (another program). Using a free port instead.`,
  };
}
