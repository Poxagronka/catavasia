/**
 * The CEO's desk tools, served over MCP at CEO_MCP_PATH (officeMcp.ts). Cats
 * never see them, and the CEO never sees the office tools. Every tool returns
 * at once: a job's end reaches the CEO later as a job notice.
 */

import type { JobCard } from '../../../core/src/ceoDesk.js';
import type { CatProfile } from '../../../core/src/messages.js';
import type { TaskDetail, TaskSummary } from '../../../core/src/tasks.js';
import { CEO_DESK_MAX_LIVE_JOBS, CEO_DESK_MAX_REWORKS } from '../constants.js';
import { bossOf } from '../orchestrator/catTree.js';
import { type McpTool, type OfficeToolResult, str } from '../orchestrator/officeMcp.js';
import type { Orchestrator } from '../orchestrator/orchestrator.js';
import { TaskBusyError, TaskInputError, type TaskManager } from '../taskBoard/taskManager.js';
import { jobNotice } from './deskPrompt.js';
import { checkWorkFolder } from './workFolder.js';

const GOAL_MAX_CHARS = 120;

export const DESK_TOOLS: McpTool[] = [
  {
    name: 'start_job',
    description:
      'Give work to the team (default) or one cat. Returns at once; a "[Job <id> ...]" notice with the result arrives when the job ends.',
    inputSchema: {
      type: 'object',
      properties: {
        task: str('What to do, with every detail the team needs.'),
        to: str('"team" (the lead splits the work) or a cat id from list_team. Default: team.'),
        folder: str('Absolute project folder. Default: the chat folder, else the sandbox.'),
        from: str("Job id to correct: the new job starts from that job's branch."),
      },
      required: ['task'],
    },
  },
  {
    name: 'job_status',
    description: 'The state of one job, or of every job of this chat when jobId is absent.',
    inputSchema: { type: 'object', properties: { jobId: str('Job id.') } },
  },
  {
    name: 'message_job',
    description: 'Send a message to the lead of a running job. Its next turn reads it.',
    inputSchema: {
      type: 'object',
      properties: { jobId: str('Job id.'), text: str('The message.') },
      required: ['jobId', 'text'],
    },
  },
  {
    name: 'cancel_job',
    description: 'Cancel a running or interrupted job. Its branches stay.',
    inputSchema: { type: 'object', properties: { jobId: str('Job id.') }, required: ['jobId'] },
  },
  {
    name: 'set_folder',
    description: 'Set the project folder of this chat (an absolute path the user gave).',
    inputSchema: {
      type: 'object',
      properties: { path: str('Absolute path of the project folder.') },
      required: ['path'],
    },
  },
  {
    name: 'list_team',
    description: 'List the cats: the lead and who reports to whom.',
    inputSchema: { type: 'object', properties: {} },
  },
];

/** What the tools need from the desk. */
export interface DeskToolHost {
  office: Orchestrator;
  tasks: TaskManager;
  stateDir: string;
  chatId(): string;
  folder(): string | null;
  /** The chat's sandbox: where folderless jobs run. */
  sandbox(): string;
  /** The project folder of a job's cwd, or null for a sandbox. */
  folderOf(cwd: string): string | null;
  setFolder(folder: string): void;
  /** Jobs of this chat that have not ended yet. */
  liveJobs(): string[];
  /** Rework jobs started since the last user message. */
  reworks(): number;
  /** `chatId`: the chat that called start_job (a New chat may have come since). */
  jobStarted(task: TaskSummary, rework: boolean, chatId: string): void;
}

const ok = (text: string): OfficeToolResult => ({ text });
const fail = (text: string): OfficeToolResult => ({ text, isError: true });
const arg = (args: Record<string, unknown>, key: string): string | undefined => {
  const v = args[key];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
};

