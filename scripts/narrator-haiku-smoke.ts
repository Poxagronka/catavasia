/**
 * Manual smoke test: ONE real Haiku summary call through the narrator batcher.
 * Not part of `npm test` (it needs a logged-in `claude` CLI and spends tokens).
 *
 *   npx tsx scripts/narrator-haiku-smoke.ts
 *
 * Prints the validated summaries, the wall time of the call and its usage.
 */

import { HaikuBatcher, runClaudeHaiku } from '../server/src/narrator/haikuBatcher.js';

let usage: unknown;
let callMs = 0;

const batcher = new HaikuBatcher({
  intervalMs: 100,
  run: async (prompt) => {
    const t0 = Date.now();
    const stdout = await runClaudeHaiku(prompt);
    callMs = Date.now() - t0;
    const env = JSON.parse(stdout) as Record<string, unknown>;
    usage = { usage: env.usage, total_cost_usd: env.total_cost_usd, duration_ms: env.duration_ms };
    return stdout;
  },
  onSummaries: (summaries) => {
    console.log(JSON.stringify({ summaries, callMs, ...(usage as object) }, null, 2));
    batcher.dispose();
  },
  log: (m) => {
    console.error(m);
    batcher.dispose();
    process.exitCode = 1;
  },
});

batcher.enqueue(
  'chat:Leo|Mochi',
  [1, 2],
  [
    'Leo → Mochi: please find out why server/__tests__/taskBoard.test.ts fails',
    'Mochi → Leo: the worktree check fails, I will fix it and report back',
  ],
);
batcher.enqueue(
  'result:3',
  [3],
  ['Result: Fixed the flaky worktree cleanup; all 42 server tests pass. Changed gitWorktree.ts.'],
);
