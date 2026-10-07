import { describe, expect, it } from 'vitest';

import { parseRateLimitLine, UsageLimitsTracker } from '../src/usageLimits.js';
import { FIVE_HOUR_RESET, rateLimit, text, WEEKLY_RESET } from './fixtures/sdkLines.js';

describe('subscription limits', () => {
  it('reads both windows of a rate_limit_event (CLI 2.1.292 shape)', () => {
    expect(parseRateLimitLine(rateLimit(0.07, 0.56))).toEqual({
      fiveHour: { used: 0.07, resetsAt: FIVE_HOUR_RESET },
      weekly: { used: 0.56, resetsAt: WEEKLY_RESET },
    });
    expect(parseRateLimitLine(text('rate_limit_event'))).toBeUndefined();
  });

  it('falls back to the top-level window when unifiedWindows is missing', () => {
    const line = JSON.stringify({
      type: 'rate_limit_event',
      rate_limit_info: {
        status: 'allowed',
        rateLimitType: 'seven_day',
        utilization: 0.9,
        resetsAt: 100,
      },
    });
    expect(parseRateLimitLine(line)).toEqual({ weekly: { used: 0.9, resetsAt: 100 } });
    // No numbers: nothing known (never 0%).
    expect(
      parseRateLimitLine(
        JSON.stringify({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed' } }),
      ),
    ).toEqual({});
  });

  it('keeps the newest value per window, tells on change, forgets a window after its reset', () => {
    let now = (FIVE_HOUR_RESET - 400) * 1000;
    const tracker = new UsageLimitsTracker(() => now);
    let changes = 0;
    tracker.events.on('change', () => changes++);
    expect(tracker.get()).toEqual({});
    tracker.observe(rateLimit(0.01, 0.61));
    tracker.observe(rateLimit(0.01, 0.61));
    tracker.observe(rateLimit(0.02, 0.61));
    expect(changes).toBe(2);
    expect(tracker.get().fiveHour?.used).toBe(0.02);
    now = FIVE_HOUR_RESET * 1000 + 1;
    expect(tracker.get()).toEqual({ weekly: { used: 0.61, resetsAt: WEEKLY_RESET } });
  });
});
