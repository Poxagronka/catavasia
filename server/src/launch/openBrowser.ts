/**
 * Open a URL in the default browser: macOS `open`, Linux `xdg-open`,
 * Windows `cmd /c start ""`. Best effort: a missing opener never throws,
 * the caller has already printed the URL for the user to copy.
 *
 * The tokened URL never goes into argv: argv is visible to every user in
 * `ps`, and a browser that the opener starts keeps it for its whole life.
 * The opener gets a private page (mode 0600) that redirects to the URL.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { SERVER_JSON_DIR } from '../constants.js';

export function openerCommand(
  platform: NodeJS.Platform,
  target: string,
): { cmd: string; args: string[] } {
  if (platform === 'darwin') return { cmd: 'open', args: [target] };
  // The empty "" is the window title: without it `start` takes a quoted target as the title.
  if (platform === 'win32') return { cmd: 'cmd', args: ['/c', 'start', '""', `"${target}"`] };
  return { cmd: 'xdg-open', args: [target] };
}

/** Write `<dir>/open.html` (mode 0600), a redirect to `url`. Returns its path. */
function redirectPage(dir: string, url: string): string {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const page = path.join(dir, 'open.html');
  const html = `<!doctype html><meta http-equiv="refresh" content="0;url=${url}"><a href="${url}">catavasia</a>\n`;
  fs.writeFileSync(page, html, { mode: 0o600 });
  // writeFileSync keeps the mode of an existing file: set it each time.
  fs.chmodSync(page, 0o600);
  return page;
}

export function openBrowser(
  url: string,
  platform: NodeJS.Platform = process.platform,
  spawnFn: typeof spawn = spawn,
  dir: string = path.join(os.homedir(), SERVER_JSON_DIR),
): void {
  try {
    const { cmd, args } = openerCommand(platform, redirectPage(dir, url));
    const child = spawnFn(cmd, args, {
      detached: true,
      stdio: 'ignore',
      // Pass `start ""` to cmd as written: Node's quoting would escape the "".
      windowsVerbatimArguments: platform === 'win32',
    });
    child.on('error', () => {
      console.log(`[catavasia] Could not open a browser. Open this URL: ${url}`);
    });
    child.unref();
  } catch {
    console.log(`[catavasia] Could not open a browser. Open this URL: ${url}`);
  }
}
