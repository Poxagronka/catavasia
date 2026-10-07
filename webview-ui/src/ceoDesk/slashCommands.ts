/**
 * Slash commands of the CEO composer. The list is Claude Code's own (GET
 * /api/ceo/commands): built-ins, custom commands and skills. A few open the
 * dock's own pickers and cards, because in the terminal they open a screen
 * (catchCommand); every other command goes to Claude as the message, as the
 * terminal does.
 */

import type { DeskCommand } from '../../../core/src/ceoDesk.js';

/** Terminal-only commands the dock answers itself (the SDK does not list them). */
export const DOCK_COMMANDS: DeskCommand[] = [
  { name: 'help', description: 'Show the commands you can type', argumentHint: '' },
  {
    name: 'permissions',
    description: 'Choose what the CEO may do without asking',
    argumentHint: '',
  },
];

/** The CLI's list plus the dock's own commands it lacks. */
export function withDockCommands(cli: DeskCommand[]): DeskCommand[] {
  const known = new Set(cli.map((c) => c.name));
  return [...cli, ...DOCK_COMMANDS.filter((c) => !known.has(c.name))];
}

/** The command name typed so far ("mo" of "/mo"), or null when the menu is not for this draft. */
export function slashQuery(draft: string): string | null {
  const typed = /^\/(\S*)$/.exec(draft);
  return typed ? typed[1].toLowerCase() : null;
}

/**
 * Commands for the typed name: names that start with it first, then names
 * that hold it; Claude Code's own first, each group A to Z.
 */
export function matchCommands(list: DeskCommand[], query: string): DeskCommand[] {
  const names = (c: DeskCommand) => [c.name, ...(c.aliases ?? [])].map((n) => n.toLowerCase());
  const builtinFirst = (a: DeskCommand, b: DeskCommand) =>
    Number(!!b.builtin) - Number(!!a.builtin) || a.name.localeCompare(b.name);
  const starts = list.filter((c) => names(c).some((n) => n.startsWith(query)));
  const holds = list.filter((c) => !starts.includes(c) && c.name.toLowerCase().includes(query));
  return [...starts.sort(builtinFirst), ...holds.sort(builtinFirst)];
}

/** What a command the dock answers itself does. */
export type DockAction =
  | { kind: 'model' | 'effort'; value?: string }
  | { kind: 'permissions' | 'usage' | 'clear' | 'help' | 'connectors' };

/**
 * The dock's own answer to a message, or null: it goes to Claude. `/model`
 * and `/effort` set the CEO's setting (a CLI turn would set it for one turn
 * only); `/mcp` with words after it is Claude Code's (enable, disable...).
 */
export function catchCommand(text: string): DockAction | null {
  const typed = /^\/(\S+)(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!typed) return null;
  const name = typed[1].toLowerCase();
  const rest = typed[2]?.trim() || undefined;
  switch (name) {
    case 'model':
    case 'effort':
      return { kind: name, ...(rest ? { value: rest } : {}) };
    case 'permissions':
      return { kind: 'permissions' };
    case 'context':
    case 'usage':
    case 'cost':
    case 'stats':
      return { kind: 'usage' };
    case 'clear':
    case 'reset':
    case 'new':
      return { kind: 'clear' };
    case 'help':
      return { kind: 'help' };
    case 'mcp':
      return rest ? null : { kind: 'connectors' };
    default:
      return null;
  }
}
