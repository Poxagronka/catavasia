/**
 * The desktop launcher that starts catavasia with a double-click:
 * macOS ~/Desktop/catavasia.command, Linux catavasia.desktop (applications
 * menu + Desktop), Windows Desktop\catavasia.cmd. Every file carries
 * LAUNCHER_MARKER, so removal deletes only files this code wrote.
 */

import * as fs from 'fs';
import * as path from 'path';

export const LAUNCHER_MARKER = 'catavasia-launcher';

interface ShortcutContext {
  platform: NodeJS.Platform;
  home: string;
  /** Root of the installed package (the folder with package.json). */
  packageRoot: string;
  execPath?: string;
}

function pathFor(platform: NodeJS.Platform): typeof path.posix {
  return platform === 'win32' ? path.win32 : path.posix;
}

/** The command a launcher runs: the global npm bin when the package sits in a
 *  global node_modules, else node + this package's dist/cli.js (a checkout). */
export function launchCommand(ctx: ShortcutContext): string[] {
  const p = pathFor(ctx.platform);
  const modules = p.dirname(ctx.packageRoot);
  if (p.basename(modules) === 'node_modules') {
    // Windows: <prefix>\node_modules\catavasia -> <prefix>\catavasia.cmd
    if (ctx.platform === 'win32') return [p.join(p.dirname(modules), 'catavasia.cmd')];
    // POSIX: <prefix>/lib/node_modules/catavasia -> <prefix>/bin/catavasia
    const lib = p.dirname(modules);
    if (p.basename(lib) === 'lib') return [p.join(p.dirname(lib), 'bin', 'catavasia')];
  }
  return [ctx.execPath ?? process.execPath, p.join(ctx.packageRoot, 'dist', 'cli.js')];
}

/** Double-quote for sh and for a .desktop Exec= line (same escapes). */
function shQuote(s: string): string {
  return `"${s.replace(/(["\\$`])/g, '\\$1')}"`;
}

/** Where each launcher goes and what it holds. `hasDir` tells which optional
 *  folders (the Desktop) exist; a launcher for a missing Desktop is left out. */
export function shortcutFiles(
  ctx: ShortcutContext,
  hasDir: (dir: string) => boolean,
): { path: string; content: string }[] {
  const p = pathFor(ctx.platform);
  const desktop = p.join(ctx.home, 'Desktop');
  const command = launchCommand(ctx);
  if (ctx.platform === 'win32') {
    if (!hasDir(desktop)) return [];
    const content = [
      '@echo off',
      `rem ${LAUNCHER_MARKER}: starts catavasia and opens it in the browser.`,
      'cd /d "%USERPROFILE%"',
      `call ${command.map((a) => `"${a}"`).join(' ')}`,
      '',
    ].join('\r\n');
    return [{ path: p.join(desktop, 'catavasia.cmd'), content }];
  }
  if (ctx.platform === 'darwin') {
    if (!hasDir(desktop)) return [];
    const content = [
      '#!/bin/bash',
      `# ${LAUNCHER_MARKER}: starts catavasia and opens it in the browser.`,
      `cd ~ && exec ${command.map(shQuote).join(' ')}`,
      '',
    ].join('\n');
    return [{ path: p.join(desktop, 'catavasia.command'), content }];
  }
  const content = [
    '[Desktop Entry]',
    'Type=Application',
    'Name=catavasia',
    'Comment=Pixel-art cat office for your Claude Code agents',
    `Exec=${command.map(shQuote).join(' ')}`,
    `Path=${ctx.home}`,
    'Terminal=true',
    `Icon=${p.join(ctx.packageRoot, 'icon.png')}`,
    'Categories=Development;',
    `X-Catavasia=${LAUNCHER_MARKER}`,
    '',
  ].join('\n');
  const files = [
    { path: p.join(ctx.home, '.local', 'share', 'applications', 'catavasia.desktop'), content },
  ];
  if (hasDir(desktop)) files.push({ path: p.join(desktop, 'catavasia.desktop'), content });
  return files;
}

function isDir(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/** Write the launchers (idempotent: the same content each time). Returns their paths. */
export function createShortcut(ctx: ShortcutContext): string[] {
  const files = shortcutFiles(ctx, isDir);
  for (const file of files) {
    fs.mkdirSync(path.dirname(file.path), { recursive: true });
    fs.writeFileSync(file.path, file.content, { mode: 0o755 });
    // writeFileSync keeps the mode of an existing file: set it each time.
    if (ctx.platform !== 'win32') fs.chmodSync(file.path, 0o755);
  }
  return files.map((f) => f.path);
}

/** Delete the launchers this code wrote: exact path AND the marker inside. */
export function removeShortcut(ctx: ShortcutContext): string[] {
  const removed: string[] = [];
  for (const file of shortcutFiles(ctx, () => true)) {
    try {
      if (!fs.readFileSync(file.path, 'utf-8').includes(LAUNCHER_MARKER)) continue;
      fs.unlinkSync(file.path);
      removed.push(file.path);
    } catch {
      // Not there: nothing to remove.
    }
  }
  return removed;
}
