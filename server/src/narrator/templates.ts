/**
 * Deterministic narrator templates: one normalized event -> one work phase
 * (an abstract cat-voice English line + work state). Pure, no I/O. Routine
 * events never reach Haiku.
 */

import {
  NARRATOR_LINE_MAX_CHARS,
  type NarratorInput,
  type NarratorState,
} from '../../../core/src/narrator.js';
import { messages as en, narrator } from '../i18n/narrator/en.js';
import { translate } from '../i18n/translate.js';

type PhaseKey = keyof typeof en;

interface Template {
  state: NarratorState;
  /** The English line. Other languages come from the `narrator` namespace by `key`. */
  line: string;
  key: PhaseKey;
}

function phase(state: NarratorState, key: PhaseKey): Template {
  return { state, line: en[key], key };
}

/**
 * Work phases, each with one abstract cat-voice line (user, 2026-10-06).
 * Lines never name files, commands or tools: the raw tool status setting in
 * the webview shows those. The text lives in server/src/i18n/narrator/<language>.ts.
 */
export const PHASES = {
  planning: phase('thinking', 'planning'),
  exploring: phase('reading', 'exploring'),
  building: phase('editing', 'building'),
  testing: phase('testing', 'testing'),
  reviewing: phase('reading', 'reviewing'),
  delivering: phase('editing', 'delivering'),
  // A skill (Claude's Skill tool): the cat reads a book from the office shelf.
  skill: phase('reading', 'skill'),
  briefing: phase('thinking', 'briefing'),
  delegating: phase('thinking', 'delegating'),
  teammate: phase('thinking', 'teammate'),
  input: phase('waiting', 'input'),
  permission: phase('waiting', 'permission'),
  done: phase('done', 'done'),
  error: phase('error', 'error'),
} satisfies Record<string, Template>;

const EXPLORE_TOOLS = new Set([
  'Read',
  'Grep',
  'Glob',
  'LS',
  'NotebookRead',
  'WebSearch',
  'WebFetch',
]);
const BUILD_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);

/** Office MCP tools (orchestration phase 1), matched by the tool-name suffix. */
const OFFICE_TOOLS: Record<string, Template> = {
  brief: PHASES.briefing,
  delegate: PHASES.delegating,
  report: PHASES.delivering,
  ask: phase('waiting', 'teammate'),
  reply: PHASES.teammate,
  list_team: PHASES.planning,
};

const FIXED_TOOLS: Record<string, Template> = {
  Task: PHASES.delegating,
  Agent: PHASES.delegating,
  Skill: PHASES.skill,
  TodoWrite: PHASES.planning,
  AskUserQuestion: PHASES.input,
  ExitPlanMode: PHASES.input,
};

const STATE_EVENTS: Record<string, Template> = {
  thinking: PHASES.planning,
  permission: PHASES.permission,
  input: PHASES.input,
  done: PHASES.done,
  error: PHASES.error,
};

// Bash command classes. Order matters: the first match wins.
const TEST_RE =
  /\b(vitest|jest|pytest|mocha|playwright test|go test|cargo test|swift test|xcodebuild test|(npm|pnpm|yarn|bun) (run )?(test|e2e)\w*|make test)\b/;
const LINT_RE =
  /\b(eslint|ruff|prettier|mypy|tsc|(npm|pnpm|yarn|bun) run (lint|check-types|typecheck|format)\w*)\b/;
const BUILD_RE =
  /\b((npm|pnpm|yarn|bun) run (build|compile|package)\w*|make|cargo build|go build|esbuild|vite build)\b/;

function bashTemplate(command: string): Template {
  const cmd = command.trim();
  if (TEST_RE.test(cmd)) return PHASES.testing;
  // A chain like "git add -A && git commit" is named by its strongest step.
  const gitSteps = [...cmd.matchAll(/(?:^|&&\s*|;\s*)git\s+(?:-C\s+\S+\s+)?([\w-]+)/g)].map(
    (m) => m[1],
  );
  if (gitSteps.some((g) => ['commit', 'push', 'merge', 'rebase', 'cherry-pick'].includes(g))) {
    return PHASES.delivering;
  }
  if (/^gh\s+pr\s+(create|merge)\b/.test(cmd)) return PHASES.delivering;
  if (gitSteps.length > 0 || /^gh\s+pr\b/.test(cmd)) return PHASES.reviewing;
  if (LINT_RE.test(cmd) || BUILD_RE.test(cmd)) return PHASES.testing;
  if (/^(ls|cat|head|tail|find|grep|rg|wc|tree|pwd)\b/.test(cmd)) return PHASES.exploring;
  return PHASES.building;
}

/** Cut to the line limit with an ellipsis. */
export function clipLine(line: string, max = NARRATOR_LINE_MAX_CHARS): string {
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function toolTemplate(tool: string, text: string | undefined): Template {
  if (EXPLORE_TOOLS.has(tool)) return PHASES.exploring;
  if (BUILD_TOOLS.has(tool)) return PHASES.building;
  if (tool === 'Bash' || tool === 'BashOutput') return bashTemplate(text ?? '');
  const fixed = FIXED_TOOLS[tool];
  if (fixed) return fixed;
  if (tool.startsWith('mcp__')) {
    return OFFICE_TOOLS[tool.split('__').pop() ?? ''] ?? PHASES.exploring;
  }
  return PHASES.planning;
}

/**
 * Map one event to a status line. Returns null for an event that changes
 * nothing on its own (an unknown state token, a tool event without a name).
 */
export function templateFor(
  input: NarratorInput,
  language?: string,
): { state: NarratorState; line: string } | null {
  let t: Template | null = null;
  switch (input.kind) {
    case 'tool':
      t = input.tool ? toolTemplate(input.tool, input.text) : null;
      break;
    case 'state':
      t = STATE_EVENTS[input.text ?? ''] ?? null;
      break;
    case 'message':
      t = PHASES.teammate;
      break;
    case 'result':
      t = PHASES.done;
      break;
  }
  return t && { state: t.state, line: clipLine(translate(narrator, t.key, language)) };
}
