/**
 * The Cat CEO (docs/catavasia/cat-ceo-judge.md): a judge above the boss. Each
 * finished team task (done or error, with a cat turn) gets one review: a fresh
 * `claude -p` with a server-built digest, a scheduler slot under `cat-ceo`
 * (one at a time, FIFO, at most 10 waiting), item-level prompt edits checked
 * by promptPatch and committed one per cat, then the regression guard.
 *
 * Memory between reviews is the review records (scores per prompt version)
 * and the prompts repo history: the judge itself keeps no session.
 */

import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

import type { CatProfile, ReviewFinished, ServerMessage } from '../../../core/src/messages.js';
import type { TaskReview } from '../../../core/src/tasks.js';
import { editPrompt, isChatCommit, type PromptEdit } from '../ceoDesk/promptEditTool.js';
import {
  CAT_CEO_BUDGET_USD,
  CAT_CEO_DIR,
  CAT_CEO_ID,
  CAT_CEO_QUEUE_MAX,
  CAT_CEO_TIMEOUT_MS,
} from '../constants.js';
import type { CatConsoles } from '../orchestrator/catConsoles.js';
import type { CatStore, EngineCatalog } from '../orchestrator/catProfiles.js';
import type { CatResidents } from '../orchestrator/catResidents.js';
import { EventLog } from '../orchestrator/machine/eventLog.js';
import { reduce } from '../orchestrator/machine/taskReducer.js';
import type { TaskEvent, TaskState } from '../orchestrator/machine/types.js';
import type { TurnScheduler } from '../orchestrator/turnScheduler.js';
import type { StoredTask } from '../taskBoard/taskStore.js';
import {
  CEO_DEFAULT_ROLE,
  ceoProfile,
  type CeoSettings,
  checkCeoPatch,
  JUDGE_RULES,
  readCeoSettings,
} from './ceoSettings.js';
import { type JudgeRequest, type JudgeResult, runJudge } from './judgeRunner.js';
import { type JudgeOutput, parseJudgeOutput } from './judgeSchema.js';
import { planEdits } from './promptPatch.js';
import { authorOf, runGuard } from './regressionGuard.js';
import { buildDigest, type CatHistory } from './reviewDigest.js';
import { branchDiffs, commitMessage } from './reviewGit.js';
import { type ReviewRecord, ReviewStore } from './reviewStore.js';
import { CatTidy, isTidyCommit } from './tidy.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CatCeoOptions {
  stateDir: string;
  cats: CatStore;
  scheduler: TurnScheduler;
  residents: () => CatResidents;
  consoles: CatConsoles;
  catalog: () => EngineCatalog;
  emit: (message: ServerMessage) => void;
  /** The prompts of some cats changed: rebroadcast the profiles. */
  promptsChanged: (catIds: string[]) => void;
  claudeBin?: string;
  /** Test seam: the judge process. */
  judge?: (req: JudgeRequest) => Promise<JudgeResult>;
  now?: () => number;
}

/** Where a review writes the task back (the task board). */
export interface ReviewSink {
  save(task: StoredTask): void;
}

export class CatCeo {
  readonly store: ReviewStore;
  private waiting = 0;
  /** Reviews and tidies in flight (tests wait for them). */
  readonly running = new Set<Promise<void>>();
  /** Prompt hygiene: tidies of the cats' Rules and Lessons (§14). */
  readonly tidy: CatTidy;
  /** `change`: the settings were saved (the CEO dock applies model and mode to its live session). */
  readonly events = new EventEmitter<{ change: [] }>();

  constructor(private readonly opts: CatCeoOptions) {
    this.store = new ReviewStore(path.join(opts.stateDir, CAT_CEO_DIR, 'reviews.json'));
    const prompts = opts.cats.prompts;
    if (!prompts.exists(CAT_CEO_ID)) {
      prompts.write(
        CAT_CEO_ID,
        { role: CEO_DEFAULT_ROLE, rules: [], lessons: [] },
        `user(${CAT_CEO_ID}): create`,
      );
    } else {
      prompts.commitHandEdit(CAT_CEO_ID);
    }
    this.tidy = new CatTidy({
      prompts,
      store: this.store,
      settings: () => this.settings,
      catIds: () => opts.cats.list().map((c) => c.id),
      queueRoom: () => CAT_CEO_QUEUE_MAX - this.waiting,
      enqueue: (job) =>
        this.enqueue(job, (err) => console.error(`[catavasia] Cat CEO: ${errorText(err)}`)),
      judge: (rules, digest, schema) => this.judge(rules, digest, schema),
      emit: opts.emit,
      log: (kind, text) => opts.consoles.push(CAT_CEO_ID, { kind, text }),
      working: (on) => opts.residents().setWorking(CAT_CEO_ID, on),
      promptsChanged: opts.promptsChanged,
      now: () => this.now,
    });
    this.tidy.start();
  }

