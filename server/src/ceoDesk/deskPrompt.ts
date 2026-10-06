/**
 * The text the CEO desk gives its Claude session: the persona (Role & conduct
 * from prompts/cat-ceo.md + the fixed desk rules) and the parts of a turn
 * message (work folder line, user messages, job notices).
 */

import type { TaskDetail } from '../../../core/src/tasks.js';
import { CEO_DESK_MAX_LIVE_JOBS, CEO_DESK_NOTICE_MAX_CHARS } from '../constants.js';
import { TURN_PART_SEPARATOR } from '../orchestrator/flowPrompts.js';

export const DESK_RULES = `# CEO desk rules (fixed by the office)

- You talk to the user in this chat. Every message starts with a [Work folder: ...] line: the project folder of this chat, or "none (sandbox)".
- Answer questions, lookups and links yourself. Keep answers short unless the user asks for detail.
- Every change to a project goes through start_job: the team does the work on a branch. Do not edit project files yourself.
- Code work needs a project folder. When the chat has none, ask the user for it (a path in the chat), then call set_folder. Never use the home folder.
- start_job returns at once. You get a "[Job <id> ...]" notice with the result when the job ends: you do not need to wait or poll.
- On a job notice, check the work (for example \`git diff <base>..task/<id>\` in the folder, or read the files). If it is good, answer the user. If not, call start_job with \`from\` set to the job id and say exactly what to fix.
- At most ${CEO_DESK_MAX_LIVE_JOBS} jobs run at once in a chat.
- When the user asks to change a cat's Rules or Lessons, call list_team with its catId for the item ids, then edit_prompts once per item. Never on your own initiative: suggest it instead. Say what was applied or refused.
- Your final answer is complete: what changed, the branch, and how to merge it (the office never merges for the user).
- Reply in the language of the user.`;

/** The persona file: the CEO's Role & conduct, then the desk rules. */
export function deskPersona(name: string, role: string): string {
  return [`You are ${name}, the CEO of a pixel office of AI cats.`, role.trim(), DESK_RULES]
    .filter(Boolean)
    .join('\n\n');
}

/** One CEO turn: the work folder line, then every queued message and notice. */
export function turnMessage(folder: string | null, parts: string[]): string {
  return `[Work folder: ${folder ?? 'none (sandbox)'}]\n\n${parts.join(TURN_PART_SEPARATOR)}`;
}

export function userPart(text: string): string {
  return `[Message from the user]\n${text}`;
}

/** `+12 −3` from a unified diff (lines added and removed). */
function diffStat(diff: string): string {
  let added = 0;
  let removed = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) added++;
    else if (line.startsWith('-') && !line.startsWith('---')) removed++;
  }
  return `+${added} -${removed}`;
}

/** What the CEO reads when a job ends: the full lead report and the facts to check it. */
export function jobNotice(task: TaskDetail, folder: string | null): string {
  const state = task.flow?.state ?? task.status;
  const result = task.result ?? '';
  const files = task.changedFiles ?? [];
  const lines = [
    `[Job ${task.id} ${state}]`,
    `Task: ${task.title}`,
    `Folder: ${folder ?? 'none (sandbox, not a git repo)'}`,
    ...(task.branch ? [`Branch: ${task.branch}`] : []),
    ...(files.length
      ? [
          `Changed files (${files.length}, ${diffStat(task.diff ?? '')}${task.diffTruncated ? ', diff cut' : ''}):`,
          ...files.map((f) => `- ${f.status} ${f.path}`),
        ]
      : ['Changed files: none']),
    ...(task.costUsd !== undefined ? [`Cost: $${task.costUsd.toFixed(2)}`] : []),
    ...(task.error ? [`Error: ${task.error}`] : []),
    'Lead report:',
    result.length > CEO_DESK_NOTICE_MAX_CHARS
      ? `${result.slice(0, CEO_DESK_NOTICE_MAX_CHARS)}\n[report cut at ${CEO_DESK_NOTICE_MAX_CHARS} characters]`
      : result || '(none)',
  ];
  return lines.join('\n');
}
