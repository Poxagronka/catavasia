import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Isolated temp HOME: the server writes ~/.pixel-agents/{server.json,servers/}.
let tmpBase: string;

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return { ...actual, homedir: () => tmpBase };
});

const { PixelAgentsServer } = await import('../src/server.js');
const { AgentStateStore } = await import('../src/agentStateStore.js');
const { UpdateChecker } = await import('../src/update/updateChecker.js');
const { UpdateRunner } = await import('../src/update/updateRunner.js');

const TOKEN = 'kept-token-0123456789abcdef';

let server: InstanceType<typeof PixelAgentsServer>;
let busy: string | undefined;

beforeEach(() => {
  tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-update-routes-'));
  server = new PixelAgentsServer();
  busy = undefined;
});

afterEach(() => {
  server.stop();
  fs.rmSync(tmpBase, { recursive: true, force: true });
});

async function startServer(token?: string) {
  let autoCheck = true;
  const update = {
    checker: new UpdateChecker({
      currentVersion: '1.4.1-cats.9',
      branch: 'main',
      getAutoCheck: () => autoCheck,
      setAutoCheck: (on) => (autoCheck = on),
      fetch: async () => new Response(JSON.stringify({ version: '1.4.1-cats.10' })),
    }),
    runner: new UpdateRunner({
      updateDir: path.join(tmpBase, 'update'),
      repoUrl: 'https://github.com/Poxagronka/catavasia.git',
      branch: 'main',
      busyReason: () => busy,
      restart: () => {},
      run: async () => {
        throw new Error('not in this test');
      },
    }),
  };
  const config = await server.start({
    store: new AgentStateStore(),
    embedded: false,
    update,
    token,
  });
  const base = `http://127.0.0.1:${config.port}`;
  return { config, base, update };
}

describe('self-update token handover', () => {
  it('keeps a handed-over token across a restart', async () => {
    const { config } = await startServer(TOKEN);
    expect(config.token).toBe(TOKEN);
    const record = JSON.parse(
      fs.readFileSync(
        path.join(tmpBase, '.pixel-agents', 'servers', `${process.pid}-${config.port}.json`),
        'utf-8',
      ),
    ) as { token: string };
    expect(record.token).toBe(TOKEN);
  });

  it('makes a fresh token on a normal start', async () => {
    const { config } = await startServer();
    expect(config.token).not.toBe(TOKEN);
    expect(config.token.length).toBeGreaterThan(16);
  });
});

describe('/api/update routes', () => {
  it('need the server token', async () => {
    const { base } = await startServer(TOKEN);
    expect((await fetch(`${base}/api/update`)).status).toBe(401);
    expect((await fetch(`${base}/api/update/start`, { method: 'POST' })).status).toBe(401);
    expect((await fetch(`${base}/api/update?token=wrong`)).status).toBe(401);
    expect((await fetch(`${base}/api/update?token=${TOKEN}`)).status).toBe(200);
    const bearer = await fetch(`${base}/api/update/check`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(bearer.status).toBe(200);
    expect(((await bearer.json()) as { available: boolean }).available).toBe(true);
  });

  it('refuse to start while cats work, with the reason', async () => {
    const { base } = await startServer(TOKEN);
    busy = 'Cats are working on "x". Update when the tasks finish.';
    const res = await fetch(`${base}/api/update/start?token=${TOKEN}`, { method: 'POST' });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe(busy);
  });

  it('toggle auto-check and remember "Later"', async () => {
    const { base } = await startServer(TOKEN);
    const post = (route: string, body: unknown) =>
      fetch(`${base}/api/update/${route}?token=${TOKEN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    const off = (await (await post('settings', { autoCheck: false })).json()) as {
      autoCheck: boolean;
    };
    expect(off.autoCheck).toBe(false);
    expect((await post('settings', { autoCheck: 'no' })).status).toBe(400);
    const later = (await (await post('dismiss', { version: '1.4.1-cats.10' })).json()) as {
      dismissedVersion: string;
    };
    expect(later.dismissedVersion).toBe('1.4.1-cats.10');
  });

  it('health reports the running version for the reload poll', async () => {
    const { base } = await startServer(TOKEN);
    const health = (await (await fetch(`${base}/api/health`)).json()) as { version?: string };
    expect(health).toHaveProperty('version');
  });
});