export async function callDeskTool(
  host: DeskToolHost,
  name: string,
  args: Record<string, unknown>,
): Promise<OfficeToolResult> {
  switch (name) {
    case 'start_job':
      return startJob(host, args);
    case 'job_status':
      return jobStatus(host, arg(args, 'jobId'));
    case 'message_job': {
      const task = chatTask(host, arg(args, 'jobId'));
      if (typeof task === 'string') return fail(task);
      const text = arg(args, 'text');
      if (!text) return fail('message_job needs text');
      const root = task.flow?.root ?? host.office.resolveTarget(task.target ?? '')?.id;
      if (task.status !== 'running' || !root || !host.office.sendUserMessage(root, text)) {
        return fail(`Job ${task.id} has no running lead to read the message.`);
      }
      return ok(`Sent to the lead of job ${task.id}.`);
    }
    case 'cancel_job': {
      const task = chatTask(host, arg(args, 'jobId'));
      if (typeof task === 'string') return fail(task);
      try {
        host.tasks.cancel(task.id);
        return ok(`Job ${task.id} is cancelling. Its branches stay.`);
      } catch (err) {
        if (err instanceof TaskBusyError || err instanceof TaskInputError) return fail(err.message);
        throw err;
      }
    }
    case 'set_folder': {
      const checked = checkWorkFolder(arg(args, 'path') ?? '', host.stateDir);
      if (!checked.ok) return fail(checked.error);
      host.setFolder(checked.path);
      return ok(`The work folder of this chat is now ${checked.path}.`);
    }
    case 'list_team':
      return ok(teamList(host.office.cats.list()));
    default:
      return fail(`Unknown tool: ${name}`);
  }
}

async function startJob(
  host: DeskToolHost,
  args: Record<string, unknown>,
): Promise<OfficeToolResult> {
  const prompt = arg(args, 'task');
  if (!prompt) return fail('start_job needs a task');
  const to = arg(args, 'to') ?? 'team';
  const lead = host.office.resolveTarget(to);
  if (!lead) return fail(`Unknown cat: ${to}. Call list_team for the ids.`);
  // Preflight: the lead's engine must be installed and logged in (no failed task is stored).
  const blocked = (await host.office.preflight(to)) ?? host.office.notReady(lead.engine);
  if (blocked) return fail(`${lead.name} cannot work now. ${blocked}`);
  const running = host.liveJobs().filter((id) => host.tasks.get(id)?.status === 'running');
  if (running.length >= CEO_DESK_MAX_LIVE_JOBS) {
    return fail(
      `${running.length} jobs already run in this chat (${running.join(', ')}). Wait for a notice.`,
    );
  }
  const fromId = arg(args, 'from');
  let baseRef: string | undefined;
  let folder = host.folder();
  if (fromId) {
    if (host.reworks() >= CEO_DESK_MAX_REWORKS) {
      return fail(
        `Already ${CEO_DESK_MAX_REWORKS} reworks for this request. Tell the user what is still wrong.`,
      );
    }
    const from = chatTask(host, fromId);
    if (typeof from === 'string') return fail(from);
    baseRef = from.branch;
    folder = host.folderOf(from.cwd);
  }
  const asked = arg(args, 'folder');
  if (asked) {
    const checked = checkWorkFolder(asked, host.stateDir);
    if (!checked.ok) return fail(checked.error);
    folder = checked.path;
  }
  try {
    const chatId = host.chatId();
    const task = await host.tasks.create(prompt, folder ?? host.sandbox(), to, {
      chatId,
      ...(baseRef ? { baseRef } : {}),
    });
    if (task.status === 'error') return fail(`Job ${task.id} could not start: ${task.error}`);
    host.jobStarted(task, !!fromId, chatId);
    return ok(
      [
        `Job ${task.id} started: ${to === 'team' ? `Team: ${lead.name} leads` : lead.name}.`,
        `Folder: ${folder ?? 'none (sandbox)'}.`,
        ...(task.branch ? [`Branch: ${task.branch}${baseRef ? ` (from ${baseRef})` : ''}.`] : []),
        'A notice with the result arrives when it ends.',
      ].join(' '),
    );
  } catch (err) {
    if (err instanceof TaskInputError) return fail(err.message);
    throw err;
  }
}

