/**
 * Prompt hygiene of the Cat CEO (cat-ceo-judge.md §14): a tidy re-checks one
 * cat's Rules and Lessons and merges, rewrites or removes items. It is a
 * fresh `claude -p` like a review, in the same `cat-ceo` scheduler slot and
 * queue, and its result is one commit `cat-ceo(<cat>): tidy — ...` that the
 * regression guard tracks like any Cat CEO edit.
 *
 * Triggers: Rules or Lessons at 80 % of the cap, 10 reviews of the cat since
 * its last tidy, "Tidy now" in Prompt history, and a weekly sweep. Automatic
 * tidies: at most one per cat per 24 h, none while the guard blocks the cat.
 * Every tidy is skipped when the file did not change since the last one.
 */

import * as crypto from 'crypto';

import type { ServerMessage, TidyTrigger } from '../../../core/src/messages.js';
import {
  CAT_CEO_ID,
  CAT_CEO_TIDY_CAP_SHARE,
  CAT_CEO_TIDY_EVERY_REVIEWS,
  CAT_CEO_TIDY_QUEUE_RESERVE,
  CAT_CEO_TIDY_SWEEP_CHECK_MS,
  CAT_CEO_TIDY_SWEEP_MS,
  PROMPT_LESSONS_MAX,
  PROMPT_RULES_MAX,
} from '../constants.js';
import type { PromptRepo } from '../orchestrator/promptRepo.js';
import type { CeoSettings } from './ceoSettings.js';
import type { JudgeResult } from './judgeRunner.js';
import type { ReviewStore, TidyRecord } from './reviewStore.js';
import { buildTidyDigest, itemHistory, metaOf } from './tidyDigest.js';
import { planTidy, type TidyPlan } from './tidyPatch.js';
import { parseTidyOutput, TIDY_RULES, TIDY_SCHEMA } from './tidySchema.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** A tidy commit of the Cat CEO (it does not count against the review edit limit). */
export function isTidyCommit(subject: string): boolean {
  return /^cat-ceo\([^)]*\): tidy\b/.test(subject);
}

export interface TidyHost {
  prompts: PromptRepo;
  store: ReviewStore;
  settings(): CeoSettings;
  /** Cats of the tree (the sweep's list). */
  catIds(): string[];
  /** Queue a job in the Cat CEO slot; false when the queue is full. */
  enqueue(job: () => Promise<void>): boolean;
  /** Free places in the Cat CEO queue (reviews and tidies share it). */
  queueRoom(): number;
  /** One judge run with the Cat CEO's Role + `rules` as the system prompt. */
  judge(rules: string, digest: string, schema: object): Promise<JudgeResult>;
  emit(message: ServerMessage): void;
  log(kind: 'user' | 'text' | 'error', text: string): void;
  working(on: boolean): void;
  promptsChanged(catIds: string[]): void;
  now(): number;
}

