import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { openBrowser, openerCommand } from '../src/launch/openBrowser.js';
import { defaultPort, isPortFree, planLaunch, readOwnServers } from '../src/launch/portChoice.js';
import { isGlobalInstall, runPostinstall } from '../src/launch/postinstall.js';
import {
  createShortcut,
  launchCommand,
  LAUNCHER_MARKER,
  removeShortcut,
  shortcutFiles,
} from '../src/launch/shortcut.js';
import type { ServerConfig } from '../src/serverConfig.js';

const tmpDirs: string[] = [];
function tmpHome(withDesktop = true): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'catavasia-launch-'));
  tmpDirs.push(home);
  if (withDesktop) fs.mkdirSync(path.join(home, 'Desktop'));
  return home;
}
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function server(port: number, servesSpa = true): ServerConfig {
  return { port, pid: process.pid, token: `tok-${port}`, startedAt: 1, servesSpa, protocol: 1 };
}

describe('planLaunch', () => {
  const base = { defaultPort: 3100, host: '127.0.0.1' };

  it('starts on the default port when it is free', async () => {
    const plan = await planLaunch({ ...base, servers: [], isFree: async () => true });
    expect(plan).toEqual({ kind: 'start', port: 3100 });
  });

  it('opens our server when it already listens on the port', async () => {
    const plan = await planLaunch({
      ...base,
      servers: [server(3100)],
      isListening: async () => true,
      isFree: async () => false,
    });
    expect(plan).toEqual({ kind: 'open', url: 'http://127.0.0.1:3100/?token=tok-3100' });
  });

  it('ignores an embedded (VS Code) server and a registry entry with no listener', async () => {
    const plan = await planLaunch({
      ...base,
      servers: [server(3100, false), server(3100)],
      isListening: async () => false,
      isFree: async () => true,
    });
    expect(plan).toEqual({ kind: 'start', port: 3100 });
  });

  it('falls back to an OS-assigned port with a note when another program holds 3100', async () => {
    const plan = await planLaunch({ ...base, servers: [], isFree: async () => false });
    expect(plan.kind).toBe('start');
    expect(plan.kind === 'start' && plan.port).toBeUndefined();
    expect(plan.kind === 'start' && plan.note).toMatch(/Port 3100 is busy/);
  });

  it('opens our server on another port when 3100 is foreign-busy', async () => {
    const plan = await planLaunch({
      ...base,
      servers: [server(4200)],
      isListening: async () => true,
      isFree: async () => false,
    });
    expect(plan).toEqual({ kind: 'open', url: 'http://127.0.0.1:4200/?token=tok-4200' });
  });

  it('keeps an explicit --port even when it is busy (the server reports the clean error)', async () => {
    const isFree = vi.fn(async () => false);
    const plan = await planLaunch({ ...base, explicitPort: 5000, servers: [], isFree });
    expect(plan).toEqual({ kind: 'start', port: 5000 });
    expect(isFree).not.toHaveBeenCalled();
  });

  it('isPortFree sees a real listener', async () => {
    const blocker = net.createServer();
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
    const port = (blocker.address() as net.AddressInfo).port;
    try {
      expect(await isPortFree(port, '127.0.0.1')).toBe(false);
    } finally {
      blocker.close();
    }
  });

  it('defaultPort reads CATAVASIA_PORT and ignores junk', () => {
    expect(defaultPort({})).toBe(3100);
    expect(defaultPort({ CATAVASIA_PORT: '4567' })).toBe(4567);
    expect(defaultPort({ CATAVASIA_PORT: 'abc' })).toBe(3100);
  });

  it('readOwnServers reads live registry entries of a HOME', () => {
    const home = tmpHome(false);
    const dir = path.join(home, '.pixel-agents', 'servers');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `1-3100.json`), JSON.stringify(server(3100)));
    fs.writeFileSync(path.join(dir, 'bad.json'), '{');
    expect(readOwnServers(home).map((s) => s.port)).toEqual([3100]);
  });
});

describe('openBrowser', () => {
  const url = 'http://127.0.0.1:3100/?token=abc';

  it('uses the platform opener', () => {
    expect(openerCommand('darwin', url)).toEqual({ cmd: 'open', args: [url] });
    expect(openerCommand('linux', url)).toEqual({ cmd: 'xdg-open', args: [url] });
    expect(openerCommand('win32', url)).toEqual({ cmd: 'cmd', args: ['/c', 'start', '""', url] });
  });

  it('prints the URL instead of throwing when the opener is missing', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
    const spawnFn = vi.fn(() => child);
    openBrowser(url, 'linux', spawnFn as never);
    expect(spawnFn).toHaveBeenCalledWith(
      'xdg-open',
      [url],
      expect.objectContaining({ detached: true }),
    );
    child.emit('error', new Error('ENOENT'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining(url));
    const throwing = vi.fn(() => {
      throw new Error('spawn failed');
    });
    expect(() => openBrowser(url, 'darwin', throwing as never)).not.toThrow();
    log.mockRestore();
  });
});

