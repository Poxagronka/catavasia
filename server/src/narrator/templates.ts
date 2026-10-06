/**
 * Deterministic narrator templates: one normalized event -> one short English
 * status line + work state. Pure, no I/O. Routine events never reach Haiku.
 */

import {
  NARRATOR_LINE_MAX_CHARS,
  type NarratorInput,
  type NarratorState,
} from '../../../core/src/narrator.js';

interface Template {
  state: NarratorState;
  line: string;
}

const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS', 'NotebookRead']);
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);

/** Office MCP tools (orchestration phase 1), matched by the tool-name suffix. */
const OFFICE_TOOLS: Record<string, Template> = {
  brief: { state: 'thinking', line: 'holding a briefing' },
  delegate: { state: 'thinking', line: 'delegating tasks' },
  report: { state: 'thinking', line: 'writing a report' },
  ask: { state: 'waiting', line: 'asking a teammate' },
  reply: { state: 'thinking', line: 'replying to a teammate' },
  list_team: { state: 'thinking', line: 'checking the team' },
};

const FIXED_TOOLS: Record<string, Template> = {
  WebSearch: { state: 'reading', line: 'searching the web' },
  WebFetch: { state: 'reading', line: 'reading a web page' },
  Task: { state: 'thinking', line: 'delegating a subtask' },
  Agent: { state: 'thinking', line: 'delegating a subtask' },
  TodoWrite: { state: 'thinking', line: 'making a plan' },
  AskUserQuestion: { state: 'waiting', line: 'waiting for your input' },
  ExitPlanMode: { state: 'waiting', line: 'waiting for plan approval' },
};

const STATE_EVENTS: Record<string, Template> = {
  thinking: { state: 'thinking', line: 'thinking' },
  permission: { state: 'waiting', line: 'waiting for permission' },
  input: { state: 'waiting', line: 'waiting for your input' },
  done: { state: 'done', line: 'done' },
  error: { state: 'error', line: 'error' },
};

// Bash command classes. Order matters: the first match wins.
const TEST_RE =
  /\b(vitest|jest|pytest|mocha|playwright test|go test|cargo test|swift test|xcodebuild test|(npm|pnpm|yarn|bun) (run )?(test|e2e)\w*|make test)\b/;
const LINT_RE =
  /\b(eslint|ruff|prettier|mypy|tsc|(npm|pnpm|yarn|bun) run (lint|check-types|typecheck|format)\w*)\b/;
const BUILD_RE =
  /\b((npm|pnpm|yarn|bun) run (build|compile|package)\w*|make|cargo build|go build|esbuild|vite build)\b/;
const INSTALL_RE =
  /\b((npm|pnpm|yarn|bun) (ci|install|add|i)|pip3? install|brew install|uv (sync|add))\b/;

function bashTemplate(command: string): Template {
  const cmd = command.trim();
  if (TEST_RE.test(cmd)) return { state: 'testing', line: 'running tests' };
  // A chain like "git add -A && git commit" is named by its strongest step.
  const gitSteps = [...cmd.matchAll(/(?:^|&&\s*|;\s*)git\s+(?:-C\s+\S+\s+)?([\w-]+)/g)].map(
    (m) => m[1],
  );
  if (gitSteps.includes('commit')) return { state: 'editing', line: 'committing' };
  if (gitSteps.includes('push')) return { state: 'editing', line: 'pushing changes' };
  if (gitSteps.some((g) => ['merge', 'rebase', 'cherry-pick'].includes(g))) {
    return { state: 'editing', line: 'merging branches' };
  }
  if (gitSteps.length > 0) return { state: 'reading', line: 'checking git history' };
  if (/^gh\s+pr\b/.test(cmd)) return { state: 'editing', line: 'opening a pull request' };
  if (LINT_RE.test(cmd)) return { state: 'testing', line: 'running the linter' };
  if (BUILD_RE.test(cmd)) return { state: 'testing', line: 'building the project' };
  if (INSTALL_RE.test(cmd)) return { state: 'editing', line: 'installing dependencies' };
  if (/^(ls|cat|head|tail|find|grep|rg|wc|tree|pwd)\b/.test(cmd)) {
    return { state: 'reading', line: 'reading code' };
  }
  return { state: 'editing', line: 'running a command' };
}

/** Last path segment, or undefined for an empty path. */
function baseName(file: string | undefined): string | undefined {
  const name = file?.split(/[\\/]/).filter(Boolean).pop();
  return name || undefined;
}

/** Cut to the line limit with an ellipsis. */
export function clipLine(line: string, max = NARRATOR_LINE_MAX_CHARS): string {
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function toolTemplate(tool: string, file: string | undefined, text: string | undefined): Template {
  if (READ_TOOLS.has(tool)) return { state: 'reading', line: 'reading code' };
  if (EDIT_TOOLS.has(tool)) {
    const name = baseName(file);
    return { state: 'editing', line: name ? `editing ${name}` : 'editing code' };
  }
  if (tool === 'Bash' || tool === 'BashOutput') return bashTemplate(text ?? '');
  const fixed = FIXED_TOOLS[tool];
  if (fixed) return fixed;
  if (tool.startsWith('mcp__')) {
    const office = OFFICE_TOOLS[tool.split('__').pop() ?? ''];
    return office ?? { state: 'thinking', line: 'using an external tool' };
  }
  return { state: 'thinking', line: 'working' };
}

/**
 * Map one event to a status line. Returns null for an event that changes
 * nothing on its own (an unknown state token, a message without a sender).
 */
export function templateFor(input: NarratorInput): Template | null {
  let t: Template | null = null;
  switch (input.kind) {
    case 'tool':
      t = input.tool ? toolTemplate(input.tool, input.file, input.text) : null;
      break;
    case 'state':
      t = STATE_EVENTS[input.text ?? ''] ?? null;
      break;
    case 'message':
      t = { state: 'thinking', line: input.to ? `messaging ${input.to}` : 'talking to a teammate' };
      break;
    case 'result':
      t = { state: 'done', line: 'handed in the result' };
      break;
  }
  return t && { state: t.state, line: clipLine(t.line) };
}
