/**
 * The 5-hour and weekly limits of the user's Claude subscription. Every
 * Claude turn in the office (the CEO and every cat share one subscription)
 * streams a `rate_limit_event`; this keeps the newest value of each window.
 *
 * Shape (CLI 2.1.292 through the Agent SDK; `unifiedWindows` and
 * `rateLimitType` are not documented, so a window it cannot read stays unknown):
 * `{"type":"rate_limit_event","rate_limit_info":{"status":"allowed",
 *   "resetsAt":1791398400,"rateLimitType":"five_hour","utilization":0.01,
 *   "unifiedWindows":{"five_hour":{"utilization":0.01,"resetsAt":1791398400},
 *   "seven_day":{"utilization":0.61,"resetsAt":1791655200}}}}`
 */

import { EventEmitter } from 'events';

import type { LimitWindow, UsageLimits } from '../../core/src/catSession.js';

type WindowKey = keyof UsageLimits;

/** Stream names of the windows we show. */
const WINDOWS: Record<string, WindowKey> = { five_hour: 'fiveHour', seven_day: 'weekly' };

function readWindow(raw: unknown): LimitWindow | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const { utilization, resetsAt } = raw as Record<string, unknown>;
  if (typeof utilization !== 'number' || typeof resetsAt !== 'number') return undefined;
  return { used: utilization, resetsAt };
}

/** The windows one stream line reports (none: not a rate limit event). */
export function parseRateLimitLine(line: string): UsageLimits | undefined {
  if (!line.includes('"rate_limit_event"')) return undefined;
  let info: Record<string, unknown> | undefined;
  try {
    const event = JSON.parse(line) as { type?: string; rate_limit_info?: Record<string, unknown> };
    if (event.type !== 'rate_limit_event') return undefined;
    info = event.rate_limit_info;
  } catch {
    return undefined;
  }
  if (!info) return undefined;
  const limits: UsageLimits = {};
  const unified = (info.unifiedWindows ?? {}) as Record<string, unknown>;
  for (const [name, key] of Object.entries(WINDOWS)) {
    const window = readWindow(unified[name]);
    if (window) limits[key] = window;
  }
  // Older shape: only the window that is closest to its limit.
  const top = typeof info.rateLimitType === 'string' ? WINDOWS[info.rateLimitType] : undefined;
  if (top && !limits[top]) {
    const window = readWindow(info);
    if (window) limits[top] = window;
  }
  return limits;
}

export class UsageLimitsTracker {
  readonly events = new EventEmitter<{ change: [] }>();
  private limits: UsageLimits = {};

  constructor(private readonly now = () => Date.now()) {
    this.events.setMaxListeners(0);
  }

  /** Read one stream line of any Claude turn. */
  observe(line: string): void {
    const seen = parseRateLimitLine(line);
    if (!seen || !Object.keys(seen).length) return;
    const next = { ...this.limits, ...seen };
    if (JSON.stringify(next) === JSON.stringify(this.limits)) return;
    this.limits = next;
    this.events.emit('change');
  }

  /** The known windows; a window past its reset time is unknown again. */
  get(): UsageLimits {
    const nowSec = this.now() / 1000;
    const live: UsageLimits = {};
    for (const key of Object.values(WINDOWS)) {
      const window = this.limits[key];
      if (window && window.resetsAt > nowSec) live[key] = window;
    }
    return live;
  }
}

/** One tracker for the whole office: every Claude turn feeds it. */
export const officeLimits = new UsageLimitsTracker();
