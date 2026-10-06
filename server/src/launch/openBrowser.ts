/**
 * Open a URL in the default browser: macOS `open`, Linux `xdg-open`,
 * Windows `cmd /c start ""`. Best effort: a missing opener never throws,
 * the caller has already printed the URL for the user to copy.
 */

import { spawn } from 'child_process';

export function openerCommand(
  platform: NodeJS.Platform,
  url: string,
): { cmd: string; args: string[] } {
  if (platform === 'darwin') return { cmd: 'open', args: [url] };
  // The empty "" is the window title: without it `start` takes a quoted URL as the title.
  if (platform === 'win32') return { cmd: 'cmd', args: ['/c', 'start', '""', url] };
  return { cmd: 'xdg-open', args: [url] };
}

export function openBrowser(
  url: string,
  platform: NodeJS.Platform = process.platform,
  spawnFn: typeof spawn = spawn,
): void {
  const { cmd, args } = openerCommand(platform, url);
  try {
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
