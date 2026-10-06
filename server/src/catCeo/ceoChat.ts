/**
 * Chat with the Cat CEO (cat-ceo-judge.md §15). A console message to the Cat
 * CEO is a one-off judge run (fresh `claude -p`, same flags, the `cat-ceo`
 * slot and queue) that answers the user. When the user asks for it, the run
 * may also edit Rules and Lessons: the edits pass the review checks
 * (promptPatch) and are committed as `cat-ceo(<cat>): chat — ...`, which the
 * regression guard tracks like every Cat CEO commit. Items the user dictated
 * are named in a `Prompt-User-Items` trailer, so they stay the user's.
 *
 * The chat history lives in `cat-ceo/chat.json` (capped) and is replayed
 * into the Cat CEO console at start.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import type { CatSessionEntry } from '../../../core/src/catSession.js';
import type { CatProfile } from '../../../core/src/messages.js';
import {
  CAT_CEO_CHAT_CONTEXT_MESSAGES,
  CAT_CEO_CHAT_EDITS_PER_DAY,
  CAT_CEO_CHAT_HISTORY_MAX,
} from '../constants.js';
import type { PromptRepo } from '../orchestrator/promptRepo.js';
import {
  buildChatDigest,
  CHAT_RULES,
  CHAT_SCHEMA,
  type ChatEdit,
  parseChatOutput,
} from './ceoChatSchema.js';
import type { CeoSettings } from './ceoSettings.js';
import type { JudgeResult } from './judgeRunner.js';
import type { JudgeAnomaly, JudgeEdit } from './judgeSchema.js';
import { type CatPatch, planEdits, type RejectedEdit } from './promptPatch.js';
import { authorOf } from './regressionGuard.js';
import type { ReviewStore } from './reviewStore.js';
import { redact } from './secretScan.js';
import { itemHistory } from './tidyDigest.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export const CEO_OFF_TEXT =
  'The Cat CEO is turned off. Turn it on in Cats → Cat CEO to chat with it.';

/** A chat commit of the Cat CEO (it does not count against the review edit limit). */
export function isChatCommit(subject: string): boolean {
  return /^cat-ceo\([^)]*\): chat\b/.test(subject);
}

/**
 * The edit checks of promptPatch need an anomaly of medium severity or more.
 * In the chat the user's request is that evidence; the id also tells whether
 * the user dictated the item.
 */
const USER_ITEM = 'user-dictated';
const CEO_ITEM = 'ceo-written';
const CHAT_ANOMALIES: JudgeAnomaly[] = [USER_ITEM, CEO_ITEM].map((id) => ({
  id,
  catId: '',
  kind: 'other',
  severity: 'medium',
  evidence: 'the user asked for this change in the chat',
}));

type ChatEntry = CatSessionEntry & { at: number };

export interface ChatHost {
  prompts: PromptRepo;
  store: ReviewStore;
  settings(): CeoSettings;
  /** The cats of the tree. */
  roster(): CatProfile[];
  /** Queue a job in the Cat CEO slot; false when the queue is full. */
  enqueue(job: () => Promise<void>): boolean;
  judge(rules: string, digest: string, schema: object): Promise<JudgeResult>;
  /** New rows of the Cat CEO console. */
  push(entries: CatSessionEntry[]): void;
  /** The chat started or stopped waiting for an answer. */
  statusChanged(): void;
  working(on: boolean): void;
  promptsChanged(catIds: string[]): void;
  now(): number;
}

export class CeoChat {
  private messages: ChatEntry[];
  private pending = false;

  constructor(
    private readonly host: ChatHost,
    private readonly file: string,
  ) {
    this.messages = this.read();
    host.push(this.entries());
  }

  /** A message is waiting for its answer. */
  get busy(): boolean {
    return this.pending;
  }

  entries(): CatSessionEntry[] {
    return this.messages.map(({ at: _at, ...e }) => e as CatSessionEntry);
  }

  /** A user message. Returns an error when the last one has no answer yet. */
  send(text: string): string | undefined {
    if (this.pending) return 'The Cat CEO is still answering your last message.';
    const recent = this.messages.slice(-CAT_CEO_CHAT_CONTEXT_MESSAGES);
    this.add({ kind: 'user', text });
    if (!this.host.settings().enabled) {
      this.add({ kind: 'error', text: CEO_OFF_TEXT });
      return undefined;
    }
    const chatId = `ch-${crypto.randomBytes(4).toString('hex')}`;
    this.setPending(true);
    if (!this.host.enqueue(() => this.run(text, chatId, recent))) {
      this.setPending(false);
      this.add({ kind: 'error', text: 'The Cat CEO queue is full of reviews. Try again later.' });
    }
    return undefined;
  }

  /** Chat commits still allowed for a cat now (its own limit, apart from reviews). */
  commitsLeft(catId: string): number {
    const since = this.host.now() - DAY_MS;
    const made = this.host.prompts
      .log(catId)
      .filter((c) => authorOf(c.subject) === 'cat-ceo' && isChatCommit(c.subject) && c.at > since);
    return Math.max(0, CAT_CEO_CHAT_EDITS_PER_DAY - made.length);
  }

