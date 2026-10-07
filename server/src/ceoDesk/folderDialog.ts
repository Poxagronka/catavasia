/**
 * The system "choose a folder" window, opened by the local server: a browser
 * page never learns a folder's full path. One window at a time. Tests set
 * CATAVASIA_FOLDER_DIALOG_CMD (a shell command that prints the path) so no
 * real window opens.
 */

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const FOLDER_DIALOG_ENV = 'CATAVASIA_FOLDER_DIALOG_CMD';
const PROMPT = 'Choose a project folder for the cats';
/** A window left open this long closes (the lock must not stay forever). */
const DIALOG_TIMEOUT_MS = 10 * 60 * 1000;

const WINDOWS_SCRIPT = [
  'Add-Type -AssemblyName System.Windows.Forms',
  '$d = New-Object System.Windows.Forms.FolderBrowserDialog',
  `$d.Description = '${PROMPT}'`,
  "if ($d.ShowDialog() -eq 'OK') { [Console]::Out.Write($d.SelectedPath) }",
].join('; ');

export interface DialogCommand {
  file: string;
  args: string[];
}

/** The command that shows the folder window here, or null when the system has none. */
export function dialogCommand(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): DialogCommand | null {
  const override = env[FOLDER_DIALOG_ENV];
  if (override) {
    return platform === 'win32'
      ? { file: 'cmd.exe', args: ['/d', '/s', '/c', override] }
      : { file: '/bin/sh', args: ['-c', override] };
  }
  if (platform === 'darwin') {
    return {
      file: 'osascript',
      args: ['-e', `POSIX path of (choose folder with prompt "${PROMPT}")`],
    };
  }
  if (platform === 'win32') {
    return { file: 'powershell.exe', args: ['-NoProfile', '-STA', '-Command', WINDOWS_SCRIPT] };
  }
  if (onPath('zenity', env)) {
    return { file: 'zenity', args: ['--file-selection', '--directory', `--title=${PROMPT}`] };
  }
  if (onPath('kdialog', env)) {
    return { file: 'kdialog', args: ['--getexistingdirectory', os.homedir(), '--title', PROMPT] };
  }
  return null;
}

/** Runs the command; `stdout` is what it printed. */
export type DialogRunner = (
  cmd: DialogCommand,
  done: (err: Error | null, stdout: string) => void,
) => void;

const execRunner: DialogRunner = (cmd, done) => {
  execFile(cmd.file, cmd.args, { timeout: DIALOG_TIMEOUT_MS }, (err, stdout, stderr) => {
    // osascript reports a cancel as error -128: only other errors go to the log.
    if (err && !String(stderr).includes('-128')) {
      console.error(`[catavasia] folder window: ${String(stderr).trim() || err.message}`);
    }
    done(err, String(stdout));
  });
};

export type DialogResult = { path: string } | { cancelled: true } | { busy: true };

let windowOpen = false;

/** Show the folder window and wait for the user. A cancel or an error picks nothing. */
export function openFolderDialog(
  cmd: DialogCommand,
  run: DialogRunner = execRunner,
): Promise<DialogResult> {
  if (windowOpen) return Promise.resolve({ busy: true });
  windowOpen = true;
  return new Promise((resolve) => {
    run(cmd, (err, stdout) => {
      windowOpen = false;
      const picked = stdout.trim();
      resolve(err || !picked ? { cancelled: true } : { path: picked });
    });
  });
}

function onPath(name: string, env: NodeJS.ProcessEnv): boolean {
  return (env.PATH ?? '').split(path.delimiter).some((dir) => {
    try {
      fs.accessSync(path.join(dir, name), fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}
