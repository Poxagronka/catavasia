// ── JSONL File Watching ─────────────────────────────────────
export const JSONL_POLL_INTERVAL_MS = 1000;
export const FILE_WATCHER_POLL_INTERVAL_MS = 500;
export const PROJECT_SCAN_INTERVAL_MS = 1000;

// ── Heuristic Agent Status Detection ────────────────────────
// These timers are the fallback when CLI hooks are not active
// (hookDelivered = false). When hooks are working, these are
// suppressed and the server receives instant events instead.
/** Delay before sending agentToolDone (prevents UI flicker on rapid tool transitions) */
export const TOOL_DONE_DELAY_MS = 300;
/** Heuristic: time after a non-exempt tool starts before showing permission bubble.
 *  Not used for teammates -- false positives on slow tools (WebFetch/WebSearch).
 *  Teammates rely on the lead's routed Notification(permission_prompt) hook. */
export const PERMISSION_TIMER_DELAY_MS = 7000;
/** Heuristic: silence duration before marking a text-only turn as complete */
export const TEXT_IDLE_DELAY_MS = 5000;
/** Heuristic: idle threshold for per-agent /clear detection (content check prevents stealing) */
export const CLEAR_IDLE_THRESHOLD_MS = 2000;

// ── External Session Detection ──────────────────────────────
export const EXTERNAL_SCAN_INTERVAL_MS = 3000;
/** Only adopt JSONL files modified within this window */
export const EXTERNAL_ACTIVE_THRESHOLD_MS = 120_000; // 2 minutes
/** Remove external agents after this much inactivity */
// export const EXTERNAL_STALE_TIMEOUT_MS = 300_000; // 5 minutes - deprecated
export const EXTERNAL_STALE_CHECK_INTERVAL_MS = 30_000;
/** Cooldown after user closes an agent via X. Must be > EXTERNAL_ACTIVE_THRESHOLD_MS
 *  so the file's mtime becomes stale before the dismissal expires. */
export const DISMISSED_COOLDOWN_MS = 180_000; // 3 minutes

// ── Context Window Usage ────────────────────────────────────
/** Window size assumed until a transcript proves otherwise. Transcripts never
 *  state the model's context limit, so this is the floor, not the truth. */
export const DEFAULT_MAX_CONTEXT_TOKENS = 200_000;
/** Known window sizes, ascending. The smallest tier that fits the largest
 *  context observed so far wins; beyond the last tier we round up to a whole
 *  multiple of it, so an unknown future window still reads under 100%. */
export const CONTEXT_WINDOW_TIERS = [200_000, 1_000_000] as const;
/** How much of a transcript's tail to read when seeding an agent's context on
 *  adoption or restore. Comfortably more than one turn's worth of records. */
export const CONTEXT_SEED_TAIL_BYTES = 256 * 1024;

// ── Global Session Scanning ─────────────────────────────────
/** Only adopt global JSONL files larger than this (filters out empty/init-only sessions) */
export const GLOBAL_SCAN_ACTIVE_MIN_SIZE = 3_072; // 3KB
/** Only adopt global JSONL files modified within this window */
export const GLOBAL_SCAN_ACTIVE_MAX_AGE_MS = 600_000; // 10 minutes

// ── Display Truncation + Pixel Agents Server paths ──────────
// Centralized in core/src/constants.ts; re-exported here for back-compat.
export {
  BASH_COMMAND_DISPLAY_MAX_LENGTH,
  HOOK_API_PREFIX,
  HOOK_SCRIPTS_DIR,
  SERVER_JSON_DIR,
  SERVER_JSON_NAME,
  TASK_DESCRIPTION_DISPLAY_MAX_LENGTH,
} from '../../core/src/constants.js';

// ── Multi-Server Discovery ──────────────────────────────────
/** Subdirectory (under SERVER_JSON_DIR) holding one registry entry per live
 *  server, so a hook event can fan out to every running instance instead of
 *  only the single legacy server.json pointer. See server/src/server.ts. */
export const SERVERS_DIR = 'servers';
/** Valid explicit TCP port range. Port 0 remains an internal-only signal for
 *  OS-assigned ephemeral binding and is never accepted from persisted records
 *  or the CLI's --port option. */
export const MIN_PORT = 1;
export const MAX_PORT = 65_535;
/** Format version stamped on every registry entry (both the per-server records
 *  and the legacy server.json). Bump on breaking field changes; additive
 *  fields (servesSpa, protocol itself) don't require a bump -- readers already
 *  tolerate unknown/missing fields (see ServerConfig.debugLog precedent). */