export class CatTidy {
  private readonly pending = new Set<string>();
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly host: TidyHost) {}

  /** The weekly sweep: checked at start and every hour while the office runs. */
  start(): void {
    this.sweep();
    this.timer = setInterval(() => this.sweep(), CAT_CEO_TIDY_SWEEP_CHECK_MS);
    this.timer.unref();
  }

  dispose(): void {
    clearInterval(this.timer);
  }

  /** After a review: tidy each scored cat that reached a trigger. */
  afterReview(catIds: string[]): void {
    for (const catId of catIds) {
      const trigger = this.autoTrigger(catId);
      if (trigger) this.request(catId, trigger);
    }
  }

  /** "Tidy now" of the Prompt history. Returns an error, or undefined when queued. */
  requestManual(catId: string): string | undefined {
    if (catId === CAT_CEO_ID) return 'The Cat CEO never tidies its own prompt.';
    if (!this.host.settings().enabled) return 'Cat CEO reviews are off.';
    if (this.pending.has(catId)) return 'A tidy of this cat is queued already.';
    this.host.prompts.commitHandEdit(catId);
    const skip = this.skipReason(catId, 'manual');
    if (skip) return `Nothing to tidy: ${skip}.`;
    return this.request(catId, 'manual') ? undefined : 'The Cat CEO queue is full.';
  }

  /** Once per CAT_CEO_TIDY_SWEEP_MS: every cat that changed since its last tidy. */
  sweep(): void {
    const { store } = this.host;
    const now = this.host.now();
    if (!this.host.settings().enabled) return;
    // The first start only sets the clock: an upgrade does not tidy every cat at once.
    if (store.lastSweep === undefined) store.lastSweep = now;
    if (now - store.lastSweep < CAT_CEO_TIDY_SWEEP_MS) return;
    let all = true;
    for (const catId of this.host.catIds()) {
      this.host.prompts.commitHandEdit(catId);
      if (this.pending.has(catId) || this.skipReason(catId, 'sweep')) continue;
      // A cat that finds no room waits for the next hourly check of this sweep.
      if (!this.request(catId, 'sweep')) all = false;
    }
    if (all) store.lastSweep = now;
  }

  /** Why an automatic tidy of the cat starts now (cap, reviews), or undefined. */
  autoTrigger(catId: string): TidyTrigger | undefined {
    if (!this.host.settings().enabled || catId === CAT_CEO_ID) return undefined;
    if (this.skipReason(catId, 'cap')) return undefined;
    const { file } = this.host.prompts.read(catId);
    const near = (n: number, cap: number) => n >= Math.ceil(cap * CAT_CEO_TIDY_CAP_SHARE);
    if (near(file.rules.length, PROMPT_RULES_MAX) || near(file.lessons.length, PROMPT_LESSONS_MAX))
      return 'cap';
    const since = this.host.store.lastTidy(catId)?.at ?? 0;
    const reviews = this.host.store.reviews.filter(
      (r) => r.at > since && r.scores.some((s) => s.catId === catId),
    ).length;
    return reviews >= CAT_CEO_TIDY_EVERY_REVIEWS ? 'reviews' : undefined;
  }

  /** Why a tidy of this kind may not run now, or undefined. */
  private skipReason(catId: string, trigger: TidyTrigger): string | undefined {
    const { prompts, store } = this.host;
    const { file, error } = prompts.read(catId);
    if (error) return error;
    if (file.rules.length + file.lessons.length < 2) return 'fewer than 2 items';
    const last = [...store.tidies].reverse().find((t) => t.catId === catId && t.head);
    if (last && last.head === prompts.headSha(catId)) return 'no change since the last tidy';
    if (trigger === 'manual') return undefined;
    const now = this.host.now();
    if (store.blocked(catId, now)) return 'the guard blocks Cat CEO edits of this cat';
    const recent = store.tidies.some(
      (t) => t.catId === catId && t.trigger !== 'manual' && t.at > now - DAY_MS,
    );
    return recent ? 'one automatic tidy per cat per day' : undefined;
  }

  private request(catId: string, trigger: TidyTrigger): boolean {
    if (this.pending.has(catId)) return false;
    // Automatic tidies leave room in the shared queue for task reviews.
    if (trigger !== 'manual' && this.host.queueRoom() <= CAT_CEO_TIDY_QUEUE_RESERVE) return false;
    const tidyId = `td-${crypto.randomBytes(4).toString('hex')}`;
    if (!this.host.enqueue(() => this.run(catId, trigger, tidyId))) return false;
    this.pending.add(catId);
    this.tell(catId, 'queued', `Tidy of ${catId} queued (${trigger}).`);
    return true;
  }

  private tell(
    catId: string,
    state: 'queued' | 'done' | 'skipped' | 'failed',
    text: string,
    extra: { sha?: string; changed?: number; costUsd?: number } = {},
  ): void {
    this.host.emit({ type: 'promptTidy', catId, state, text, ...extra });
  }

  private async run(catId: string, trigger: TidyTrigger, tidyId: string): Promise<void> {
    const { prompts, store } = this.host;
    const at = this.host.now();
    let costUsd: number | undefined;
    try {
      prompts.commitHandEdit(catId);
      const skip = this.skipReason(catId, trigger);
      if (skip) {
        this.tell(catId, 'skipped', `Tidy of ${catId} skipped: ${skip}.`);
        return;
      }
      const head = prompts.headSha(catId);
      const file = prompts.read(catId).file;
      const meta = itemHistory(catId, prompts);
      this.host.working(true);
      this.host.log('user', `Tidy the Rules and Lessons of ${catId} (${trigger})`);
      const digest = buildTidyDigest({ catId, file, meta, reviews: store.reviews });
      const result = await this.host.judge(TIDY_RULES, digest, TIDY_SCHEMA);
      costUsd = result.costUsd;
      if (!result.ok) throw new Error(result.error);
      const parsed = parseTidyOutput(result.output);
      if (!parsed.ok) throw new Error(`bad tidy output: ${parsed.error}`);
      // A user change while the judge ran: its input is stale, apply nothing.
      prompts.commitHandEdit(catId);
      if (prompts.headSha(catId) !== head) throw new Error('the prompt changed during the tidy');
      const date = new Date(at).toISOString().slice(0, 10);
      const plan = planTidy(file, parsed.value.ops, {
        meta,
        userItems: this.host.settings().tidyUserItems,
        mergeSuffix: `(tidy ${tidyId}, ${date})`,
      });
      const applied = plan.rows.filter((r) => r.applied);
      let sha: string | undefined;
      if (applied.length) {
        // A merge of user items stays the user's: the next tidy may not remove it.
        const userIds = applied
          .filter(
            (r) => r.op === 'merge' && r.before.some((i) => metaOf(meta, i.id).owner === 'user'),
          )
          .map((r) => r.after!.id);
        const { subject, body } = tidyMessage(
          catId,
          tidyId,
          trigger,
          parsed.value.summary,
          plan,
          userIds,
        );
        const error = prompts.write(catId, plan.file, subject, body);
        if (error) throw new Error(error);
        sha = prompts.headSha(catId);
        this.host.promptsChanged([catId]);
      }
      const record: TidyRecord = {
        tidyId,
        catId,
        at,
        trigger,
        head: prompts.headSha(catId),
        ...(sha ? { sha } : {}),
        summary: parsed.value.summary,
        ...(costUsd !== undefined ? { costUsd } : {}),
        rows: plan.rows,
        rejected: plan.rejected.map(({ op, reason }) => ({
          op: op.op,
          itemIds: op.itemIds,
          reason,
        })),
      };
      store.addTidy(record);
      const marked = plan.rows.length - applied.length;
      const text = [
        applied.length ? `tidied ${count(applied.length, 'item')}` : 'nothing to tidy',
        ...(marked ? [`${marked} marked for you`] : []),
      ].join(', ');
      this.tell(catId, 'done', `${catId}: ${text}${cost(costUsd)}`, {
        ...(sha ? { sha } : {}),
        changed: applied.length,
        ...(costUsd !== undefined ? { costUsd } : {}),
      });
      this.host.log('text', `Tidy of ${catId}: ${text}. ${parsed.value.summary}${cost(costUsd)}`);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      // A failed run still counts for the daily limit: no retry loop after every review.
      store.addTidy({
        tidyId,
        catId,
        at,
        trigger,
        failed: true,
        summary: error,
        rows: [],
        rejected: [],
      });
      this.tell(catId, 'failed', `Tidy of ${catId} failed: ${error}${cost(costUsd)}`);
      this.host.log('error', `Tidy of ${catId}: ${error}`);
    } finally {
      this.host.working(false);
      this.pending.delete(catId);
    }
  }
}

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const cost = (usd: number | undefined) => (usd === undefined ? '' : ` ($${usd.toFixed(3)})`);
const cut = (text: string, n: number) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

