#!/usr/bin/env node

/**
 * Standalone CLI entry point: `catavasia` (npm bin)
 *
 * Starts the Fastify server in standalone mode with SPA serving and WebSocket.
 * Loads all assets (PNGs -> SpriteData) on startup and caches in memory.
 * Each connecting WebSocket client receives the full state on webviewReady.
 */

import * as os from 'os';
import * as path from 'path';

import { AgentRuntime } from './agentRuntime.js';
import { AgentStateStore } from './agentStateStore.js';
import { loadPreviousDefaultLayouts } from './assetLoader.js';
import {
  buildAssetCache,
  loadAllCharacters,
  loadAllFurniture,
  loadAllPets,
} from './assetReload.js';
import { loadOrCreateAuthToken } from './authToken.js';
import {
  type AssetCache,
  KEY_NARRATOR_AI_SUMMARIES,
  type ReloadAssetsSideEffect,
} from './clientMessageHandler.js';
import {
  getHooksConsent,
  getHooksEnabled,
  grantHooksConsent,
  parseTurnConcurrency,
  readConfig,
} from './configPersistence.js';
import {
  LAYOUT_FILE_DIR,
  MAX_PORT,
  MIN_PORT,
  TURN_CONCURRENCY_DEFAULT,
  UPDATE_RESTART_GRACE_MS,
} from './constants.js';
import { FileStateAdapter } from './fileStateAdapter.js';
import { openBrowser } from './launch/openBrowser.js';
import { defaultPort, planLaunch, readOwnServers } from './launch/portChoice.js';
import { createShortcut, removeShortcut } from './launch/shortcut.js';
import { migrateUnmodifiedLayout, readLayoutFromFile } from './layoutPersistence.js';
import { Narrator } from './narrator/narrator.js';
import { ClaudeAdapter } from './orchestrator/claudeAdapter.js';
import { CodexAdapter } from './orchestrator/codexAdapter.js';
import { Orchestrator } from './orchestrator/orchestrator.js';
import { claudeProvider, copyHookScript, hookProviderById } from './providers/index.js';
import { isProcessRunning, PixelAgentsServer } from './server.js';
import { TaskManager } from './taskBoard/taskManager.js';
import { spawnReplacement, takeInheritedToken, waitForPreviousServer } from './update/restart.js';
import { UPDATE_REPO_GIT_URL, updateBranch, UpdateChecker } from './update/updateChecker.js';
import type { SelfUpdate } from './update/updateRoutes.js';
import { UpdateRunner } from './update/updateRunner.js';

// ── Argument parsing ──────────────────────────────────────────

export interface CliArgs {
  /** Unset -> the default port (3100, see launch/portChoice.ts), or an
   *  OS-assigned one when another program holds it. --port picks a fixed one. */
  port?: number;
  host: string;
  /** False with --no-open: print the URL, do not open a browser tab. */
  open: boolean;
}

/** Thrown by parseArgs on an invalid --port. Kept separate from process.exit so
 *  the parsing logic stays a pure, unit-testable function -- main() is the only
 *  place that turns a bad argument into an exit code. */
export class CliArgsError extends Error {}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { host: '127.0.0.1', open: true };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port' || argv[i] === '-p') {
      const raw = argv[i + 1];
      if (raw === undefined) {
        throw new CliArgsError(
          `Missing value for ${argv[i]}: expected an integer between ${MIN_PORT} and ${MAX_PORT}.`,
        );
      }
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < MIN_PORT || parsed > MAX_PORT) {
        throw new CliArgsError(
          `Invalid --port "${raw}": must be an integer between ${MIN_PORT} and ${MAX_PORT}.`,
        );
      }
      args.port = parsed;
      i++;
    } else if (argv[i] === '--host' && argv[i + 1]) {
      args.host = argv[i + 1];
      i++;
    } else if (argv[i] === '--no-open') {
      args.open = false;
    } else if (argv[i] === '--help') {
      console.log(`Usage: catavasia [options]
       catavasia shortcut [--remove]

Starts the office and opens it in the browser. When it already runs on the
port, it only opens the browser tab.

Options:
  --port, -p <number>   Port to listen on (default: 3100; when another program
                        holds 3100, a free port)
  --host <string>       Host to bind to (default: 127.0.0.1)
  --no-open             Do not open the browser, only print the URL
  --help                Show this help message

Commands:
  shortcut              Create the desktop launcher (done by npm install -g)
  shortcut --remove     Remove the desktop launcher`);
      process.exit(0);
    }
  }
  return args;
}

