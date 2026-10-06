/**
 * `~/.pixel-agents/cat-ceo/reviews.json`: the Cat CEO's review records (all
 * scores with the prompt version each cat used), the regression-guard flags
 * of its commits, the cats it may not edit for a while, and its tidy runs.
 * Atomic writes.
 */

import * as fs from 'fs';
import * as path from 'path';

import type { PromptFlag, TidyRow, TidyTrigger } from '../../../core/src/messages.js';
import { CAT_CEO_RECORDS_MAX } from '../constants.js';
import type { JudgeAnomaly, JudgeScore, Verdict } from './judgeSchema.js';

export interface ScoreRecord extends Omit<JudgeScore, 'evidence'> {
  /** Prompt repo commit of the cat's file when it joined the task. */
  promptSha?: string;
}

export interface ReviewRecord {
  reviewId: string;
  taskId: string;
  title: string;
  at: number;
  verdict: Verdict;
  summary: string;
  costUsd?: number;
  scores: ScoreRecord[];
  anomalies: JudgeAnomaly[];
  edits: Array<{ catId: string; sha: string; subject: string; items: string[] }>;
  rejected: Array<{ catId: string; reason: string }>;
}

/** One tidy run of a cat's Rules and Lessons (cat-ceo-judge.md §14). */
export interface TidyRecord {
  tidyId: string;
  catId: string;
  at: number;
  trigger: TidyTrigger;
  /** The prompt version after the tidy (its commit, or the unchanged head): "nothing changed" is this sha. */
  head?: string;
  /** The tidy commit, when it changed the file. */
  sha?: string;
  /** The run failed (the summary is the error): no head, no rows. */
  failed?: boolean;
  summary: string;
  costUsd?: number;
  rows: TidyRow[];
  rejected: Array<{ op: string; itemIds: string[]; reason: string }>;
}

interface StoreFile {
  version: 1;
  reviews: ReviewRecord[];
  /** Guard state of Cat CEO commits by sha. */
  flags: Record<string, PromptFlag>;
  /** Cat id -> epoch ms until which the Cat CEO does not edit it. */
  blockedUntil: Record<string, number>;
  tidies: TidyRecord[];
  /** Epoch ms of the last weekly tidy sweep (set on the first start). */
  lastSweep?: number;
}

export class ReviewStore {
  private data: StoreFile;

  constructor(private readonly file: string) {
    this.data = this.read();
  }

  get reviews(): readonly ReviewRecord[] {
    return this.data.reviews;
  }

  add(record: ReviewRecord): void {
    this.data.reviews = [...this.data.reviews, record].slice(-CAT_CEO_RECORDS_MAX);
    this.write();
  }

  /** Scores of one cat, oldest first, with the review time and verdict. */
  scoresOf(catId: string): Array<ScoreRecord & { at: number; taskId: string; verdict: Verdict }> {
    return this.data.reviews.flatMap((r) =>
      r.scores
        .filter((s) => s.catId === catId)
        .map((s) => ({ ...s, at: r.at, taskId: r.taskId, verdict: r.verdict })),
    );
  }

  get tidies(): readonly TidyRecord[] {
    return this.data.tidies;
  }

  addTidy(record: TidyRecord): void {
    this.data.tidies = [...this.data.tidies, record].slice(-CAT_CEO_RECORDS_MAX);
    this.write();
  }

  /** The newest tidy of a cat. */
  lastTidy(catId: string): TidyRecord | undefined {
    return [...this.data.tidies].reverse().find((t) => t.catId === catId);
  }

  get lastSweep(): number | undefined {
    return this.data.lastSweep;
  }

  set lastSweep(at: number) {
    this.data.lastSweep = at;
    this.write();
  }

  flag(sha: string): PromptFlag | undefined {
    return this.data.flags[sha];
  }

  setFlag(sha: string, flag: PromptFlag): void {
    this.data.flags[sha] = flag;
    this.write();
  }

  blocked(catId: string, now: number): boolean {
    return (this.data.blockedUntil[catId] ?? 0) > now;
  }

  block(catId: string, until: number): void {
    this.data.blockedUntil[catId] = until;
    this.write();
  }

  private read(): StoreFile {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as Partial<StoreFile>;
      if (parsed.version === 1 && Array.isArray(parsed.reviews)) {
        return {
          version: 1,
          reviews: parsed.reviews,
          flags: parsed.flags ?? {},
          blockedUntil: parsed.blockedUntil ?? {},
          tidies: parsed.tidies ?? [],
          ...(parsed.lastSweep ? { lastSweep: parsed.lastSweep } : {}),
        };
      }
    } catch {
      /* missing or unreadable: start empty */
    }
    return { version: 1, reviews: [], flags: {}, blockedUntil: {}, tidies: [] };
  }

  private write(): void {
    const tmp = `${this.file}.${process.pid}.tmp`;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error(`[catavasia] Cat CEO: failed to write ${this.file}: ${String(err)}`);
    }
  }
}
