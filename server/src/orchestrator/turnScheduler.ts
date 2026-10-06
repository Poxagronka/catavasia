/**
 * Turn scheduler: at most `cap` cat turns run at once (RAM: one CLI process
 * per running turn), the rest wait in FIFO order. It is also the per-cat lock:
 * one cat never runs two turns at once, so two processes never share a
 * session id (they would interleave one transcript).
 */

export interface QueueState {
  /** Cat ids running a turn now. */
  running: string[];
  /** Cat ids waiting for a slot, oldest first. */
  queued: string[];
  cap: number;
}

interface Job {
  catId: string;
  start: () => Promise<void>;
}

export class TurnScheduler {
  private readonly queue: Job[] = [];
  private readonly running = new Set<string>();

  constructor(
    private cap: number,
    private readonly onChange: (state: QueueState) => void = () => {},
  ) {}

  setCap(cap: number): void {
    this.cap = cap;
    this.pump();
    this.onChange(this.state());
  }

  state(): QueueState {
    return { running: [...this.running], queued: this.queue.map((j) => j.catId), cap: this.cap };
  }

  /** Run `job` as a turn of `catId` once a slot is free and the cat is idle. */
  run<T>(catId: string, job: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        catId,
        start: () => Promise.resolve().then(job).then(resolve, reject),
      });
      this.pump();
      this.onChange(this.state());
    });
  }

  private pump(): void {
    for (let i = 0; i < this.queue.length && this.running.size < this.cap;) {
      const job = this.queue[i];
      if (this.running.has(job.catId)) {
        i++; // This cat is busy: later jobs of other cats may pass it.
        continue;
      }
      this.queue.splice(i, 1);
      this.running.add(job.catId);
      void job.start().finally(() => {
        this.running.delete(job.catId);
        this.pump();
        this.onChange(this.state());
      });
    }
  }
}
