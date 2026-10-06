/**
 * Per-cat prompt file (docs/catavasia/context-policy.md §5):
 * `~/.pixel-agents/prompts/<catId>.md` with three sections in this order:
 * `# Role & conduct` (locked: only the user edits it), `# Rules` and
 * `# Lessons` (list items `- [R<n>] text` / `- [L<n>] text`).
 *
 * The parser knows the three headings by their exact text, so a `# ...` line
 * the user wrote inside Role & conduct stays part of the role.
 */

import {
  CAT_SYSTEM_PROMPT_MAX_CHARS,
  PROMPT_FILE_MAX_BYTES,
  PROMPT_ITEM_MAX_CHARS,
  PROMPT_LESSONS_MAX,
  PROMPT_RULES_MAX,
} from '../constants.js';

export interface PromptItem {
  /** `R1`, `L3`, ... Never reused inside one file. */
  id: string;
  text: string;
}

export interface PromptFile {
  role: string;
  rules: PromptItem[];
  lessons: PromptItem[];
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const ROLE = '# Role & conduct';
const RULES = '# Rules';
const LESSONS = '# Lessons';
const ROLE_NOTE =
  '<!-- LOCKED: only the user edits this section (Cats menu). The Cat CEO never changes it. -->';
const LIST_NOTE = '<!-- The Cat CEO may add, replace or remove items. One line per item. -->';

const header = (catId: string) =>
  `<!-- catavasia cat prompt v1 · cat: ${catId} · do not rename the headings -->`;

/** Every cap of §5.3. Returns the first problem, or undefined. */
export function checkPromptFile(file: PromptFile): string | undefined {
  if (file.role.length > CAT_SYSTEM_PROMPT_MAX_CHARS) {
    return `Role & conduct is longer than ${CAT_SYSTEM_PROMPT_MAX_CHARS} characters`;
  }
  if (file.rules.length > PROMPT_RULES_MAX) return `more than ${PROMPT_RULES_MAX} rules`;
  if (file.lessons.length > PROMPT_LESSONS_MAX) return `more than ${PROMPT_LESSONS_MAX} lessons`;
  for (const [items, prefix] of [
    [file.rules, 'R'],
    [file.lessons, 'L'],
  ] as const) {
    const seen = new Set<string>();
    for (const item of items) {
      if (!new RegExp(`^${prefix}[1-9][0-9]*$`).test(item.id)) return `bad item id ${item.id}`;
      if (seen.has(item.id)) return `item id ${item.id} is used twice`;
      seen.add(item.id);
      if (!item.text.trim() || item.text.includes('\n')) return `item ${item.id} must be one line`;
      if (item.text.length > PROMPT_ITEM_MAX_CHARS) {
        return `item ${item.id} is longer than ${PROMPT_ITEM_MAX_CHARS} characters`;
      }
    }
  }
  return undefined;
}

/** The sections as the cat sees them in its system prompt (no HTML notes). */
export function promptSections(file: PromptFile): string {
  const list = (items: PromptItem[]) => items.map((i) => `- [${i.id}] ${i.text}`).join('\n');
  return [ROLE, file.role, RULES, list(file.rules), LESSONS, list(file.lessons)]
    .filter((part) => part !== '')
    .join('\n\n');
}

export function renderPromptFile(catId: string, file: PromptFile): string {
  const list = (items: PromptItem[]) => items.map((i) => `- [${i.id}] ${i.text}\n`).join('');
  return (
    `${header(catId)}\n\n${ROLE}\n${ROLE_NOTE}\n${file.role ? `${file.role}\n` : ''}\n` +
    `${RULES}\n${LIST_NOTE}\n${list(file.rules)}\n` +
    `${LESSONS}\n${LIST_NOTE}\n${list(file.lessons)}`
  );
}

function parseItems(lines: string[], prefix: 'R' | 'L', section: string): PromptItem[] {
  const items: PromptItem[] = [];
  for (const line of lines) {
    if (!line.trim() || /^<!--.*-->$/.test(line.trim())) continue;
    const match = new RegExp(`^- \\[(${prefix}[0-9]+)\\] (.+)$`).exec(line);
    if (!match)
      throw new Error(`${section}: "${line.slice(0, 60)}" is not an item - [${prefix}<n>] text`);
    items.push({ id: match[1], text: match[2].trim() });
  }
  return items;
}

export function parsePromptFile(text: string): Result<PromptFile> {
  try {
    if (Buffer.byteLength(text) > PROMPT_FILE_MAX_BYTES) {
      throw new Error(`the file is larger than ${PROMPT_FILE_MAX_BYTES} bytes`);
    }
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const at = (heading: string) => {
      const found = lines.flatMap((l, i) => (l.trimEnd() === heading ? [i] : []));
      if (found.length !== 1) throw new Error(`the heading "${heading}" must appear exactly once`);
      return found[0];
    };
    const [role, rules, lessons] = [at(ROLE), at(RULES), at(LESSONS)];
    if (!(role < rules && rules < lessons)) {
      throw new Error('the headings must be in the order Role & conduct, Rules, Lessons');
    }
    const before = lines.slice(0, role).filter((l) => l.trim() && !/^<!--.*-->$/.test(l.trim()));
    if (before.length) throw new Error('text before "# Role & conduct"');
    const roleLines = lines.slice(role + 1, rules);
    if (roleLines[0]?.trim() === ROLE_NOTE) roleLines.shift();
    const file: PromptFile = {
      role: roleLines.join('\n').trim(),
      rules: parseItems(lines.slice(rules + 1, lessons), 'R', 'Rules'),
      lessons: parseItems(lines.slice(lessons + 1), 'L', 'Lessons'),
    };
    const problem = checkPromptFile(file);
    if (problem) throw new Error(problem);
    return { ok: true, value: file };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