function chatTask(host: DeskToolHost, jobId: string | undefined): TaskDetail | string {
  if (!jobId) return 'Name the job id.';
  const task = host.tasks.chatJobs(host.chatId()).find((t) => t.id === jobId);
  return task ?? `No job ${jobId} in this chat.`;
}

function jobStatus(host: DeskToolHost, jobId: string | undefined): OfficeToolResult {
  if (jobId) {
    const task = chatTask(host, jobId);
    if (typeof task === 'string') return fail(task);
    if (task.status !== 'running') return ok(jobNotice(task, host.folderOf(task.cwd)));
    const card = jobCard(task, host.office, host.folderOf(task.cwd));
    return ok(
      [
        `Job ${card.jobId} ${card.state}: ${card.title}`,
        `${card.turns} turns${card.costUsd !== undefined ? `, $${card.costUsd.toFixed(2)}` : ''}`,
        ...card.nodes.map((n) => `- ${n.fromName} -> ${n.catName}: "${n.goal}" ${n.status}`),
      ].join('\n'),
    );
  }
  const jobs = host.tasks.chatJobs(host.chatId());
  if (!jobs.length) return ok('No jobs in this chat yet.');
  return ok(
    jobs
      .map(
        (t) =>
          `- ${t.id} ${t.flow?.state ?? t.status}: ${t.title}${t.branch ? ` (${t.branch})` : ''}`,
      )
      .join('\n'),
  );
}

function teamList(cats: CatProfile[]): string {
  const boss = bossOf(cats);
  if (!boss) return 'The office has no cats.';
  const name = (id: string | null) => cats.find((c) => c.id === id)?.name ?? id;
  const line = (c: CatProfile) =>
    `${c.name} (${c.id})${c.role ? `: ${c.role}` : ''}, ${c.engine} ${c.model}`;
  return [
    `Lead: ${line(boss)}. start_job with to "team" goes to the lead.`,
    ...cats.filter((c) => c !== boss).map((c) => `- ${line(c)}, reports to ${name(c.parentId)}`),
  ].join('\n');
}

/** The chat card of a job. */
export function jobCard(task: TaskSummary, office: Orchestrator, folder: string | null): JobCard {
  const name = (id: string) => office.cats.get(id)?.name ?? id;
  const lead = task.flow?.root ?? office.resolveTarget(task.target ?? '')?.id ?? '';
  return {
    jobId: task.id,
    title: task.title,
    target: task.target ?? 'team',
    leadName: name(lead),
    folder,
    state: task.flow?.state ?? task.status,
    turns: task.flow?.turns ?? 0,
    ...(task.costUsd !== undefined ? { costUsd: task.costUsd } : {}),
    ...(task.branch ? { branch: task.branch } : {}),
    ...(task.error ? { error: task.error } : {}),
    nodes: (task.flow?.nodes ?? []).map((n) => ({
      catId: n.cat,
      catName: name(n.cat),
      fromId: n.from,
      fromName: name(n.from),
      goal: n.goal.length > GOAL_MAX_CHARS ? `${n.goal.slice(0, GOAL_MAX_CHARS - 1)}…` : n.goal,
      status: n.status,
    })),
  };
}

/** The card as one line: `[Job a1b2 · Team: Oliver leads · ~/proj · working · 3 turns · $0.31]`. */
export function cardLine(job: JobCard): string {
  return `[${[
    `Job ${job.jobId}`,
    job.target === 'team' ? `Team: ${job.leadName} leads` : job.leadName,
    job.folder ?? 'sandbox',
    job.state,
    `${job.turns} turns`,
    ...(job.costUsd !== undefined ? [`$${job.costUsd.toFixed(2)}`] : []),
  ].join(' · ')}]`;
}
