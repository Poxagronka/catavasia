import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  LAYOUT_FILE_DIR,
  LAYOUT_FILE_NAME,
  LAYOUT_FILE_POLL_INTERVAL_MS,
  LAYOUT_REVISION_KEY,
} from './constants.js';

export interface LayoutWatcher {
  markOwnWrite(): void;
  dispose(): void;
}

function getLayoutFilePath(): string {
  return path.join(os.homedir(), LAYOUT_FILE_DIR, LAYOUT_FILE_NAME);
}

export function readLayoutFromFile(): Record<string, unknown> | null {
  const filePath = getLayoutFilePath();
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    console.error('[catavasia] Failed to read layout file:', err);
    return null;
  }
}

export function writeLayoutToFile(layout: Record<string, unknown>): void {
  const filePath = getLayoutFilePath();
  const dir = path.dirname(filePath);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const json = JSON.stringify(layout, null, 2);
    const tmpPath = filePath + '.tmp';
    fs.writeFileSync(tmpPath, json, 'utf-8');
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    console.error('[catavasia] Failed to write layout file:', err);
  }
}

interface LayoutLoadResult {
  layout: Record<string, unknown>;
  /** True when the user's saved layout was replaced by a newer bundled default */
  wasReset: boolean;
}

/**
 * What makes two layouts the same office: grid, tiles, colors, furniture,
 * carpets, pets and areas. Key order, layoutRevision and empty optional
 * fields (a webview save adds `pets: []`) do not count.
 */
function layoutFingerprint(layout: Record<string, unknown>): string {
  const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const sparse = (v: unknown) =>
    list(v)
      .map((cell, i) => [i, cell] as const)
      .filter(([, cell]) => cell !== null && cell !== undefined);
  const furniture = list(layout.furniture)
    .map((f) => f as Record<string, unknown>)
    .map((f) => [f.uid, f.type, f.col, f.row, f.color ?? null])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return JSON.stringify([
    layout.cols,
    layout.rows,
    list(layout.tiles),
    sparse(layout.tileColors),
    furniture,
    sparse(layout.carpetTiles),
    list(layout.pets),
    list(layout.areas),
    sparse(layout.areaTiles),
  ]);
}

/** True when `saved` is one of the earlier bundled defaults, untouched by the user. */
export function isUnmodifiedDefault(
  saved: Record<string, unknown>,
  previousDefaults: Array<Record<string, unknown>>,
): boolean {
  const print = layoutFingerprint(saved);
  return previousDefaults.some((d) => layoutFingerprint(d) === print);
}

function revisionOf(layout: Record<string, unknown> | null | undefined): number {
  return (layout?.[LAYOUT_REVISION_KEY] as number) ?? 0;
}

/**
 * Load layout from file. Falls back to bundled default if the file is empty.
 * A newer bundled default replaces the saved layout only when the user never
 * changed it (it equals an earlier bundled default); an edited office is kept,
 * and the editor's "Default" button resets it on request.
 *
 * Migration from VS Code workspaceState happens earlier, in
 * adapters/vscode/migrateVsCodeState.ts (run on extension activate). By the
 * time this is called, the file is the only source of truth.
 *
 * 1. If file exists → return it (or the new default, see above)
 * 2. Else if defaultLayout provided → write to file, return it
 * 3. Else → return null
 */
export function loadLayout(
  defaultLayout?: Record<string, unknown> | null,
  previousDefaults: Array<Record<string, unknown>> = [],
): LayoutLoadResult | null {
  const fromFile = readLayoutFromFile();
  if (fromFile) {
    if (migrateUnmodifiedLayout(fromFile, defaultLayout, previousDefaults)) {
      return { layout: defaultLayout!, wasReset: true };
    }
    console.log('[catavasia] Layout loaded from file');
    return { layout: fromFile, wasReset: false };
  }
  if (defaultLayout) {
    console.log('[catavasia] Writing bundled default layout to file');
    writeLayoutToFile(defaultLayout);
    return { layout: defaultLayout, wasReset: false };
  }
  return null;
}

/**
 * Replace a saved layout that is an untouched older default with the newer
 * bundled default. Returns true when it wrote the new default.
 */
export function migrateUnmodifiedLayout(
  saved: Record<string, unknown> | null,
  defaultLayout: Record<string, unknown> | null | undefined,
  previousDefaults: Array<Record<string, unknown>>,
): boolean {
  if (!saved || !defaultLayout || revisionOf(defaultLayout) <= revisionOf(saved)) return false;
  if (!isUnmodifiedDefault(saved, previousDefaults)) {
    console.log(
      `[catavasia] Saved layout is customized: kept (a newer default, revision ${revisionOf(defaultLayout)}, is one click away in the editor)`,
    );
    return false;
  }
  console.log(
    `[catavasia] Saved layout is the untouched revision ${revisionOf(saved)} default: upgrading to revision ${revisionOf(defaultLayout)}`,
  );
  writeLayoutToFile(defaultLayout);
  return true;
}

/**
 * Watch ~/.pixel-agents/layout.json for external changes (other VS Code windows).
 * Uses hybrid fs.watch + polling (same pattern as JSONL watching).
 */
export function watchLayoutFile(
  onExternalChange: (layout: Record<string, unknown>) => void,
): LayoutWatcher {
  const filePath = getLayoutFilePath();
  let skipNextChange = false;
  let lastMtime = 0;
  let fsWatcher: fs.FSWatcher | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let disposed = false;

  // Initialize lastMtime
  try {
    if (fs.existsSync(filePath)) {
      lastMtime = fs.statSync(filePath).mtimeMs;
    }
  } catch {
    /* ignore */
  }

  function checkForChange(): void {
    if (disposed) return;
    try {
      if (!fs.existsSync(filePath)) return;
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs <= lastMtime) return;
      lastMtime = stat.mtimeMs;

      if (skipNextChange) {
        skipNextChange = false;
        return;
      }

      const raw = fs.readFileSync(filePath, 'utf-8');
      const layout = JSON.parse(raw) as Record<string, unknown>;
      console.log('[catavasia] External layout change detected');
      onExternalChange(layout);
    } catch (err) {
      console.error('[catavasia] Error checking layout file:', err);
    }
  }

  function startFsWatch(): void {
    if (disposed || fsWatcher) return;
    try {
      if (!fs.existsSync(filePath)) return;
      fsWatcher = fs.watch(filePath, () => {
        checkForChange();
      });
      fsWatcher.on('error', (err) => {
        // fs.watch can be unreliable on macOS (kqueue) and may hit inotify limits on Linux
        console.log(`[catavasia] Layout: fs.watch error: ${err.message}`);
        fsWatcher?.close();
        fsWatcher = null;
      });
    } catch {
      // File may not exist yet — polling will retry
    }
  }

  // Start fs.watch if file exists
  startFsWatch();

  // Polling backup (also starts fs.watch if file appears)
  pollTimer = setInterval(() => {
    if (disposed) return;
    if (!fsWatcher) {
      startFsWatch();
    }
    checkForChange();
  }, LAYOUT_FILE_POLL_INTERVAL_MS);

  return {
    markOwnWrite(): void {
      skipNextChange = true;
      // Update lastMtime preemptively so a near-instant poll doesn't miss the flag
      try {
        if (fs.existsSync(filePath)) {
          lastMtime = fs.statSync(filePath).mtimeMs;
        }
      } catch {
        /* ignore */
      }
    },
    dispose(): void {
      disposed = true;
      fsWatcher?.close();
      fsWatcher = null;
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    },
  };
}
