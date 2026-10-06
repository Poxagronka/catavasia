/**
 * Office tool semantics and the hierarchy rules, on one team task (a Flow).
 *
 * - delegate: only to a direct report.
 * - ask / reply: to the parent, a direct report, or a sibling.
 * - report: only to the cat that delegated (the parent); the root reports to the user.
 * - brief: only the root.
 *
 * A tool changes flow state and queues messages through `FlowContext`; it
 * never waits for another cat.
 */

import type { CatMessageKind, CatProfile, FlowState } from '../../../core/src/messages.js';
import type { TaskFlow } from '../../../core/src/tasks.js';
import { CAT_MESSAGE_MAX_CHARS } from '../constants.js';
import type { RepoInfo } from '../taskBoard/gitWorktree.js';
import type { StoredTask } from '../taskBoard/taskStore.js';
import { childrenOf, relationOf } from './catTree.js';
import type { TurnHandle } from './engineAdapter.js';
import { askMessage, catLabel, delegateMessage, replyMessage, teamText } from './flowPrompts.js';
import type { OfficeToolResult } from './officeMcp.js';

/** One cat taking part in one team task. */
export interface Member {
  cat: CatProfile;
  sessionId: string;
  token: string;
  systemPromptFile: string;
  mcpConfigFile: string;
  /** Where its turns run; unset until its worktree exists. */
  cwd?: string;
  /** Its own worktree root (the task worktree for the root cat). */
  worktreePath?: string;
  branch?: string;
  agentId?: number;
  /** The session exists, so the next turn resumes it. */
  started: boolean;
  inbox: string[];
  /** A turn is queued or running. */
  scheduled: boolean;
  handle?: TurnHandle;
  /** Cumulative session cost after its last turn. */
  sessionCostUsd: number;
  /** Reports whose branches merge into this cat's worktree before its next turn. */
  pendingMerges: string[];
  /** Cats that asked this cat and wait for a reply. */
  askedBy: Set<string>;
  /** Cats this cat asked and waits for. */
  waitingOn: Set<string>;
  /** A report made in the running turn, sent when the turn ends. */
  outgoingReport?: string;
  /** The root's final result, made in the running turn. */
  final?: string;
  nudged: boolean;
}

export interface Flow {
  task: StoredTask & { flow: TaskFlow };
  /** The hierarchy as it was when the task started. */
  cats: CatProfile[];
  rootId: string;
  members: Map<string, Member>;
  repo: RepoInfo | null;
  ended: boolean;
}

export interface FlowContext {
  /** Queue a message for a cat's next turn (it joins the task if needed). */
  deliver(flow: Flow, to: string, text: string): Member;
  /** Record and broadcast one office message. */
  message(flow: Flow, from: string, to: string, kind: CatMessageKind, text: string): void;
  setState(flow: Flow, state: FlowState): void;
}

class ToolError extends Error {}

function arg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || !value.trim()) throw new ToolError(`"${key}" is required.`);
  if (value.length > CAT_MESSAGE_MAX_CHARS) {
    throw new ToolError(`"${key}" is longer than ${CAT_MESSAGE_MAX_CHARS} characters.`);
  }
  return value.trim();
}

function catById(flow: Flow, id: string): CatProfile {
  const cat = flow.cats.find((c) => c.id === id);
  if (!cat) throw new ToolError(`There is no cat with id "${id}". Call list_team.`);
  return cat;
}

function ids(cats: CatProfile[]): string {
  return cats.length ? cats.map((c) => c.id).join(', ') : 'nobody';
}

export function openNodeOf(flow: Flow, catId: string) {
  return flow.task.flow.nodes.find((n) => n.cat === catId && n.status === 'working');
}

export function workerBranch(taskId: string, catId: string): string {
  // `task/<id>/<cat>` cannot coexist with the `task/<id>` branch in git refs.
  return `task/${taskId}-${catId}`;
}

/** Run one office tool for `catId`. Errors come back as tool errors, never throws. */
export function callOfficeTool(
  ctx: FlowContext,
  flow: Flow,
  catId: string,
  name: string,
  args: Record<string, unknown>,
): OfficeToolResult {
  try {
    return { text: runTool(ctx, flow, catId, name, args) };
  } catch (err) {
    if (err instanceof ToolError) return { text: err.message, isError: true };
    throw err;
  }
}