// ── Hooks consent ─────────────────────────────────────────────
// First-run consent is asked IN THE APP, not here: the server sends a
// hooksConsentRequest to privileged (tokened) connections during the
// webviewReady handshake (clientMessageHandler.ts), and the browser renders
// the dialog — the same UX the VS Code webview shows. The CLI itself never
// prompts; a headless run just starts without hooks until consent is granted
// through the UI. The one exception that needs no dialog is the silent-grant
// migration below (our hooks already installed by a pre-consent version).

/**
 * Copy the bundled hook script into ~/.pixel-agents/hooks/, reporting failure.
 *
 * Callers run this BEFORE installing the settings.json entries and abort when
 * it returns false: an entry whose command points at a missing script makes
 * Claude Code spawn a dead `node` process for every event, which is strictly
 * worse than no hooks at all.
 */
function copyHookScriptOrReport(packageRoot: string, context = ''): boolean {
  if (copyHookScript(packageRoot)) return true;
  console.error(`[catavasia] Hooks NOT installed${context}: hook script missing.`);
  return false;
}

// ── Main ──────────────────────────────────────────────────────

/** `catavasia shortcut [--remove]`: create or remove the desktop launcher. */
function runShortcutCommand(argv: string[]): void {
  const ctx = {
    platform: process.platform,
    home: os.homedir(),
    packageRoot: path.dirname(__dirname),
  };
  if (argv.includes('--remove')) {
    const removed = removeShortcut(ctx);
    console.log(
      removed.length > 0 ? `Removed: ${removed.join(', ')}` : 'No catavasia launcher to remove.',
    );
    return;
  }
  const created = createShortcut(ctx);
  if (created.length === 0) {
    console.log(
      `No Desktop folder (${path.join(os.homedir(), 'Desktop')}). Start catavasia with: catavasia`,
    );
    return;
  }
  console.log(`Created: ${created.join(', ')}`);
}