  dispose(): void {
    this.tidy.dispose();
  }

  private get now(): number {
    return this.opts.now?.() ?? Date.now();
  }

  get settings(): CeoSettings {
    return readCeoSettings(this.opts.cats.catCeo);
  }

  /**
   * The CEO as a resident character. Always present: it runs the CEO desk;
   * `enabled` only turns the reviews, tidies and walks on or off.
   */
  resident(): CatProfile[] {
    return [ceoProfile(this.settings)];
  }

  message(): ServerMessage {
    return {
      type: 'catCeoSettings',
      ...this.settings,
      systemPrompt: this.opts.cats.prompts.read(CAT_CEO_ID).file.role,
    };
  }

  /** A Cats-menu change of the judge. Returns an error, or undefined when saved. */
  update(patch: Record<string, unknown>): string | undefined {
    const checked = checkCeoPatch(patch, this.settings, this.opts.catalog());
    if (!checked.ok) return checked.error;
    if (typeof patch.systemPrompt === 'string') {
      const prompts = this.opts.cats.prompts;
      const file = prompts.read(CAT_CEO_ID).file;
      if (patch.systemPrompt.trim() !== file.role) {
        const error = prompts.write(
          CAT_CEO_ID,
          { ...file, role: patch.systemPrompt },
          `user(${CAT_CEO_ID}): edit Role & conduct`,
          'Prompt-Edit-By: user',
        );
        if (error) return error;
      }
    }
    this.opts.cats.setCatCeo(checked.value);
    this.events.emit('change');
    return undefined;
  }

  /** A prompt edit the user asked for in the CEO desk chat (edit_prompts, §15). */
  editPrompt(edit: PromptEdit, chatId: string, request: string): ReturnType<typeof editPrompt> {
    return editPrompt(
      {
        prompts: this.opts.cats.prompts,
        roster: this.opts.cats.list(),
        now: this.now,
        promptsChanged: this.opts.promptsChanged,
      },
      edit,
      chatId,
      request,
    );
  }

  /** Review commits still allowed for a cat now (D7, and the guard's 24 h block). */
  commitsLeft(catId: string): number {
    if (this.store.blocked(catId, this.now)) return 0;
    const since = this.now - DAY_MS;
    const made = this.opts.cats.prompts
      .log(catId)
      .filter(
        (c) =>
          authorOf(c.subject) === 'cat-ceo' &&
          !isTidyCommit(c.subject) &&
          !isChatCommit(c.subject) &&
          c.at > since,
      ).length;
    return Math.max(0, this.settings.maxEditsPerCatPerDay - made);
  }

  /** RequestReview (task-state-machine.md §3.4): queue one review of a finished task. */
  request(task: StoredTask, state: TaskState, sink: ReviewSink): void {
    const reviewId = `rv-${crypto.randomBytes(4).toString('hex')}`;
    const queued = this.enqueue(
      () => this.review(task, state, sink, reviewId),
      (err) => this.fail(task, sink, reviewId, errorText(err)),
    );
    if (!queued) {
      this.fail(task, sink, reviewId, 'The Cat CEO queue is full; this task is not reviewed.');
      return;
    }
    this.setReview(task, sink, { state: 'pending', reviewId });
  }

  /** One Cat CEO job (review or tidy) in its scheduler slot: FIFO, at most 10 waiting (D9). */
  private enqueue(job: () => Promise<void>, onError: (err: unknown) => void): boolean {
    if (this.waiting >= CAT_CEO_QUEUE_MAX) return false;
    this.waiting++;
    const run = this.opts.scheduler
      .run(CAT_CEO_ID, () => {
        this.waiting--;
        return job();
      })
      .catch(onError);
    this.running.add(run);
    void run.finally(() => this.running.delete(run));
    return true;
  }

