/**
 * Shared constants used across server, extension, and webview.
 * Only constants needed by core interfaces live here.
 * Server-specific timing constants stay in server/src/constants.ts.
 * Webview-specific rendering constants stay in webview-ui/src/constants.ts.
 * Provider-specific constants stay in their provider directory.
 */

// ── Hook API ─────────────────────────────────────────────────

export const HOOK_API_PREFIX = '/api/hooks';
export const SERVER_JSON_DIR = '.pixel-agents';
export const SERVER_JSON_NAME = 'server.json';
export const HOOK_SCRIPTS_DIR = '.pixel-agents/hooks';

// ── Auth ─────────────────────────────────────────────────────

/** The one hint shown wherever the server refuses an edit for a missing or
 *  wrong token (HTTP 401, a rejected WebSocket edit, a disabled control).
 *  `catavasia` prints the office URL with the token in it. */
export const EDIT_RIGHTS_HINT = 'Open the office with `catavasia` to get edit rights';

// ── Display ──────────────────────────────────────────────────

export const BASH_COMMAND_DISPLAY_MAX_LENGTH = 30;
export const TASK_DESCRIPTION_DISPLAY_MAX_LENGTH = 40;

// ── Sub-agents ───────────────────────────────────────────────

/** Render sub-agents and teammates as their own characters. Off: one session
 *  is one character, and the parent alone shows the session's activity. */
export const SUBAGENT_CHARACTERS_ENABLED = false;

// ── Transport ────────────────────────────────────────────────
// Connection-state names for the MessageTransport state machine.

export const TRANSPORT_STATE_CONNECTING = 'connecting';
export const TRANSPORT_STATE_CONNECTED = 'connected';
export const TRANSPORT_STATE_RECONNECTING = 'reconnecting';
export const TRANSPORT_STATE_DISCONNECTED = 'disconnected';

// ── Engines ──────────────────────────────────────────────────

/** npm install command of each engine CLI (package names checked with `npm view`, 2026-10-06). */
export const ENGINE_INSTALL_COMMANDS = {
  claude: 'npm install -g @anthropic-ai/claude-code',
  codex: 'npm install -g @openai/codex',
} as const;

/** Login command of each engine CLI (from `claude auth --help` and `codex --help`). */
export const ENGINE_LOGIN_COMMANDS = {
  claude: ['claude', 'auth', 'login'],
  codex: ['codex', 'login'],
} as const;

/** WS /api/engines/:engine/login runs the engine's login flow in a PTY (server token). */
export const ENGINE_API_PREFIX = '/api/engines';

// ── Feedback ─────────────────────────────────────────────────

/** Images one feedback issue may carry (screenshots and the user's own). */
export const FEEDBACK_MAX_IMAGES = 5;
/** Largest image after the downscale (a bigger one gets downscaled first). */
export const FEEDBACK_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
/** All images of one feedback issue together. */
export const FEEDBACK_MAX_TOTAL_BYTES = 15 * 1024 * 1024;
export const FEEDBACK_TITLE_MAX_CHARS = 200;
export const FEEDBACK_DESCRIPTION_MAX_CHARS = 20_000;
/** Image types the form takes, with the file extension of each. */
export const FEEDBACK_IMAGE_EXTENSIONS: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};
