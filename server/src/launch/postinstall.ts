/**
 * npm postinstall (dist/postinstall.js): create the desktop launcher, but only
 * for a global install. A local install or `npm ci` in the repo does nothing.
 * Best effort: it never throws, so it can never fail the install.
 */

import * as os from 'os';
import * as path from 'path';

import { createShortcut } from './shortcut.js';

export function isGlobalInstall(env: NodeJS.ProcessEnv): boolean {
  return env['npm_config_global'] === 'true' || env['npm_config_location'] === 'global';
}

export function runPostinstall(
  opts: {
    env?: NodeJS.ProcessEnv;
    platform?: NodeJS.Platform;
    home?: string;
    packageRoot?: string;
    log?: (line: string) => void;
  } = {},
): void {
  const log = opts.log ?? console.log;
  if (!isGlobalInstall(opts.env ?? process.env)) return;
  try {
    const created = createShortcut({
      platform: opts.platform ?? process.platform,
      home: opts.home ?? os.homedir(),
      // The bundle lives in <package>/dist.
      packageRoot: opts.packageRoot ?? path.dirname(__dirname),
    });
    log(
      created.length > 0
        ? `catavasia: launcher created: ${created.join(', ')}. Double-click it, or run \`catavasia\`.`
        : 'catavasia: no Desktop folder, no launcher. Run `catavasia` to start.',
    );
  } catch (err) {
    log(
      `catavasia: could not create the launcher (${err instanceof Error ? err.message : String(err)}). Run \`catavasia shortcut\`.`,
    );
  }
}