/** `cat-ceo(<cat>): tidy — merged N, rewrote M, removed K` with the changes and trailers. */
function tidyMessage(
  catId: string,
  tidyId: string,
  trigger: TidyTrigger,
  summary: string,
  plan: TidyPlan,
  userIds: string[],
): { subject: string; body: string } {
  const n = (op: string) => plan.rows.filter((r) => r.applied && r.op === op).length;
  const line = (r: TidyPlan['rows'][number]) =>
    `- ${r.op} ${r.section} ${r.before.map((i) => i.id).join('+')}${
      r.after ? ` -> ${r.after.id}: ${cut(r.after.text, 72)}` : `: ${cut(r.reason, 72)}`
    }`;
  const marked = plan.rows.filter((r) => !r.applied);
  const body = [
    `Tidy: ${tidyId}  Trigger: ${trigger}`,
    `Summary: ${cut(summary, 200)}`,
    'Changes:',
    ...plan.rows.filter((r) => r.applied).map(line),
    ...(marked.length ? ['Marked for the user (not applied):', ...marked.map(line)] : []),
    '',
    'Prompt-Edit-By: cat-ceo',
    `Prompt-Tidy: ${tidyId}`,
    ...(userIds.length ? [`Prompt-User-Items: ${userIds.join(', ')}`] : []),
  ].join('\n');
  return {
    subject: `cat-ceo(${catId}): tidy — merged ${n('merge')}, rewrote ${n('rewrite')}, removed ${n('remove')}`,
    body,
  };
}