export const SERVER_REGISTRY_PROTOCOL_VERSION = 1;

// ── WebSocket close codes (application range 4000-4999) ────
/** Embedded mode: Bearer token missing or wrong. */
export const WS_CLOSE_UNAUTHORIZED = 4001;
/** Standalone mode: the handshake's Origin is not this server's own origin.
 *  WebSocket connects bypass CORS, so this is the only thing standing between
 *  a drive-by web page and the privileged client-message channel. */
export const WS_CLOSE_FORBIDDEN_ORIGIN = 4003;

export const HOOK_EVENT_BUFFER_MS = 5_000;
/** Grace period after SessionEnd(reason=clear/resume) before triggering onSessionEnd.
 *  /clear and /resume fire SessionEnd then SessionStart within ms. This timeout is a
 *  safety net: if SessionStart never arrives (e.g. the CLI crashes mid-transition),
 *  the agent is cleaned up instead of staying as a zombie with pendingClear forever. */
export const SESSION_END_GRACE_MS = 2000;
export const MAX_HOOK_BODY_SIZE = 65_536; // 64KB

// ── Layout/Config Persistence ──────────────────────────────
export const LAYOUT_FILE_DIR = '.pixel-agents';
export const LAYOUT_FILE_NAME = 'layout.json';
export const LAYOUT_FILE_POLL_INTERVAL_MS = 2000;
export const LAYOUT_REVISION_KEY = 'layoutRevision';
export const CONFIG_FILE_NAME = 'config.json';
/** ~/.pixel-agents/<name>: pet-care needs, bowls, litter (shared by both surfaces). */
export const PETS_STATE_FILE_NAME = 'pets-state.json';
/** Upper bound for a savePetCare payload, so a hostile client cannot fill the disk. */
export const PETS_STATE_MAX_BYTES = 256 * 1024;

// ── Avatar Customization ────────────────────────────────────
/** Number of pre-colored bundled character palettes (char_0.png–char_12.png, the cats).
 *  Mirrors `PALETTE_COUNT` in webview-ui/src/constants.ts; kept separate
 *  because the server has no DOM/sprite access and cannot import the webview
 *  constant. The two values must stay in sync. */
export const PALETTE_COUNT = 13;
/** Inclusive upper bound for a valid agent hue shift, in degrees. Used by
 *  clientMessageHandler to guard saveAgentSeats payloads from a remote or
 *  hand-edited source corrupting the stored values with out-of-range values. */
export const HUE_SHIFT_MAX_DEG = 360;

// ── Task Board ──────────────────────────────────────────────
/** ~/.pixel-agents/<name>: persisted board tasks, shared by all standalone servers. */
export const TASKS_FILE_NAME = 'tasks.json';
/** ~/.pixel-agents/<dir>/<taskId>: one git worktree per running task. */
export const TASK_WORKTREES_DIR = 'worktrees';
export const TASK_PROMPT_MAX_CHARS = 20_000;
/** Cap on the stored diff of one task, so tasks.json stays small. */
export const TASK_DIFF_MAX_BYTES = 200_000;
export const TASK_LOG_MAX_ENTRIES = 500;
export const TASK_LOG_TEXT_MAX_CHARS = 300;
export const TASK_STDERR_TAIL_CHARS = 2000;