function runTool(
  ctx: FlowContext,
  flow: Flow,
  catId: string,
  name: string,
  args: Record<string, unknown>,
): string {
  const me = catById(flow, catId);
  const self = flow.members.get(catId)!;
  const isRoot = catId === flow.rootId;
  const state = flow.task.flow;

  switch (name) {
    case 'list_team':
      return teamText(flow.cats, me);

    case 'brief': {
      if (!isRoot) throw new ToolError('Only the cat that leads this task can brief.');
      state.brief = arg(args, 'plan');
      ctx.message(flow, catId, 'team', 'brief', state.brief);
      if (state.state === 'briefing') ctx.setState(flow, 'delegating');
      return 'Plan shared. Now delegate the parts to your direct reports.';
    }

    case 'delegate': {
      const to = catById(flow, arg(args, 'to'));
      const task = arg(args, 'task');
      if (relationOf(flow.cats, catId, to.id) !== 'child') {
        throw new ToolError(
          `${to.id} is not your direct report. You can delegate only to: ${ids(childrenOf(flow.cats, catId))}.`,
        );
      }
      if (openNodeOf(flow, to.id)) {
        throw new ToolError(`${to.id} still works on an earlier task. Use ask to add details.`);
      }
      const branch = flow.repo ? workerBranch(flow.task.id, to.id) : undefined;
      const node = state.nodes.find((n) => n.cat === to.id);
      if (node) Object.assign(node, { from: catId, goal: task, status: 'working' });
      else state.nodes.push({ cat: to.id, from: catId, goal: task, status: 'working', branch });
      ctx.message(flow, catId, to.id, 'delegate', task);
      ctx.deliver(flow, to.id, delegateMessage(me, to, task, flow.cats, branch, state.brief));
      if (state.state === 'briefing' || state.state === 'delegating') ctx.setState(flow, 'working');
      return `Delegated to ${catLabel(to)}. The report arrives as a new message. End your turn when you have nothing else to do.`;
    }

    case 'ask':
    case 'reply': {
      const to = catById(flow, arg(args, 'to'));
      const body = arg(args, name === 'ask' ? 'question' : 'answer');
      if (!relationOf(flow.cats, catId, to.id)) {
        const allowed = flow.cats.filter((c) => relationOf(flow.cats, catId, c.id));
        throw new ToolError(
          `You can talk only to your lead, your direct reports and your siblings: ${ids(allowed)}.`,
        );
      }
      ctx.message(flow, catId, to.id, name, body);
      if (name === 'ask') {
        const target = ctx.deliver(flow, to.id, askMessage(me, body));
        target.askedBy.add(catId);
        self.waitingOn.add(to.id);
        return `Question sent to ${catLabel(to)}. The reply arrives as a new message.`;
      }
      const target = ctx.deliver(flow, to.id, replyMessage(me, body));
      target.waitingOn.delete(catId);
      self.askedBy.delete(to.id);
      return `Reply sent to ${catLabel(to)}.`;
    }

    case 'report': {
      const result = arg(args, 'result');
      if (isRoot) {
        const open = state.nodes.filter((n) => n.status === 'working');
        if (open.length) {
          throw new ToolError(
            `Wait: ${open.map((n) => n.cat).join(', ')} still work on their tasks. Their reports arrive as new messages.`,
          );
        }
        self.final = result;
        ctx.message(flow, catId, 'user', 'final', result);
        return 'The office gives your result to the user. End your turn now.';
      }
      const node = openNodeOf(flow, catId);
      if (!node) {
        throw new ToolError(
          'Nobody gave you a task to report on. To answer a question, use reply.',
        );
      }
      // The node closes when the report is delivered, after this turn ends.
      self.outgoingReport = result;
      ctx.message(flow, catId, node.from, 'report', result);
      return `Your report goes to ${node.from} when this turn ends. End your turn now.`;
    }

    default:
      throw new ToolError(`Unknown office tool: ${name}`);
  }
}
