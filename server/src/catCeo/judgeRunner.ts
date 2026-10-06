/**
 * One Cat CEO review = one fresh `claude -p` process (cat-ceo-judge.md §4):
 * no tools, no MCP, no session on disk, safe mode (no CLAUDE.md, hooks or
 * plugins of the user), a hard cost cap, and the output shape forced by
 * `--json-schema`. The digest goes on stdin; the answer is the
 * `structured_output` field of the JSON result.
 */

import { spawn } from 'child_process';

import { JUDGE_SCHEMA } from './judgeSchema.js';

export interface JudgeRequest {
  bin: string;
  model: string;
  effort: string;
  /** Role of prompts/cat-ceo.md + the fixed judge rules. */
  systemPrompt: string;
  digest: string;
  /** An empty folder: the judge reads no project files. */
  cwd: string;
  budgetUsd: number;
  timeoutMs: number;
}

export type JudgeResult =
  { ok: true; output: unknown; costUsd?: number } | { ok: false; error: string; costUsd?: number };

const STDERR_TAIL = 2000;

export function judgeArgs(
  req: Omit<JudgeRequest, 'bin' | 'digest' | 'cwd' | 'timeoutMs'>,
): string[] {
  return [
    '-p',
    '--output-format',
    'json',
    '--json-schema',
    JSON.stringify(JUDGE_SCHEMA),
    '--model',
    req.model,
    '--effort',
    req.effort,
    '--tools',
    '',
    '--strict-mcp-config',
    '--safe-mode',
    '--no-session-persistence',
    '--max-budget-usd',
    String(req.budgetUsd),
    '--append-system-prompt',
    req.systemPrompt,
  ];
}

/** Parse the CLI's `--output-format json` result. */
export function parseJudgeStdout(stdout: string): JudgeResult {
  let result: {
    is_error?: boolean;
    subtype?: string;
    result?: string;
    structured_output?: unknown;
    total_cost_usd?: number;
  };
  try {
    result = JSON.parse(stdout.trim().split('\n').pop() ?? '') as typeof result;
  } catch {
    return { ok: false, error: `no JSON result: ${stdout.slice(0, 200) || '(empty)'}` };
  }
  const costUsd = typeof result.total_cost_usd === 'number' ? result.total_cost_usd : undefined;
  const cost = costUsd === undefined ? {} : { costUsd };
  if (result.is_error) {
    return {
      ok: false,
      error: `${result.subtype ?? 'error'}: ${result.result ?? ''}`.trim(),
      ...cost,
    };
  }
  if (result.structured_output === undefined) {
    return { ok: false, error: 'the result has no structured_output', ...cost };
  }
  return { ok: true, output: result.structured_output, ...cost };
}

export function runJudge(req: JudgeRequest): Promise<JudgeResult> {
  return new Promise((resolve) => {
    const child = spawn(req.bin, judgeArgs(req), {
      cwd: req.cwd,
      env: { ...process.env, PWD: req.cwd },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), req.timeoutMs);
    timer.unref();
    child.stdout?.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr?.on('data', (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-STDERR_TAIL);
    });
    child.on('error', (err) => {
      stderr += `\n${err.message}`;
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const parsed = parseJudgeStdout(stdout);
      if (!parsed.ok && code !== 0 && !stdout.trim()) {
        resolve({
          ok: false,
          error: `exit code ${code ?? 'none'}: ${stderr.trim() || 'no output'}`,
        });
        return;
      }
      resolve(parsed);
    });
    child.stdin?.on('error', () => {});
    child.stdin?.end(req.digest);
  });
}
