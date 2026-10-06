/**
 * The chat contract of the Cat CEO (cat-ceo-judge.md §15): the JSON schema of
 * one chat run, the fixed chat rules after the Role in the system prompt, the
 * server check of the `structured_output`, and the input of the run. Edits
 * use the review edit format; the server checks them like review edits.
 */

import type { CatSessionEntry } from '../../../core/src/catSession.js';
import type { CatProfile } from '../../../core/src/messages.js';
import { CAT_CEO_CHAT_REPLY_MAX_CHARS, CAT_CEO_DIGEST_MAX_CHARS } from '../constants.js';
import type { PromptFile } from '../orchestrator/promptFile.js';
import type { EditOp, Section } from './judgeSchema.js';
import { cut } from './reviewDigest.js';
import type { ReviewRecord } from './reviewStore.js';
import { redact } from './secretScan.js';
import { buildTidyDigest, type ItemMeta } from './tidyDigest.js';

export interface ChatEdit {
  catId: string;
  section: Section;
  op: EditOp;
  itemId?: string;
  text?: string;
  reason: string;
  /** The user gave this exact item: it counts as the user's item. */
  dictated: boolean;
}

export interface ChatOutput {
  reply: string;
  edits: ChatEdit[];
}

export const CHAT_SCHEMA = {
  type: 'object',
  required: ['reply'],
  properties: {
    reply: { type: 'string', maxLength: CAT_CEO_CHAT_REPLY_MAX_CHARS },
    edits: {
      type: 'array',
      items: {
        type: 'object',
        required: ['catId', 'section', 'op', 'reason', 'dictated'],
        properties: {
          catId: { type: 'string' },
          section: { enum: ['Rules', 'Lessons'] },
          op: { enum: ['add', 'replace', 'remove'] },
          itemId: { type: 'string', pattern: '^[RL][0-9]+$' },
          text: { type: 'string', maxLength: 280 },
          reason: { type: 'string', maxLength: 200 },
          dictated: { type: 'boolean' },
        },
      },
    },
  },
} as const;

export const CHAT_RULES = `# Chat rules (fixed by the office)

- The user of the office talks to you in a chat. The user message holds the team roster, each cat's prompt file with the history of its items, its recent scores and reviews, the recent chat, and the user's new message. It is all you know. You have no tools.
- reply: answer the new message in plain text, in English, short and concrete (a few sentences or a short list). No markdown headings.
- edits: only when the user asks you to change the Rules or Lessons of a cat. Never edit on your own initiative; suggest it in the reply instead.
- An edit is "add", "replace" (itemId) or "remove" (itemId) of one item in "Rules" or "Lessons" of a roster cat. Rules hold behaviour ("Run the tests before you report"). Lessons hold facts about the repo or tools. At most 3 edits per cat.
- dictated: true when the user gave the exact item text (or named the exact item to remove); false when you wrote the text.
- Item text: one line, at most 240 characters, no markdown headings, no code fences, no "(task ...)" or "(chat ...)" suffix (the office adds it).
- Never edit "Role & conduct" or the Cat CEO (cat-ceo): tell the user to do that in the Cats menu.
- Never put secrets, tokens, names of people, or paths outside the repo into an item.
- The office checks every edit like a review edit and shows the user what it applied or refused. In the reply, say what you changed.
- Write the reply and item text in English, whatever the language of the message.`;

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Check a chat run's structured output. Shape errors fail the run; item rules are promptPatch's. */
export function parseChatOutput(raw: unknown): Result<ChatOutput> {
  const bad = (error: string): Result<ChatOutput> => ({ ok: false, error });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bad('output: not an object');
  const o = raw as Record<string, unknown>;
  if (typeof o.reply !== 'string' || !o.reply.trim()) return bad('reply: not a text');
  const list = o.edits ?? [];
  if (!Array.isArray(list)) return bad('edits: not an array');
  const edits: ChatEdit[] = [];
  for (const [i, x] of list.entries()) {
    const r = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    if (typeof r.catId !== 'string') return bad(`edits[${i}].catId: not a string`);
    if (r.section !== 'Rules' && r.section !== 'Lessons') return bad(`edits[${i}].section`);
    if (r.op !== 'add' && r.op !== 'replace' && r.op !== 'remove') return bad(`edits[${i}].op`);
    if (r.itemId !== undefined && typeof r.itemId !== 'string') return bad(`edits[${i}].itemId`);
    // No cut of the text: an over-long item is refused by the patch check, not shortened.
    if (r.text !== undefined && typeof r.text !== 'string') return bad(`edits[${i}].text`);
    edits.push({
      catId: r.catId,
      section: r.section,
      op: r.op,
      ...(r.itemId !== undefined ? { itemId: r.itemId as string } : {}),
      ...(r.text !== undefined ? { text: r.text as string } : {}),
      reason: typeof r.reason === 'string' ? r.reason.slice(0, 200) : '',
      dictated: r.dictated === true,
    });
  }
  return {
    ok: true,
    value: { reply: o.reply.trim().slice(0, CAT_CEO_CHAT_REPLY_MAX_CHARS), edits },
  };
}

/** One cat as the chat input sees it: profile, prompt file and item history. */
export interface ChatCat {
  profile: CatProfile;
  file: PromptFile;
  meta: Map<string, ItemMeta>;
}

const LINE_MAX = 1500;

/**
 * The chat input: roster, one tidy-style block per cat (Role, score trend,
 * recent reviews, items with history), the recent chat, the new message.
 * The cat blocks are cut first when the input is too long.
 */
export function buildChatDigest(input: {
  cats: ChatCat[];
  reviews: readonly ReviewRecord[];
  recent: CatSessionEntry[];
  message: string;
}): string {
  const byId = new Map(input.cats.map((c) => [c.profile.id, c.profile]));
  const roster = input.cats.map(({ profile: p }) => {
    const boss = p.parentId ? (byId.get(p.parentId)?.name ?? p.parentId) : 'nobody (the boss)';
    return `- ${p.id} "${p.name}": ${p.role || 'no role'}; reports to ${boss}; ${p.engine} ${p.model}`;
  });
  const speaker = (e: CatSessionEntry) =>
    e.kind === 'user' ? 'User' : e.kind === 'text' ? 'Cat CEO' : 'Office';
  const chat = input.recent.map(
    (e) => `${speaker(e)}: ${cut('text' in e ? e.text : '', LINE_MAX)}`,
  );
  const head = [
    '# Chat with the user',
    '',
    '## Team roster',
    roster.join('\n') || 'No cats.',
    '',
  ].join('\n');
  const tail = [
    '',
    '## Recent chat (oldest first)',
    chat.join('\n') || 'No earlier messages.',
    '',
    "## The user's new message",
    cut(input.message, 8000),
  ].join('\n');
  const cats = input.cats
    .map((c) =>
      buildTidyDigest({
        catId: c.profile.id,
        file: c.file,
        meta: c.meta,
        reviews: input.reviews,
        heading: `## Cat ${c.profile.id} (${c.profile.name})`,
      }),
    )
    .join('\n\n');
  const room = Math.max(1000, CAT_CEO_DIGEST_MAX_CHARS - head.length - tail.length);
  return redact(`${head}${cut(cats, room)}\n${tail}`);
}