  private async run(text: string, chatId: string, recent: ChatEntry[]): Promise<void> {
    const { host } = this;
    try {
      // Turned off while the message waited in the queue.
      if (!host.settings().enabled) {
        this.add({ kind: 'error', text: CEO_OFF_TEXT });
        return;
      }
      host.working(true);
      const roster = host.roster();
      for (const c of roster) host.prompts.commitHandEdit(c.id);
      const digest = buildChatDigest({
        cats: roster
          .filter((c) => !host.prompts.read(c.id).error)
          .map((profile) => ({
            profile,
            file: host.prompts.read(profile.id).file,
            meta: itemHistory(profile.id, host.prompts),
          })),
        reviews: host.store.reviews,
        recent: recent.filter((e) => e.kind !== 'error'),
        message: text,
      });
      const result = await host.judge(CHAT_RULES, digest, CHAT_SCHEMA);
      if (!result.ok) throw new Error(`${result.error}${cost(result.costUsd)}`);
      const parsed = parseChatOutput(result.output);
      if (!parsed.ok) throw new Error(`bad chat output: ${parsed.error}${cost(result.costUsd)}`);
      const { applied, rejected } = this.apply(parsed.value.edits, chatId, text);
      this.add({ kind: 'text', text: parsed.value.reply });
      if (applied.length || rejected.length) {
        this.add({
          kind: 'edits',
          text: editSummary(applied, rejected),
          catIds: [...new Set(applied.map((p) => p.catId))],
        });
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[Pixel Agents] Cat CEO chat ${chatId}: ${error}`);
      this.add({ kind: 'error', text: `The Cat CEO could not answer: ${error}` });
    } finally {
      host.working(false);
      this.setPending(false);
    }
  }

  /** Check and commit the edits, one commit per cat, like a review. */
  private apply(
    edits: ChatEdit[],
    chatId: string,
    request: string,
  ): { applied: CatPatch[]; rejected: RejectedEdit[] } {
    if (!edits.length) return { applied: [], rejected: [] };
    const { prompts } = this.host;
    const date = new Date(this.host.now()).toISOString().slice(0, 10);
    const asReview: JudgeEdit[] = edits.map(({ dictated, ...e }) => ({
      ...e,
      anomalyIds: [dictated ? USER_ITEM : CEO_ITEM],
    }));
    const team = this.host
      .roster()
      .map((c) => c.id)
      .filter((id) => !prompts.read(id).error);
    const { patches, rejected } = planEdits(asReview, {
      taskId: chatId,
      date,
      team,
      anomalies: CHAT_ANOMALIES,
      read: (catId) => prompts.read(catId).file,
      commitsLeft: (catId) => this.commitsLeft(catId),
      suffix: `(chat ${chatId}, ${date})`,
    });
    const applied: CatPatch[] = [];
    for (const p of patches) {
      const { subject, body } = chatMessage(p, chatId, request);
      const error = prompts.write(p.catId, p.file, subject, body);
      if (error) {
        rejected.push({
          catId: p.catId,
          reason: error,
          edit: asReview.find((e) => e.catId === p.catId)!,
        });
        continue;
      }
      applied.push(p);
    }
    if (applied.length) this.host.promptsChanged(applied.map((p) => p.catId));
    return { applied, rejected };
  }

  private setPending(on: boolean): void {
    this.pending = on;
    this.host.statusChanged();
  }

  private add(entry: CatSessionEntry): void {
    this.messages = [...this.messages, { ...entry, at: this.host.now() }].slice(
      -CAT_CEO_CHAT_HISTORY_MAX,
    );
    this.write();
    this.host.push([entry]);
  }

  private read(): ChatEntry[] {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as { messages?: unknown };
      return Array.isArray(data.messages) ? (data.messages as ChatEntry[]) : [];
    } catch {
      return [];
    }
  }

  private write(): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ version: 1, messages: this.messages }, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error(`[Pixel Agents] Cat CEO chat: could not save the history: ${String(err)}`);
    }
  }
}

const cut = (text: string, n: number) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);
const cost = (usd: number | undefined) => (usd === undefined ? '' : ` ($${usd.toFixed(3)})`);

/** `cat-ceo(<cat>): chat — <first change>` with the changes and trailers. */
function chatMessage(
  p: CatPatch,
  chatId: string,
  request: string,
): { subject: string; body: string } {
  const first = p.changes[0];
  const summary = `${first.op} ${first.itemId}${first.text ? `: ${first.text}` : ''}`;
  const userIds = p.changes
    .filter((c) => c.op !== 'remove' && c.anomalyIds.includes(USER_ITEM))
    .map((c) => c.itemId);
  const body = [
    `Chat: ${chatId}`,
    `Request: ${cut(redact(request.replace(/\s+/g, ' ').trim()), 200)}`,
    'Changes:',
    ...p.changes.map(
      (c) =>
        `- ${c.op} ${c.section} ${c.itemId}${c.text ? `: ${cut(c.text, 72)}` : ''}${
          c.anomalyIds.includes(USER_ITEM) ? ' (dictated by the user)' : ''
        }`,
    ),
    '',
    'Prompt-Edit-By: cat-ceo',
    `Prompt-Chat: ${chatId}`,
    ...(userIds.length ? [`Prompt-User-Items: ${userIds.join(', ')}`] : []),
  ].join('\n');
  return { subject: `cat-ceo(${p.catId}): chat — ${cut(summary, 60)}`, body };
}

/** The edit row of the chat: what was applied, and what the checks refused. */
function editSummary(applied: CatPatch[], rejected: RejectedEdit[]): string {
  const lines = applied.flatMap((p) =>
    p.changes.map(
      (c) => `${p.catId}: ${c.op} ${c.section} ${c.itemId}${c.text ? ` "${cut(c.text, 80)}"` : ''}`,
    ),
  );
  const refused = rejected.map((r) => `${r.catId}: ${r.reason}`);
  return [
    ...(lines.length ? ['Prompt edits applied:', ...lines.map((l) => `- ${l}`)] : []),
    ...(refused.length ? ['Not applied:', ...refused.map((l) => `- ${l}`)] : []),
  ].join('\n');
}
