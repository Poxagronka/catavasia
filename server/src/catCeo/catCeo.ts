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
import * as fs from 'fs';
import * as path from 'path';

import type { CatProfile, ReviewFinished, ServerMessage } from '../../../core/src/messages.js';
import type { TaskReview } from '../../../core/src/tasks.js';
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
  /** Reviews in flight (tests wait for them). */
  readonly running = new Set<Promise<void>>();

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
  }

  private get now(): number {
    return this.opts.now?.() ?? Date.now();
  }

  get settings(): CeoSettings {
    return readCeoSettings(this.opts.cats.catCeo);
  }

  /** The judge as a resident character (none while it is off). */
  resident(): CatProfile[] {
    const s = this.settings;
    return s.enabled ? [ceoProfile(s)] : [];
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
    return undefined;
  }

  /** Cat CEO commits still allowed for a cat now (D7, and the guard's 24 h block). */
  commitsLeft(catId: string): number {
    if (this.store.blocked(catId, this.now)) return 0;
    const since = this.now - DAY_MS;
    const made = this.opts.cats.prompts
      .log(catId)
      .filter((c) => authorOf(c.subject) === 'cat-ceo' && c.at > since).length;
    return Math.max(0, this.settings.maxEditsPerCatPerDay - made);
  }

  /** RequestReview (task-state-machine.md §3.4): queue one review of a finished task. */
  request(task: StoredTask, state: TaskState, sink: ReviewSink): void {
    const reviewId = `rv-${crypto.randomBytes(4).toString('hex')}`;
    if (this.waiting >= CAT_CEO_QUEUE_MAX) {
      this.fail(task, sink, reviewId, 'The Cat CEO queue is full; this task is not reviewed.');
      return;
    }
    this.waiting++;
    this.setReview(task, sink, { state: 'pending', reviewId });
    const job = this.opts.scheduler
      .run(CAT_CEO_ID, () => {
        this.waiting--;
        return this.review(task, state, sink, reviewId);
      })
      .catch((err: unknown) => this.fail(task, sink, reviewId, errorText(err)));
    this.running.add(job);
    void job.finally(() => this.running.delete(job));
  }

  private setReview(task: StoredTask, sink: ReviewSink, review: TaskReview): void {
    task.review = review;
    sink.save(task);
  }

  private fail(task: StoredTask, sink: ReviewSink, reviewId: string, error: string): void {
    console.error(`[Pixel Agents] Cat CEO: review of ${task.id} failed: ${error}`);
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
      console.error(`[Pixel Agents] Cat CEO: event log of ${taskId}: ${errorText(err)}`);
    }
  }

  private async review(
    task: StoredTask,
    state: TaskState,
    sink: ReviewSink,
    reviewId: string,
  ): Promise<void> {
    const s = this.settings;
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
      const cwd = path.join(this.opts.stateDir, CAT_CEO_DIR, 'work');
      fs.mkdirSync(cwd, { recursive: true });
      const role = this.opts.cats.prompts.read(CAT_CEO_ID).file.role;
      const result = await (this.opts.judge ?? runJudge)({
        bin: this.opts.claudeBin ?? 'claude',
        model: s.model,
        effort: s.effort,
        systemPrompt: `${role}\n\n${JUDGE_RULES}`,
        digest,
        cwd,
        budgetUsd: CAT_CEO_BUDGET_USD,
        timeoutMs: CAT_CEO_TIMEOUT_MS,
      });
      if (!result.ok) throw new Error(`${result.error}${costNote(result.costUsd)}`);
      const parsed = parseJudgeOutput(result.output);
      if (!parsed.ok)
        throw new Error(`bad judge output: ${parsed.error}${costNote(result.costUsd)}`);
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
    const { patches, rejected } = planEdits(out.edits, {
      taskId: task.id,
      date: new Date(this.now).toISOString().slice(0, 10),
      team,
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
      text: `${out.verdict}: ${out.summary}${costNote(costUsd)}`,
    });
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

function costNote(costUsd: number | undefined): string {
  return costUsd === undefined ? '' : ` ($${costUsd.toFixed(3)})`;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