  /** One fresh judge process with the Cat CEO's Role + `rules` (a review's or a tidy's). */
  private judge(rules: string, digest: string, schema?: object) {
    const s = this.settings;
    const cwd = path.join(this.opts.stateDir, CAT_CEO_DIR, 'work');
    fs.mkdirSync(cwd, { recursive: true });
    const role = this.opts.cats.prompts.read(CAT_CEO_ID).file.role;
    return (this.opts.judge ?? runJudge)({
      bin: this.opts.claudeBin ?? 'claude',
      model: s.model,
      effort: s.effort,
      systemPrompt: `${role}\n\n${rules}`,
      digest,
      cwd,
      budgetUsd: CAT_CEO_BUDGET_USD,
      timeoutMs: CAT_CEO_TIMEOUT_MS,
      ...(schema ? { schema } : {}),
    });
  }

  private setReview(task: StoredTask, sink: ReviewSink, review: TaskReview): void {
    task.review = review;
    sink.save(task);
  }

  private fail(task: StoredTask, sink: ReviewSink, reviewId: string, error: string): void {
    console.error(`[catavasia] Cat CEO: review of ${task.id} failed: ${error}`);
    this.setReview(task, sink, { state: 'failed', reviewId, error });
    this.logEvent(task.id, { type: 'ReviewFailed', error });
    this.opts.emit({ type: 'reviewFailed', taskId: task.id, reviewId, error });
    this.opts.consoles.push(CAT_CEO_ID, { kind: 'error', text: `Task ${task.id}: ${error}` });
  }

  /**
   * The review region of the task's event log: the event, then a new
   * snapshot, so a replay still gives the snapshot state (§9 determinism).
   */
  private logEvent(taskId: string, event: TaskEvent): void {
    try {
      const log = EventLog.of(this.opts.stateDir, taskId);
      const saved = log.exists() ? log.load() : undefined;
      if (!saved) return;
      const seq = saved.seq + 1;
      log.append({ seq, at: this.now, event });
      log.writeSnapshot(seq, reduce(saved.state, event).state);
    } catch (err) {
      console.error(`[catavasia] Cat CEO: event log of ${taskId}: ${errorText(err)}`);
    }
  }

  private async review(
    task: StoredTask,
    state: TaskState,
    sink: ReviewSink,
    reviewId: string,
  ): Promise<void> {
    this.setReview(task, sink, { state: 'reviewing', reviewId });
    this.logEvent(task.id, { type: 'ReviewStarted', reviewId });
    this.opts.emit({ type: 'reviewStarted', taskId: task.id, reviewId });
    const residents = this.opts.residents();
    residents.setWorking(CAT_CEO_ID, true);
    this.opts.consoles.push(CAT_CEO_ID, {
      kind: 'user',
      text: `Review task ${task.id}: ${task.title}`,
    });
    try {
      const team = Object.keys(state.members);
      const digest = buildDigest({
        task,
        state,
        events: EventLog.of(this.opts.stateDir, task.id).events(),
        branchDiffs: await branchDiffs(state),
        prompts: Object.fromEntries(team.map((c) => [c, this.opts.cats.prompts.read(c).file])),
        history: Object.fromEntries(team.map((c) => [c, this.history(c)])),
      });
      const result = await this.judge(JUDGE_RULES, digest);
      if (!result.ok) throw new Error(result.error);
      const parsed = parseJudgeOutput(result.output);
      if (!parsed.ok) throw new Error(`bad judge output: ${parsed.error}`);
      this.finish(task, state, sink, reviewId, parsed.value, team, result.costUsd);
    } catch (err) {
      this.fail(task, sink, reviewId, errorText(err));
    } finally {
      residents.setWorking(CAT_CEO_ID, false);
    }
  }

