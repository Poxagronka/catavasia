/**
 * Every text the office writes to a cat: the persona file appended to its
 * system prompt, and the user messages of its turns (tasks, questions,
 * replies, reports, merge notes, nudges). Server-made, never model-made.
 */

import type { CatProfile } from '../../../core/src/messages.js';
import type { MergeOutcome } from '../taskBoard/gitWorktree.js';
import { childrenOf, relationOf } from './catTree.js';

export function catLabel(cat: CatProfile): string {
  return `${cat.name} (${cat.id})`;
}

function describe(cat: CatProfile): string {
  return `- ${catLabel(cat)}: ${cat.role || 'cat'}, model ${cat.model}`;
}

/**
 * The persona file appended to the cat's system prompt (context-policy.md §6):
 * intro line, the cat's prompt file (Role & conduct, Rules, Lessons), office rules.
 */
export function personaText(cat: CatProfile, promptFile: string): string {
  return [
    `You are ${cat.name}, a cat in the catavasia office. Your cat id is "${cat.id}". Your role: ${cat.role || 'cat'}.`,
    promptFile.trim(),
    '## Office rules',
    '- You work on a task of the user together with other cats. Talk to them only with the office MCP tools: brief, delegate, ask, reply, report, list_team.',
    '- Every office tool returns at once. Answers and reports from other cats arrive later as new messages. Do not wait or poll for them: end your turn.',
    '- Work only inside your current folder. It is your own git worktree: do not push, and do not touch other folders. The office commits your work.',
    '- When your task is done, call report once with a short summary of the result.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function rootTaskMessage(
  taskId: string,
  prompt: string,
  root: CatProfile,
  cats: readonly CatProfile[],
): string {
  const reports = childrenOf(cats, root.id);
  const steps = reports.length
    ? [
        'You lead this task. Your direct reports:',
        ...reports.map(describe),
        'Steps:',
        '1. Call brief with your plan.',
        '2. Call delegate once per part, each to a direct report. Give parts that do not edit the same files.',
        "3. End your turn. Reports arrive as new messages. The office merges each worker's branch into your worktree before you read its report.",
        '4. Check the merged result in your folder and fix what is missing.',
        '5. Call report with the final answer for the user.',
      ]
    : [
        'You have no direct reports: do the task yourself in your folder, then call report with the result.',
      ];
  return [`[Task from the user, task ${taskId}]`, prompt, ...steps].join('\n');
}

export function delegateMessage(
  from: CatProfile,
  to: CatProfile,
  task: string,
  cats: readonly CatProfile[],
  branch: string | undefined,
  plan: string | undefined,
  rework = false,
): string {
  const reports = childrenOf(cats, to.id);
  return [
    `[Task from ${catLabel(from)}]`,
    rework ? 'Rework: your lead did not accept your last report. Fix the work as asked below.' : '',
    task,
    plan ? `[Team plan]\n${plan}` : '',
    branch
      ? `Your folder is your own git worktree on branch ${branch}. Work there; the office commits your changes.`
      : '',
    reports.length
      ? `You may delegate parts to your direct reports:\n${reports.map(describe).join('\n')}`
      : '',
    'When you are done, call report with what you changed.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function askMessage(from: CatProfile, question: string): string {
  return `[Question from ${catLabel(from)}]\n${question}\nAnswer with reply (to: "${from.id}").`;
}

export function replyMessage(from: CatProfile, answer: string): string {
  return `[Reply from ${catLabel(from)}]\n${answer}`;
}

export function reportMessage(from: CatProfile, result: string, failed: boolean): string {
  return `[${failed ? 'Failure report' : 'Report'} from ${catLabel(from)}]\n${result}`;
}

export function mergeNote(cat: CatProfile, branch: string, outcome: MergeOutcome): string {
  if (outcome.ok) return `[Office] Merged branch ${branch} of ${catLabel(cat)} into your worktree.`;
  if (outcome.conflicts.length) {
    return (
      `[Office] Merging branch ${branch} of ${catLabel(cat)} conflicts in: ${outcome.conflicts.join(', ')}. ` +
      'The merge is in progress in your folder: fix the conflict markers, then run `git add -A && git commit --no-edit`.'
    );
  }
  return `[Office] Could not merge branch ${branch} of ${catLabel(cat)}: ${outcome.error}`;
}

export function unfinishedMergeNote(paths: string[]): string {
  return (
    `[Office] Your worktree still has an unfinished merge (${paths.join(', ')}). ` +
    'Fix it and run `git add -A && git commit --no-edit`; the next reports merge after that.'
  );
}

export const RESUME_NOTE =
  '[Office] The office restarted while you worked on the message below. ' +
  'Check your folder for the work you already did, then go on.';

export function workerBranch(taskId: string, catId: string): string {
  // `task/<id>/<cat>` cannot coexist with the `task/<id>` branch in git refs.
  return `task/${taskId}-${catId}`;
}

export const NUDGE_REPORT =
  '[Office] Your turn ended without a report. If your task is done, call report with the result now. ' +
  'If you still wait for other cats, just end your turn.';

/** What list_team shows a cat: every cat it may message, and how. */
export function teamText(cats: readonly CatProfile[], me: CatProfile): string {
  const lines = [`You: ${describe(me).slice(2)}`];
  for (const cat of cats) {
    const rel = relationOf(cats, me.id, cat.id);
    if (rel === 'parent') lines.push(`Your lead ${describe(cat).slice(2)} (ask, reply, report)`);
    if (rel === 'child')
      lines.push(`Direct report ${describe(cat).slice(2)} (delegate, ask, reply)`);
    if (rel === 'sibling') lines.push(`Sibling ${describe(cat).slice(2)} (ask, reply)`);
  }
  return lines.join('\n');
}