async function main(): Promise<void> {
  if (process.argv[2] === 'shortcut') {
    runShortcutCommand(process.argv.slice(3));
    return;
  }
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`[catavasia] ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // Started by a self-update: the old server hands over its token (so the open
  // tab stays privileged) and must be gone before this one takes the port.
  const inheritedToken = takeInheritedToken();
  if (!(await waitForPreviousServer(isProcessRunning))) {
    console.error('[catavasia] The previous server did not exit; not starting.');
    process.exit(1);
  }

  // A self-update restart keeps the open tab: it must not open another one.
  const openTab = args.open && !inheritedToken && process.env['CATAVASIA_NO_OPEN'] !== '1';
  const plan = await planLaunch({
    explicitPort: args.port,
    defaultPort: defaultPort(),
    host: args.host,
    servers: readOwnServers(),
  });
  if (plan.kind === 'open') {
    console.log(`\n  catavasia is already running at ${plan.url}\n`);
    if (openTab) openBrowser(plan.url);
    process.exit(0);
  }
  if (plan.note) console.log(`[catavasia] ${plan.note}`);

  // dist/ contains both the CLI bundle and the assets/ + webview/ directories
  const distRoot = __dirname;
  const packageRoot = path.dirname(distRoot);
  const staticDir = path.join(distRoot, 'webview');

  // ── Load assets on startup (same pipeline as VS Code extension) ──
  // External asset directories are merged at startup too, so directories added
  // in a previous session survive a restart. buildAssetCache is the shared
  // loader used by both the standalone server and the VS Code adapter.
  console.log('[catavasia] Loading assets...');
  const assetCache: AssetCache = await buildAssetCache(
    distRoot,
    readConfig().externalAssetDirectories,
  );
  const charCount = assetCache.characters?.characters.length ?? 0;
  const petCount = assetCache.pets?.pets.length ?? 0;
  const furnitureCount = assetCache.furniture?.catalog.length ?? 0;
  console.log(
    `[catavasia] Assets loaded: ${charCount} characters, ${petCount} pets, ${furnitureCount} furniture items`,
  );
  // An untouched older default office upgrades to the new default; an edited one stays.
  migrateUnmodifiedLayout(
    readLayoutFromFile(),
    assetCache.defaultLayout,
    loadPreviousDefaultLayouts(distRoot),
  );

  // ── Store + adapter (shared settings + standalone-scoped agents/seats) ──
  const store = new AgentStateStore();
  const adapter = new FileStateAdapter({ namespace: 'standalone' });
  store.setAdapter(adapter);

  // ── Create server ──
  const server = new PixelAgentsServer();

  try {
    // Create runtime first (before server.start, so we can pass it in)
    const runtime = new AgentRuntime(store, claudeProvider);

    // Narrator: English status lines (templates) + batched Haiku summaries.
    const narrator = new Narrator({
      broadcast: (m) => store.broadcast({ ...m }),
      aiSummariesEnabled: () => adapter.getSetting(KEY_NARRATOR_AI_SUMMARIES, true),
    });
    store.on('broadcast', (m: Record<string, unknown>) => narrator.observeBroadcast(m));
    store.on('agentRemoved', (id: number) => narrator.forget(id));

    // Cat office: cat profiles, team tasks, and the office MCP tools.
    const stateDir = path.join(os.homedir(), LAYOUT_FILE_DIR);
    const orchestrator = new Orchestrator({
      host: runtime,
      stateDir,
      adapters: [new ClaudeAdapter(), new CodexAdapter()],
      emit: (message) => store.broadcast({ ...message }),
      turnConcurrency:
        parseTurnConcurrency(adapter.getSetting('pixel-agents.turnConcurrency', undefined)) ??
        TURN_CONCURRENCY_DEFAULT,
      narrate: (input) => narrator.push(input),
    });
    runtime.showGuests.current = adapter.getSetting('pixel-agents.showGuests', false);

    // Task board: each task runs as a headless agent of this runtime, or as a
    // team task of the cat office when it targets the team or one cat.
    const tasks = new TaskManager({
      host: runtime,
      stateDir,
      defaultCwd: process.cwd(),
      flows: orchestrator,
      narrate: (input) => narrator.push(input),
    });
    // Finished one-cat runs keep their idle cat across restarts.
    tasks.restoreFinishedCats();

    // Wire hook events: HTTP POST -> runtime -> hookEventHandler -> agents
    server.onHookEvent((providerId, event) => {
      runtime.handleHookEvent(providerId, event);
    });

    // onSetHooksEnabled side effect: install/uninstall the named provider's
    // hooks when the user toggles in the UI (or answers the consent ask).
    // Captures config from the outer scope after server.start().
    let currentConfig: { port: number; token: string } | null = null;
    const onSetHooksEnabled = async (providerId: string, enabled: boolean): Promise<void> => {
      if (!currentConfig) return;
      const provider = hookProviderById(providerId);
      if (!provider) return; // unknown id: nothing to install into
      if (enabled) {
        // An explicit toggle in the UI IS the consent to modify the
        // provider's settings file. The bundled claude-hook.js script belongs
        // to the Claude provider alone; another provider's install must
        // neither copy it nor be blocked by it.
        grantHooksConsent(provider.id);
        if (
          provider.id === claudeProvider.id &&
          !copyHookScriptOrReport(packageRoot, ' (user toggle)')
        ) {
          return;
        }
        try {
          await provider.installHooks(
            `http://127.0.0.1:${currentConfig.port}`,
            currentConfig.token,
          );
        } catch (err) {
          console.error(`[catavasia] ${err instanceof Error ? err.message : String(err)}`);
          return;
        }
        console.log('[catavasia] Hooks installed (user toggle)');
      } else {
        try {
          await provider.uninstallHooks();
          console.log('[catavasia] Hooks uninstalled (user toggle)');
        } catch (err) {
          console.error(`[catavasia] ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    };

    // onReloadAssets side effect: re-run the shared loaders (bundled + external
    // dirs) after an external-asset-directory change, then re-broadcast the
    // updated sprites to the requesting client. Mutates the assetCache object in
    // place so already-open sockets (which captured the same reference) and
    // future webviewReady handshakes both observe the new assets. Only
    // characters/pets/furniture can come from external dirs, so only those three
    // are reloaded and re-sent (mirrors the VS Code reload path).
    const onReloadAssets: ReloadAssetsSideEffect = async (send): Promise<void> => {
      const externalDirs = readConfig().externalAssetDirectories;
      const [characters, pets, furniture] = await Promise.all([
        loadAllCharacters(distRoot, externalDirs),
        loadAllPets(distRoot, externalDirs),
        loadAllFurniture(distRoot, externalDirs),
      ]);
      assetCache.characters = characters;
      assetCache.pets = pets;
      assetCache.furniture = furniture;
      if (characters) {
        send({ type: 'characterSpritesLoaded', characters: characters.characters });
      }
      if (pets) {
        send({
          type: 'petSpritesLoaded',
          pets: pets.pets,
          petNames: pets.manifests.map((m) => m.name),
          petSpecies: pets.manifests.map((m) => m.species ?? ''),
        });
      }
      if (furniture) {
        send({
          type: 'furnitureAssetsLoaded',
          catalog: furniture.catalog,
          sprites: Object.fromEntries(furniture.sprites),
        });
      }
      console.log('[catavasia] Assets reloaded (external directory change)');
    };

    // Self-update: check the fixed repo, install from source only on approval.
    const updateDir = path.join(stateDir, 'update');
    const updateBranchName = updateBranch();
    let restartInto: (cliPath: string) => void = () => {};
    const update: SelfUpdate = {
      checker: new UpdateChecker({
        currentVersion: process.env.PIXEL_AGENTS_VERSION ?? '',
        currentCommit: process.env.CATAVASIA_COMMIT,
        branch: updateBranchName,
        getAutoCheck: () => adapter.getSetting('pixel-agents.autoUpdateCheck', true),
        setAutoCheck: (enabled) => adapter.setSetting('pixel-agents.autoUpdateCheck', enabled),
      }),
      runner: new UpdateRunner({
        updateDir,
        repoUrl: UPDATE_REPO_GIT_URL,
        branch: updateBranchName,
        busyReason: () => {
          const running = tasks.list().filter((t) => t.status === 'running');
          if (running.length > 0) {
            const titles = running.map((t) => `"${t.title}"`).join(', ');
            return `Cats are working on ${titles}. Update when the tasks finish.`;
          }
          const turns = orchestrator.scheduler.state();
          if (turns.running.length + turns.queued.length > 0) {
            return 'A cat is in the middle of a turn. Update when it finishes.';
          }
          return undefined;
        },
        restart: (cliPath) => restartInto(cliPath),
      }),
    };

    const config = await server.start({
      store,
      runtime,
      embedded: false,
      host: args.host,
      port: plan.port,
      staticDir,
      assetCache,
      onSetHooksEnabled,
      onReloadAssets,
      tasks,
      orchestrator,
      narrator,
      update,
      // One token across restarts (see authToken.ts). A self-update hands over
      // the same token, so the inherited one wins only if the file changed.
      token: inheritedToken ?? loadOrCreateAuthToken(),
    });
    currentConfig = { port: config.port, token: config.token };
    orchestrator.setServerUrl(`http://127.0.0.1:${config.port}`);

    // Sync runtime refs with persisted settings BEFORE first scan tick. The
    // runtime's single hooksEnabled ref follows the Claude provider until the
    // scanners grow per-provider awareness alongside the Settings UI.
    runtime.hooksEnabled.current = getHooksEnabled(claudeProvider.id);
    runtime.watchAllSessions.current = adapter.getSetting('pixel-agents.watchAllSessions', false);

    // Install hooks on startup if the persisted setting says so — gated on the
    // one-time consent to modify ~/.claude/settings.json.
    if (runtime.hooksEnabled.current) {
      let consent = getHooksConsent(claudeProvider.id) === 'granted';
      if (!consent && (await claudeProvider.areHooksInstalled())) {
        // Our hooks are already installed and already firing — a pre-consent
        // version put them there. Grant and continue with NO prompt: the
        // install below is the 14 -> 12 migration, and it only ever REDUCES
        // scope (it drops UserPromptSubmit and TaskCreated, the two events that
        // forwarded prompt text and were consumed by nothing). Asking would buy
        // this user no protection they do not already have, so they are not
        // asked. A fresh install still is, in full — in the browser UI, when a
        // tokened client connects (clientMessageHandler's webviewReady).
        grantHooksConsent(claudeProvider.id);
        consent = true;
      }
      if (!consent) {
        console.log(
          '[catavasia] Hooks not installed: modifying ~/.claude/settings.json needs one-time approval — open the URL below to review and approve it.',
        );
      } else if (copyHookScriptOrReport(packageRoot)) {
        try {
          await claudeProvider.installHooks(`http://127.0.0.1:${config.port}`, config.token);
          console.log('[catavasia] Hooks installed');
        } catch (err) {
          console.error(`[catavasia] ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } else {
      // Without this line, a persisted hooks-off makes startup skip the entire
      // consent/install flow with zero output — indistinguishable from a bug.
      console.log(
        '[catavasia] Hooks disabled — enable "Instant Detection (Hooks)" in the UI settings to install them.',
      );
    }

    // Start scanning for external sessions (Claude running in user's terminal)
    const cwd = process.cwd();
    const dirs = claudeProvider.getSessionDirs?.(cwd);
    if (dirs && dirs[0]) {
      const projectDir = dirs[0];
      console.log(`[catavasia] Scanning project dir: ${projectDir}`);
      runtime.startProjectScan(projectDir);
      runtime.startExternalScanning(projectDir);
      runtime.startStaleCheck();
    }

    // The URL the operator opens has to be REACHABLE (a wildcard bind address
    // is a bind target, not an address you can browse to — `--host 0.0.0.0`
    // used to print a dead `http://0.0.0.0:PORT`) and has to carry the token,
    // which is what makes the session it loads privileged enough to approve a
    // hook install (see standaloneTokenValid in httpServer.ts). Under `--host
    // 0.0.0.0` the office stays readable from the LAN at this machine's own
    // address; only the consent-bearing toggle needs the token.
    const displayHost =
      args.host === '0.0.0.0' || args.host === '::' || args.host === '' ? '127.0.0.1' : args.host;
    const url = `http://${displayHost}:${config.port}/?token=${config.token}`;
    console.log(`\n  catavasia server running at ${url}\n`);
    if (openTab) openBrowser(url);

    // ── Graceful shutdown ──
    function shutdown(): void {
      console.log('\nShutting down...');
      update.checker.dispose();
      tasks.dispose();
      narrator.dispose();
      runtime.dispose();
      server.stop();
      process.exit(0);
    }

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // After an install: start the new version on this port with this token,
    // then stop like on SIGTERM (tasks become interrupted, Resume continues
    // them). The grace delay lets the open tab read the `restarting` phase.
    restartInto = (cliPath) => {
      spawnReplacement({
        cliPath,
        port: config.port,
        host: args.host,
        token: config.token,
        logPath: path.join(updateDir, 'restart.log'),
      });
      setTimeout(shutdown, UPDATE_RESTART_GRACE_MS);
    };
    update.checker.start();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      console.error(
        `Port ${String(plan.port)} is busy. Use --port <other> or stop the other process.`,
      );
      process.exit(1);
    }
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Only auto-run when this file is executed directly (`node dist/cli.js`), not
// when it's imported for its exports (e.g. `parseArgs` in tests) -- importing
// it unconditionally used to start a real server and install real Claude
// hooks as a side effect of module load.
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