describe('desktop launcher', () => {
  const globalRoot = '/usr/local/lib/node_modules/catavasia';

  it('runs the global npm bin, or node + dist/cli.js in a checkout', () => {
    expect(launchCommand({ platform: 'darwin', home: '/h', packageRoot: globalRoot })).toEqual([
      '/usr/local/bin/catavasia',
    ]);
    expect(
      launchCommand({
        platform: 'win32',
        home: 'C:\\Users\\a',
        packageRoot: 'C:\\npm\\node_modules\\catavasia',
      }),
    ).toEqual(['C:\\npm\\catavasia.cmd']);
    expect(
      launchCommand({ platform: 'linux', home: '/h', packageRoot: '/src/cat', execPath: '/n' }),
    ).toEqual(['/n', '/src/cat/dist/cli.js']);
  });

  it('macOS: ~/Desktop/catavasia.command execs the bin from ~', () => {
    const home = tmpHome();
    const [file] = createShortcut({ platform: 'darwin', home, packageRoot: globalRoot });
    expect(file).toBe(path.join(home, 'Desktop', 'catavasia.command'));
    const text = fs.readFileSync(file, 'utf-8');
    expect(text.startsWith('#!/bin/bash\n')).toBe(true);
    expect(text).toContain('cd ~ && exec "/usr/local/bin/catavasia"');
    expect(text).toContain(LAUNCHER_MARKER);
    expect(fs.statSync(file).mode & 0o777).toBe(0o755);
    // Idempotent: a second run gives the same single file.
    createShortcut({ platform: 'darwin', home, packageRoot: globalRoot });
    expect(fs.readdirSync(path.join(home, 'Desktop'))).toEqual(['catavasia.command']);
  });

  it('macOS without a Desktop folder creates nothing', () => {
    expect(
      createShortcut({ platform: 'darwin', home: tmpHome(false), packageRoot: globalRoot }),
    ).toEqual([]);
  });

  it('Linux: applications entry plus a Desktop copy, with Terminal and Icon', () => {
    const home = tmpHome();
    const files = createShortcut({ platform: 'linux', home, packageRoot: globalRoot });
    expect(files).toEqual([
      path.join(home, '.local', 'share', 'applications', 'catavasia.desktop'),
      path.join(home, 'Desktop', 'catavasia.desktop'),
    ]);
    const text = fs.readFileSync(files[0], 'utf-8');
    expect(text).toContain('Exec="/usr/local/bin/catavasia"');
    expect(text).toContain('Terminal=true');
    expect(text).toContain(`Icon=${globalRoot}/icon.png`);
  });

  it('Windows: Desktop\\catavasia.cmd calls the npm shim', () => {
    const [file] = shortcutFiles(
      { platform: 'win32', home: 'C:\\Users\\a', packageRoot: 'C:\\npm\\node_modules\\catavasia' },
      () => true,
    );
    expect(file.path).toBe('C:\\Users\\a\\Desktop\\catavasia.cmd');
    expect(file.content).toContain('call "C:\\npm\\catavasia.cmd"');
    expect(file.content).toContain(LAUNCHER_MARKER);
  });

  it('removes only our launchers (exact path + marker)', () => {
    const home = tmpHome();
    const ctx = { platform: 'linux' as const, home, packageRoot: globalRoot };
    const [appEntry, desktopCopy] = createShortcut(ctx);
    fs.writeFileSync(desktopCopy, '[Desktop Entry]\nName=someone else\n');
    expect(removeShortcut(ctx)).toEqual([appEntry]);
    expect(fs.existsSync(appEntry)).toBe(false);
    expect(fs.existsSync(desktopCopy)).toBe(true);
    expect(removeShortcut(ctx)).toEqual([]);
  });
});

describe('postinstall', () => {
  it('is gated on a global install', () => {
    expect(isGlobalInstall({ npm_config_global: 'true' })).toBe(true);
    expect(isGlobalInstall({ npm_config_location: 'global' })).toBe(true);
    expect(isGlobalInstall({})).toBe(false);
    expect(isGlobalInstall({ npm_config_global: 'false', npm_config_location: 'project' })).toBe(
      false,
    );
  });

  it('creates the launcher on a global install, nothing otherwise', () => {
    const lines: string[] = [];
    const opts = { platform: 'darwin' as const, packageRoot: '/p/lib/node_modules/catavasia' };
    const local = tmpHome();
    runPostinstall({ ...opts, env: {}, home: local, log: (l) => lines.push(l) });
    expect(fs.readdirSync(path.join(local, 'Desktop'))).toEqual([]);
    expect(lines).toEqual([]);

    const global = tmpHome();
    runPostinstall({
      ...opts,
      env: { npm_config_global: 'true' },
      home: global,
      log: (l) => lines.push(l),
    });
    expect(fs.readdirSync(path.join(global, 'Desktop'))).toEqual(['catavasia.command']);
    expect(lines).toHaveLength(1);
  });

  it('never throws', () => {
    const lines: string[] = [];
    const home = tmpHome();
    // A directory where the launcher file should go makes the write fail.
    fs.mkdirSync(path.join(home, 'Desktop', 'catavasia.command'));
    expect(() =>
      runPostinstall({
        env: { npm_config_global: 'true' },
        platform: 'darwin',
        home,
        packageRoot: '/p/lib/node_modules/catavasia',
        log: (l) => lines.push(l),
      }),
    ).not.toThrow();
    expect(lines[0]).toMatch(/could not create the launcher/);
  });
});
