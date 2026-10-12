/**
 * Tool activity in plain words (the Claude app's grey summary line): what a
 * run of tool calls did ("Looked at 3 files, ran 2 commands"), and one line
 * per call ("Ran npm test"). Words come from the `terminal` namespace in the
 * current UI language. Pure: the node-side tests import it.
 */

import type { CatSessionEntry } from '../../../core/src/catSession.js';
import type { MessageKey, Params } from '../i18n/core.js';
import { translate } from '../i18n/dictionaries.js';
import { getLanguage } from '../i18n/languageStore.js';
import { terminal } from '../i18n/terminal/en.js';

export type ToolEntry = Extract<CatSessionEntry, { kind: 'tool' }>;
export type ThoughtEntry = Extract<CatSessionEntry, { kind: 'thought' }>;
export type ActivityEntry = ToolEntry | ThoughtEntry;

type Key = MessageKey<typeof terminal>;

const tr = (key: Key, params?: Params): string => translate(terminal, key, getLanguage(), params);

interface Kind {
  /** Groups calls in the summary. */
  key: string;
  one: Key;
  many: Key;
  /** The verb of one call's line ("Ran" + its command). */
  verb: Key;
  /** Placeholder values shared by the three messages. */
  params?: Params;
}

const kind = (key: string, one: Key, many: Key, verb: Key, params?: Params): Kind => ({
  key,
  one,
  many,
  verb,
  params,
});

const READ = kind('read', 'readOne', 'readMany', 'readVerb');
const SEARCH = kind('search', 'searchOne', 'searchMany', 'searchVerb');
const RUN = kind('run', 'runOne', 'runMany', 'runVerb');
const CHANGE = kind('change', 'changeOne', 'changeMany', 'changeVerb');
const PAGE = kind('page', 'pageOne', 'pageMany', 'pageVerb');
const WEB = kind('web', 'webOne', 'webMany', 'webVerb');
const HELPER = kind('helper', 'helperOne', 'helperMany', 'helperVerb');
// One message serves every to-do count.
const TODO = kind('todo', 'todoOne', 'todoOne', 'todoVerb');
const SKILL = kind('skill', 'skillOne', 'skillMany', 'skillVerb');

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
    return kind(`mcp:${service}`, 'mcpOne', 'mcpMany', 'mcpVerb', { service });
  }
  return kind('other', 'otherOne', 'otherMany', 'otherVerb', { name });
}

/** "3s", "1m 5s" (at least 1s). */
export function duration(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  return s < 60
    ? tr('durationSeconds', { s })
    : tr('durationMinutes', { m: Math.floor(s / 60), s: s % 60 });
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
    if (key === 'thought') return tr('thoughtSummary', { duration: duration(thoughtMs) });
    const { kind: k, n } = counts.get(key)!;
    return n === 1 ? tr(k.one, k.params) : tr(k.many, { ...k.params, n });
  });
  const text = parts.join(tr('summarySeparator'));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * One call's line: "Ran" + "npm test", "Looked at" + "src/a.ts", "Thought for 2s" + "",
 * or what the call is for ("List the files" + "").
 */
export function activityLine(entry: ActivityEntry): { verb: string; target: string } {
  if (entry.kind === 'thought') {
    return { verb: tr('thoughtLine', { duration: duration(entry.ms) }), target: '' };
  }
  // A command or helper that says what it is for reads best in its own words.
  if (entry.about) return { verb: entry.about, target: '' };
  const k = kindOf(entry.name);
  const verb = tr(k.verb, k.params);
  // A bare verb drops its trailing colon (ASCII or full-width).
  return entry.text
    ? { verb, target: entry.text }
    : { verb: verb.replace(/[:：]$/, ''), target: '' };
}

/** The picture `step` places away in a gallery of `count`, round from the last to the first. */
export function stepIndex(index: number, count: number, step: number): number {
  return (((index + step) % count) + count) % count;
}
