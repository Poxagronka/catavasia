/**
 * Tool activity in plain words (the Claude app's grey summary line): what a
 * run of tool calls did ("Looked at 3 files, ran 2 commands"), and one line
 * per call ("Ran npm test"). Pure: the node-side tests import it.
 */

import type { CatSessionEntry } from '../../../core/src/catSession.js';

export type ToolEntry = Extract<CatSessionEntry, { kind: 'tool' }>;
export type ThoughtEntry = Extract<CatSessionEntry, { kind: 'thought' }>;
export type ActivityEntry = ToolEntry | ThoughtEntry;

interface Kind {
  /** Groups calls in the summary. */
  key: string;
  one: string;
  many: (n: number) => string;
  /** The verb of one call's line ("Ran" + its command). */
  verb: string;
}

const kind = (key: string, one: string, many: (n: number) => string, verb: string): Kind => ({
  key,
  one,
  many,
  verb,
});

const READ = kind('read', 'looked at a file', (n) => `looked at ${n} files`, 'Looked at');
const SEARCH = kind(
  'search',
  'searched the files',
  (n) => `searched the files ${n} times`,
  'Searched for',
);
const RUN = kind('run', 'ran a command', (n) => `ran ${n} commands`, 'Ran');
const CHANGE = kind('change', 'changed a file', (n) => `changed ${n} files`, 'Changed');
const PAGE = kind('page', 'opened a web page', (n) => `opened ${n} web pages`, 'Opened');
const WEB = kind(
  'web',
  'searched the web',
  (n) => `searched the web ${n} times`,
  'Searched the web for',
);
const HELPER = kind('helper', 'ran a helper', (n) => `ran ${n} helpers`, 'Asked a helper:');
const TODO = kind(
  'todo',
  'updated the to-do list',
  () => 'updated the to-do list',
  'Updated the to-do list',
);
const SKILL = kind('skill', 'used a skill', (n) => `used ${n} skills`, 'Used the skill');

const KINDS: Record<string, Kind> = {
  Read: READ,
  Glob: SEARCH,
  Grep: SEARCH,
  LS: SEARCH,
  Bash: RUN,
  BashOutput: RUN,
  Edit: CHANGE,
  MultiEdit: CHANGE,
  Write: CHANGE,
  NotebookEdit: CHANGE,
  WebFetch: PAGE,
  WebSearch: WEB,
  Task: HELPER,
  Agent: HELPER,
  TodoWrite: TODO,
  TaskCreate: TODO,
  TaskUpdate: TODO,
  Skill: SKILL,
};

/** "claude_ai_Google_Drive" -> "Google Drive". */
function serviceName(server: string): string {
  return (
    server
      .replace(/^claude_ai_/, '')
      .replace(/[_-]+/g, ' ')
      .trim() || server
  );
}

function kindOf(name: string): Kind {
  const known = KINDS[name];
  if (known) return known;
  const mcp = /^mcp__(.+?)__(.+)$/.exec(name);
  if (mcp) {
    const service = serviceName(mcp[1]);
    return kind(
      `mcp:${service}`,
      `used ${service}`,
      (n) => `used ${service} ${n} times`,
      `Used ${service}:`,
    );
  }
  return kind('other', 'used a tool', (n) => `used ${n} tools`, `Used ${name}`);
}

/** "3s", "1m 5s" (at least 1s). */
export function duration(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

/** The summary line of a run: "Thought for 4s, looked at 3 files, ran 2 commands". */
export function activitySummary(entries: ActivityEntry[]): string {
  const counts = new Map<string, { kind: Kind; n: number }>();
  let thoughtMs = 0;
  let thoughts = 0;
  const order: string[] = [];
  for (const e of entries) {
    if (e.kind === 'thought') {
      if (!thoughts++) order.push('thought');
      thoughtMs += e.ms;
      continue;
    }
    const k = kindOf(e.name);
    const seen = counts.get(k.key);
    if (seen) seen.n++;
    else {
      counts.set(k.key, { kind: k, n: 1 });
      order.push(k.key);
    }
  }
  const parts = order.map((key) => {
    if (key === 'thought') return `thought for ${duration(thoughtMs)}`;
    const { kind: k, n } = counts.get(key)!;
    return n === 1 ? k.one : k.many(n);
  });
  const text = parts.join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * One call's line: "Ran" + "npm test", "Looked at" + "src/a.ts", "Thought for 2s" + "",
 * or what the call is for ("List the files" + "").
 */
export function activityLine(entry: ActivityEntry): { verb: string; target: string } {
  if (entry.kind === 'thought') return { verb: `Thought for ${duration(entry.ms)}`, target: '' };
  // A command or helper that says what it is for reads best in its own words.
  if (entry.about) return { verb: entry.about, target: '' };
  const { verb } = kindOf(entry.name);
  return entry.text ? { verb, target: entry.text } : { verb: verb.replace(/:$/, ''), target: '' };
}
