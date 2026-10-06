/**
 * Optional native PTY module loader, ported from upstream PR #347
 * (`server/src/terminal/ptyModule.ts`, feat/standalone-terminal).
 *
 * node-pty is native, so two failure modes exist: the optional dependency is
 * not installed (require throws), or it imports but every spawn fails (npm
 * script gating skipped the spawn-helper chmod: `posix_spawnp failed`). So
 * availability is proven by ACTUALLY spawning a throwaway PTY, once.
 */

/** The slice of node-pty this project uses (official node-pty and @lydell/node-pty). */
export interface IPty {
  readonly pid: number;
  onData(listener: (data: string) => void): void;
  onExit(listener: (e: { exitCode: number; signal?: number }) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
}

export interface PtySpawnOptions {
  name: string;
  cols: number;
  rows: number;
  cwd: string;
  env: Record<string, string>;
}

export interface PtyModule {
  spawn(file: string, args: string[], options: PtySpawnOptions): IPty;
}

export interface PtyModuleResolution {
  module: PtyModule | null;
  /** Why the terminal is unavailable; null when it works. Shown in the UI. */
  reason: string | null;
}

/** Tried in order. @lydell/node-pty ships prebuilt binaries and needs no install scripts. */
const PTY_MODULE_CANDIDATES = ['@lydell/node-pty', 'node-pty'] as const;

/** A runtime lookup esbuild leaves alone (the ids are external in esbuild.js). */
function requireAtRuntime(id: string): unknown {
  const req: NodeRequire = require;
  return req(id);
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Load the first PTY module that can really spawn. */
export function resolvePtyModule(
  candidates: readonly string[] = PTY_MODULE_CANDIDATES,
): PtyModuleResolution {
  const failures: string[] = [];
  for (const id of candidates) {
    let loaded: unknown;
    try {
      loaded = requireAtRuntime(id);
    } catch (err) {
      failures.push(`${id}: ${describeError(err)}`);
      continue;
    }
    if (typeof (loaded as PtyModule | null)?.spawn !== 'function') {
      failures.push(`${id}: loaded but exposes no spawn()`);
      continue;
    }
    const mod = loaded as PtyModule;
    // Windows has no spawn-helper, so an import is the whole test there.
    const spawnError = process.platform === 'win32' ? null : probeSpawn(mod);
    if (spawnError) {
      failures.push(`${id}: loaded but cannot spawn (${spawnError})`);
      continue;
    }
    return { module: mod, reason: null };
  }
  return { module: null, reason: `No working PTY module. Tried -- ${failures.join('; ')}` };
}

function probeSpawn(mod: PtyModule): string | null {
  let probe: IPty | null = null;
  try {
    probe = mod.spawn('sh', [], { name: 'dumb', cols: 1, rows: 1, cwd: process.cwd(), env: {} });
    return null;
  } catch (err) {
    return describeError(err);
  } finally {
    try {
      probe?.kill();
    } catch {
      // A PTY that spawned but will not die still proves spawning works.
    }
  }
}

let cached: PtyModuleResolution | null = null;

/** Resolve once per process. Lazy: a user who never takes the wheel pays no probe. */
export function ptyModule(): PtyModuleResolution {
  cached ??= resolvePtyModule();
  return cached;
}
