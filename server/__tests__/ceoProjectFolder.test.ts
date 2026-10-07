/**
 * The office's project folder (the Project button of the bottom bar): the
 * system folder window per platform, cancel, one window at a time, the
 * token-gated routes, a new project with version history, and the CEO
 * persona that points the user to the button.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { deskPersona } from '../src/ceoDesk/deskPrompt.js';
import {
  type DialogCommand,
  dialogCommand,
  FOLDER_DIALOG_ENV,
  openFolderDialog,
} from '../src/ceoDesk/folderDialog.js';
import { deskIdle, type DeskOffice, git, makeRepo, startDeskOffice } from './ceoDeskHarness.js';

let env: DeskOffice | undefined;
const savedHome = process.env.HOME;

afterEach(async () => {
  delete process.env[FOLDER_DIALOG_ENV];
  process.env.HOME = savedHome;
  await env?.close();
  if (env) fs.rmSync(env.tmp, { recursive: true, force: true });
  env = undefined;
});

const auth = { authorization: 'Bearer tok' };

describe('folder window command', () => {
  it('uses osascript on macOS, PowerShell on Windows, zenity then kdialog on Linux', () => {
    expect(dialogCommand('darwin', {})).toEqual({
      file: 'osascript',
      args: [
        '-e',
        'POSIX path of (choose folder with prompt "Choose a project folder for the cats")',
      ],
    });
    const win = dialogCommand('win32', {})!;
    expect(win.file).toBe('powershell.exe');
    expect(win.args.at(-1)).toContain('FolderBrowserDialog');

    const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-dialog-bin-'));
    const linux = () => dialogCommand('linux', { PATH: bin });
    expect(linux()).toBeNull(); // no window tool: the panel offers a path box
    fs.writeFileSync(path.join(bin, 'kdialog'), '', { mode: 0o755 });
    expect(linux()?.file).toBe('kdialog');
    fs.writeFileSync(path.join(bin, 'zenity'), '', { mode: 0o755 });
    expect(linux()).toEqual({
      file: 'zenity',
      args: ['--file-selection', '--directory', '--title=Choose a project folder for the cats'],
    });
    fs.rmSync(bin, { recursive: true, force: true });
  });

  it('the test override wins on every platform', () => {
    const env = { [FOLDER_DIALOG_ENV]: 'echo /x' };
    expect(dialogCommand('darwin', env)).toEqual({ file: '/bin/sh', args: ['-c', 'echo /x'] });
    expect(dialogCommand('win32', env)?.file).toBe('cmd.exe');
  });

  it('a cancel or an empty answer picks nothing; one window at a time', async () => {
    const cmd: DialogCommand = { file: 'x', args: [] };
    expect(await openFolderDialog(cmd, (_c, done) => done(new Error('-128'), ''))).toEqual({
      cancelled: true,
    });
    expect(await openFolderDialog(cmd, (_c, done) => done(null, '\n'))).toEqual({
      cancelled: true,
    });
    let close: (path: string) => void = () => {};
    let ran: DialogCommand | undefined;
    const first = openFolderDialog(cmd, (c, done) => {
      ran = c;
      close = (p) => done(null, `${p}\n`);
    });
    expect(ran).toBe(cmd);
    expect(await openFolderDialog(cmd, () => {})).toEqual({ busy: true });
    close('/tmp/proj');
    expect(await first).toEqual({ path: '/tmp/proj' });
    // The lock is free again.
    expect(await openFolderDialog(cmd, (_c, done) => done(null, '/a'))).toEqual({ path: '/a' });
  });
});

describe('project routes', () => {
  it('need the token', async () => {
    env = await startDeskOffice(() => ({ text: 'ok' }));
    const { app } = env.server;
    for (const url of ['/api/ceo/folder/pick', '/api/ceo/folder/new', '/api/ceo/folder/history']) {
      expect((await app.inject({ method: 'POST', url, payload: { name: 'x' } })).statusCode).toBe(
        401,
      );
    }
  });

  it('pick: the window answer becomes the project; a cancel and a refusal change nothing', async () => {
    env = await startDeskOffice(() => ({ text: 'ok' }));
    const { app } = env.server;
    const repo = makeRepo(path.join(env.tmp, 'my-site'));
    const pick = () => app.inject({ method: 'POST', url: '/api/ceo/folder/pick', headers: auth });

    process.env[FOLDER_DIALOG_ENV] = 'exit 1';
    expect((await pick()).json()).toEqual({ cancelled: true });
    expect(env.desk.folder).toBeNull();

    process.env[FOLDER_DIALOG_ENV] = `printf '%s/' '${os.homedir()}'`;
    const home = await pick();
    expect(home.statusCode).toBe(400);
    expect(home.json().error).toBe(
      'Pick a folder inside your home folder, not the home folder itself',
    );

    process.env[FOLDER_DIALOG_ENV] = `printf '%s/\\n' '${repo}'`;
    expect((await pick()).json()).toEqual({ folder: repo, git: true });
    expect(env.desk.folder).toBe(repo);
    const folders = await app.inject({ method: 'GET', url: '/api/ceo/folders', headers: auth });
    expect(folders.json()).toEqual({ folder: repo, git: true, recent: [repo], canPick: true });
  });

  it('pick: a second window while one is open is refused', async () => {
    env = await startDeskOffice(() => ({ text: 'ok' }));
    const { app } = env.server;
    const gate = path.join(env.tmp, 'gate');
    process.env[FOLDER_DIALOG_ENV] =
      `while [ ! -f '${gate}' ]; do sleep 0.05; done; printf '%s' '${env.tmp}'`;
    // `then` sends it: an inject chain waits for it.
    const first = app
      .inject({ method: 'POST', url: '/api/ceo/folder/pick', headers: auth })
      .then((r) => r);
    // Wait until the first request holds the window.
    let second = await app.inject({ method: 'POST', url: '/api/ceo/folder/pick', headers: auth });
    for (let i = 0; i < 50 && second.statusCode !== 409; i++) {
      await new Promise((r) => setTimeout(r, 20));
      second = await app.inject({ method: 'POST', url: '/api/ceo/folder/pick', headers: auth });
    }
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toContain('already open');
    fs.writeFileSync(gate, '');
    expect((await first).json()).toEqual({ folder: env.tmp, git: false });
  });

  it('new: makes ~/catavasia-projects/<name> with a first commit; history turns git on', async () => {
    env = await startDeskOffice(() => ({ text: 'ok' }));
    const { app } = env.server;
    process.env.HOME = path.join(env.tmp, 'home');
    fs.mkdirSync(process.env.HOME);
    const bad = await app.inject({
      method: 'POST',
      url: '/api/ceo/folder/new',
      headers: auth,
      payload: { name: '../escape' },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toContain('Use letters, numbers');

    const made = await app.inject({
      method: 'POST',
      url: '/api/ceo/folder/new',
      headers: auth,
      payload: { name: 'my site' },
    });
    const dir = path.join(process.env.HOME, 'catavasia-projects', 'my site');
    expect(made.json()).toEqual({ folder: dir, git: true });
    expect(git(dir, 'log', '--format=%s').trim()).toBe('Start version history (catavasia)');
    expect(env.desk.folder).toBe(dir);

    // A plain folder with files: version history commits what is there.
    const plain = path.join(env.tmp, 'plain');
    fs.mkdirSync(plain);
    fs.writeFileSync(path.join(plain, 'index.html'), '<p>hi</p>');
    const set = await app.inject({
      method: 'PUT',
      url: '/api/ceo/folder',
      headers: auth,
      payload: { path: plain },
    });
    expect(set.json()).toEqual({ folder: plain, git: false });
    const history = await app.inject({
      method: 'POST',
      url: '/api/ceo/folder/history',
      headers: auth,
    });
    expect(history.json()).toEqual({ folder: plain, git: true });
    expect(git(plain, 'ls-files').trim()).toBe('index.html');

    await app.inject({
      method: 'PUT',
      url: '/api/ceo/folder',
      headers: auth,
      payload: { path: null },
    });
    const none = await app.inject({
      method: 'POST',
      url: '/api/ceo/folder/history',
      headers: auth,
    });
    expect(none.statusCode).toBe(400);
    const folders = await app.inject({ method: 'GET', url: '/api/ceo/folders', headers: auth });
    expect(folders.json()).toMatchObject({ folder: null, git: false, recent: [plain, dir] });
  });

  it('the project applies to the next CEO turn and to a new chat', async () => {
    env = await startDeskOffice(() => ({ text: 'ok' }));
    const repo = makeRepo(path.join(env.tmp, 'repo'));
    env.desk.setFolder(repo);
    env.desk.newChat();
    env.desk.send('hi');
    await deskIdle(env.desk);
    expect(env.ceo.turns.at(-1)!.message.startsWith(`[Work folder: ${repo}]`)).toBe(true);
  });
});

describe('CEO persona', () => {
  it('points the user to the Project button and never asks for a path', () => {
    const persona = deskPersona('Boss', '');
    expect(persona).toContain('click the Project button in the bottom bar');
    expect(persona).toContain('Do not ask for a path in the chat');
    expect(persona).not.toContain('set_folder');
  });
});