// ── Cat office (orchestrator) ───────────────────────────────
/** ~/.pixel-agents/<name>: cat profiles and hierarchy. */
export const CATS_FILE_NAME = 'cats.json';
/** ~/.pixel-agents/<dir>/<taskId>/: per-cat system prompt and MCP config files of a team task. */
export const ORCHESTRATOR_DIR = 'orchestrator';
/** Office MCP endpoint (HTTP transport) that cat sessions call. */
export const OFFICE_MCP_PATH = '/mcp';
export const TURN_CONCURRENCY_DEFAULT = 6;
export const TURN_CONCURRENCY_MIN = 1;
export const TURN_CONCURRENCY_MAX = 12;
/** Safety stop: a team task that started this many turns ends with an error. */
export const FLOW_MAX_TURNS = 80;
export const CAT_NAME_MAX_CHARS = 40;
export const CAT_SYSTEM_PROMPT_MAX_CHARS = 20_000;
/** Cap on one office message (delegate/ask/reply/report text). */
export const CAT_MESSAGE_MAX_CHARS = 20_000;
/** A cat turn whose session the user holds in a terminal retries after this delay. */
export const SESSION_LOCK_RETRY_MS = 5000;
/** Rows a profile cat's console keeps in memory (all its turns, newest last). */
export const CAT_CONSOLE_MAX_ENTRIES = 400;
/** A cat turn that runs longer than this is killed and fails (no retry). */
export const TURN_TIMEOUT_MS = 1_800_000;
/** A turn that failed for an infrastructure reason (crash, exit code, CLI error) runs again once. */
export const TURN_RETRY_MAX = 1;
export const TURN_RETRY_DELAY_MS = 10_000;
/** ~/.pixel-agents/<dir>/<taskId>/: event log + snapshot of a team task's state machine. */
export const FLOWS_DIR = 'flows';
/** Event logs of tasks older than this are deleted at server start. */
export const FLOW_LOG_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
/** Auto-compact window of every cat turn (CLAUDE_CODE_AUTO_COMPACT_WINDOW). */
export const CAT_AUTO_COMPACT_WINDOW = 200_000;
/** ~/.pixel-agents/<dir>/<catId>.md: one prompt file per cat, in a local git repo. */
export const PROMPTS_DIR = 'prompts';
/** ~/.pixel-agents/<dir>/<timestamp>/: the files "Reset everything" replaced. */
export const BACKUPS_DIR = 'backups';
export const PROMPT_RULES_MAX = 12;
export const PROMPT_LESSONS_MAX = 20;
export const PROMPT_ITEM_MAX_CHARS = 280;
export const PROMPT_FILE_MAX_BYTES = 32 * 1024;

// ── Cat CEO (docs/catavasia/cat-ceo-judge.md) ───────────────
/** Cat id of the judge: its prompt file, its scheduler slot, its resident character. */
export const CAT_CEO_ID = 'cat-ceo';
/** ~/.pixel-agents/<dir>/: review records, guard flags, and the judge's empty cwd. */
export const CAT_CEO_DIR = 'cat-ceo';
/** Reviews wait FIFO; more than this many waiting reviews are dropped (D9). */
export const CAT_CEO_QUEUE_MAX = 10;
/** Hard cost stop of one review (`--max-budget-usd`). */
export const CAT_CEO_BUDGET_USD = 1;
/** A review process that runs longer than this is killed. */
export const CAT_CEO_TIMEOUT_MS = 600_000;
export const CAT_CEO_DIGEST_MAX_CHARS = 60_000;
/** Item changes in one Cat CEO commit (D7). */
export const CAT_CEO_MAX_CHANGES_PER_COMMIT = 3;
export const CAT_CEO_EDITS_PER_DAY_DEFAULT = 2;
/** Default look of the Cat CEO: a gold collar on a tuxedo cat. */
export const CAT_CEO_COLLAR = '#d4af37';
/** Review records kept in cat-ceo/reviews.json (newest). */
export const CAT_CEO_RECORDS_MAX = 300;
/** Regression guard (D8): auto-revert at this mean drop, flag "watch" from WATCH up. */
export const CAT_CEO_GUARD_REVERT_DROP = 15;
export const CAT_CEO_GUARD_WATCH_DROP = 8;
/** After a guard revert, the Cat CEO does not edit that cat for this long. */
export const CAT_CEO_GUARD_BLOCK_MS = 24 * 60 * 60 * 1000;
/** Tidy (cat-ceo-judge.md §14): an automatic tidy starts at this share of the Rules or Lessons cap. */
export const CAT_CEO_TIDY_CAP_SHARE = 0.8;
/** ... or after this many reviews of the cat since its last tidy. */
export const CAT_CEO_TIDY_EVERY_REVIEWS = 10;
/** The sweep tidies every cat once per this period while the office runs. */
export const CAT_CEO_TIDY_SWEEP_MS = 7 * 24 * 60 * 60 * 1000;
export const CAT_CEO_TIDY_SWEEP_CHECK_MS = 60 * 60 * 1000;
/** Automatic tidies leave this many places of the Cat CEO queue to task reviews. */
export const CAT_CEO_TIDY_QUEUE_RESERVE = 3;
/** Item changes in one tidy commit. */
export const CAT_CEO_TIDY_MAX_CHANGES = 8;
/** Review summaries of the cat in the tidy digest. */
export const CAT_CEO_TIDY_SUMMARIES = 5;
/** Prompt commits read for the item history of a tidy (newest). */
export const CAT_CEO_TIDY_LOG_MAX = 200;
/** After a restart, this many newest finished one-cat board tasks get their idle cat back. */
export const TASK_RESTORE_MAX_CATS = 6;