  /** Apply the edits, record the review, run the guard, tell the office. */
  private finish(
    task: StoredTask,
    state: TaskState,
    sink: ReviewSink,
    reviewId: string,
    out: JudgeOutput,
    team: string[],
    costUsd: number | undefined,
  ): void {
    const prompts = this.opts.cats.prompts;
    const scores = out.scores
      .filter((x) => team.includes(x.catId))
      .map(({ evidence: _e, ...x }) => ({
        ...x,
        promptSha: shaOf(state, x.catId, x.assignmentId),
      }));
    // A hand edit becomes its own commit first, so a Cat CEO commit (and its
    // guard revert) holds only the judge's change; a broken file is not edited.
    for (const catId of team) prompts.commitHandEdit(catId);
    const { patches, rejected } = planEdits(out.edits, {
      taskId: task.id,
      date: new Date(this.now).toISOString().slice(0, 10),
      team: team.filter((catId) => !prompts.read(catId).error),
      anomalies: out.anomalies,
      read: (catId) => prompts.read(catId).file,
      commitsLeft: (catId) => this.commitsLeft(catId),
    });
    const edits: ReviewRecord['edits'] = [];
    for (const p of patches) {
      const catScore = scores.find((x) => x.catId === p.catId)?.score;
      const message = commitMessage(p, task, reviewId, out, catScore);
      const error = prompts.write(p.catId, p.file, message.subject, message.body);
      if (error) {
        rejected.push({
          catId: p.catId,
          reason: error,
          edit: out.edits.find((e) => e.catId === p.catId)!,
        });
        continue;
      }
      edits.push({
        catId: p.catId,
        sha: prompts.headSha(p.catId) ?? '',
        subject: message.subject,
        items: p.changes.filter((c) => c.op !== 'remove').map((c) => c.itemId),
      });
    }
    const record: ReviewRecord = {
      reviewId,
      taskId: task.id,
      title: task.title,
      at: this.now,
      verdict: out.verdict,
      summary: out.summary,
      ...(costUsd !== undefined ? { costUsd } : {}),
      scores,
      anomalies: out.anomalies,
      edits,
      rejected: rejected.map(({ catId, reason }) => ({ catId, reason })),
    };
    this.store.add(record);
    const changed = new Set(edits.map((e) => e.catId));
    for (const catId of new Set(scores.map((x) => x.catId))) {
      const actions = runGuard(catId, prompts, this.store, this.now);
      if (actions.some((a) => a.decision === 'revert' && !a.error)) changed.add(catId);
    }
    if (changed.size) this.opts.promptsChanged([...changed]);
    const values = scores.map((x) => x.score);
    this.setReview(task, sink, {
      state: 'reviewed',
      reviewId,
      verdict: out.verdict,
      summary: out.summary,
      ...(values.length ? { minScore: Math.min(...values), maxScore: Math.max(...values) } : {}),
      ...(costUsd !== undefined ? { costUsd } : {}),
    });
    this.logEvent(task.id, { type: 'ReviewFinished', reviewId });
    const finished: ReviewFinished = {
      type: 'reviewFinished',
      taskId: task.id,
      reviewId,
      verdict: out.verdict,
      summary: out.summary,
      ...(costUsd !== undefined ? { costUsd } : {}),
      scores: scores.map((x) => ({
        catId: x.catId,
        assignmentId: x.assignmentId,
        score: x.score,
        bubble: x.bubble,
        anomalies: out.anomalies
          .filter((a) => a.catId === x.catId)
          .map((a) => `${a.kind} (${a.severity}): ${a.evidence}`),
      })),
      edits: edits.map(({ catId, sha, subject, items }) => ({ catId, sha, subject, items })),
      rejectedEdits: record.rejected,
    };
    this.opts.emit(finished);
    this.opts.consoles.push(CAT_CEO_ID, {
      kind: 'text',
      // No cost in the text: the UI shows money only to API-key users (structured costUsd).
      text: `${out.verdict}: ${out.summary}`,
    });
    this.tidy.afterReview([...new Set(scores.map((x) => x.catId))]);
  }

  /** The bounded memory of §5.4: last 5 scores and last 3 prompt commits of a cat. */
  history(catId: string): CatHistory {
    return {
      scores: this.store
        .scoresOf(catId)
        .slice(-5)
        .map((x) => ({ taskId: x.taskId, score: x.score, verdict: x.verdict })),
      commits: this.opts.cats.prompts
        .log(catId)
        .slice(0, 3)
        .map((c) => {
          const flag = this.store.flag(c.sha);
          return {
            sha: c.sha,
            author: authorOf(c.subject),
            subject: c.subject,
            ...(flag ? { flag } : {}),
          };
        }),
    };
  }
}

/** The prompt version a cat used: its assignment's, or its join commit for the root. */
function shaOf(state: TaskState, catId: string, assignmentId: string): string | undefined {
  const a = state.assignments.find((x) => x.id === assignmentId && x.child === catId);
  return a?.promptSha ?? state.members[catId]?.promptSha;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
