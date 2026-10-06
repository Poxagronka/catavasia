/**
 * Office tool guards and effects on the task state (moved from phase 1
 * officeTools.ts, not changed, plus `delegate` with `rework: true`).
 *
 * - delegate: only to a direct report that has no open assignment (A1, I2).
 * - ask / reply: to the parent, a direct report, or a sibling.
 * - report: only on a delegated task, after every assignment below settled
 *   and every report was read (I3); the root reports the final result.
 * - brief: only the root.
 */

import type { CatProfile } from '../../../../core/src/messages.js';
import { CAT_MESSAGE_MAX_CHARS } from '../../constants.js';
import { childrenOf, isInSubtree, relationOf } from '../catTree.js';
import {
  askMessage,
  catLabel,
  delegateMessage,
  replyMessage,
  teamText,
  workerBranch,
} from '../flowPrompts.js';
import { createAssignment } from './assignmentReducer.js';
import {
  deliver,
  type Draft,
  ensureMember,
  hasUnread,
  isOpen,
  message,
  openAssignmentOf,
  setPhase,
} from './helpers.js';
import type { ToolReply } from './types.js';

class ToolError extends Error {}

function arg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || !value.trim()) throw new ToolError(`"${key}" is required.`);
  if (value.length > CAT_MESSAGE_MAX_CHARS) {
    throw new ToolError(`"${key}" is longer than ${CAT_MESSAGE_MAX_CHARS} characters.`);
  }
  return value.trim();
}

function catById(d: Draft, id: string): CatProfile {
  const cat = d.s.cats.find((c) => c.id === id);
  if (!cat) throw new ToolError(`There is no cat with id "${id}". Call list_team.`);
  return cat;
}

function ids(cats: CatProfile[]): string {
  return cats.length ? cats.map((c) => c.id).join(', ') : 'nobody';
}

/** Only the task's team (the root and the cats below it), and only cats that can run. */
function inTeam(d: Draft, to: CatProfile): void {
  if (!isInSubtree(d.s.cats, d.s.rootId, to.id)) {
    throw new ToolError(`${to.id} is not in the team of this task.`);
  }
  if (!d.s.runnable.includes(to.id)) {
    throw new ToolError(`${to.id} runs on ${to.engine}, which cannot run yet. Pick another cat.`);
  }
}

/** Run one office tool for `catId`. Guard failures come back as tool errors. */
export function runOfficeTool(
  d: Draft,
  catId: string,
  name: string,
  args: Record<string, unknown>,
): ToolReply {
  try {
    return { text: runTool(d, catId, name, args) };
  } catch (err) {
    if (err instanceof ToolError) return { text: err.message, isError: true };
    throw err;
  }
}

function runTool(d: Draft, catId: string, name: string, args: Record<string, unknown>): string {
  const { s } = d;
  const me = catById(d, catId);
  const self = ensureMember(d, catId);
  const isRoot = catId === s.rootId;

  switch (name) {
    case 'list_team':
      return teamText(s.cats, me);

    case 'brief': {
      if (!isRoot) throw new ToolError('Only the cat that leads this task can brief.');
      s.brief = arg(args, 'plan');
      message(d, catId, 'team', 'brief', s.brief);
      if (s.phase === 'briefing') setPhase(d, 'delegating'); // T2
      return 'Plan shared. Now delegate the parts to your direct reports.';
    }

    case 'delegate': {
      const to = catById(d, arg(args, 'to'));
      const task = arg(args, 'task');
      const rework = args.rework === true;
      inTeam(d, to);
      if (relationOf(s.cats, catId, to.id) !== 'child') {
        throw new ToolError(
          `${to.id} is not your direct report. You can delegate only to: ${ids(childrenOf(s.cats, catId))}.`,
        );
      }
      if (openAssignmentOf(s, to.id)) {
        throw new ToolError(`${to.id} still works on an earlier task. Use ask to add details.`);
      }
      const last = [...s.assignments].reverse().find((a) => a.child === to.id);
      if (rework && last?.state !== 'reported') {
        throw new ToolError(`${to.id} has no report to rework. Delegate without rework.`);
      }
      const branch = s.repo ? workerBranch(s.taskId, to.id) : undefined;
      createAssignment(d, catId, to.id, task, branch, rework);
      message(d, catId, to.id, 'delegate', task);
      deliver(d, to.id, delegateMessage(me, to, task, s.cats, branch, s.brief, rework));
      // T3, T5
      if (s.phase === 'briefing' || s.phase === 'delegating' || s.phase === 'reporting') {
        setPhase(d, 'working');
      }
      return `Delegated to ${catLabel(to)}. The report arrives as a new message. End your turn when you have nothing else to do.`;
    }

    case 'ask':
    case 'reply': {
      const to = catById(d, arg(args, 'to'));
      const body = arg(args, name === 'ask' ? 'question' : 'answer');
      inTeam(d, to);
      if (!relationOf(s.cats, catId, to.id)) {
        const allowed = s.cats.filter((c) => relationOf(s.cats, catId, c.id));
        throw new ToolError(
          `You can talk only to your lead, your direct reports and your siblings: ${ids(allowed)}.`,
        );
      }
      message(d, catId, to.id, name, body);
      if (name === 'ask') {
        const target = deliver(d, to.id, askMessage(me, body));
        if (!target.askedBy.includes(catId)) target.askedBy.push(catId);
        if (!self.waitingOn.includes(to.id)) self.waitingOn.push(to.id);
        return `Question sent to ${catLabel(to)}. The reply arrives as a new message.`;
      }
      const target = deliver(d, to.id, replyMessage(me, body));
      target.waitingOn = target.waitingOn.filter((c) => c !== catId);
      self.askedBy = self.askedBy.filter((c) => c !== to.id);
      return `Reply sent to ${catLabel(to)}.`;
    }

    case 'report': {
      const result = arg(args, 'result');
      // I3: a report includes the work of every cat below: none may still
      // work, and no report (or its branch) may still wait to be read.
      const open = s.assignments.filter(
        (a) => isOpen(a) && a.child !== catId && (isRoot || a.parent === catId),
      );
      if (open.length) {
        throw new ToolError(
          `Wait: ${open.map((a) => a.child).join(', ')} still work on their tasks. Their reports arrive as new messages.`,
        );
      }
      if (hasUnread(self)) {
        throw new ToolError('Wait: a report reaches you in your next turn. Read it, then report.');
      }
      if (isRoot) {
        self.final = result;
        message(d, catId, 'user', 'final', result);
        return 'The office gives your result to the user. End your turn now.';
      }
      const mine = openAssignmentOf(s, catId);
      if (!mine) {
        throw new ToolError(
          'Nobody gave you a task to report on. To answer a question, use reply.',
        );
      }
      // The assignment settles when the report is delivered, after this turn ends.
      self.outgoingReport = result;
      message(d, catId, mine.parent, 'report', result);
      return `Your report goes to ${mine.parent} when this turn ends. End your turn now.`;
    }

    default:
      throw new ToolError(`Unknown office tool: ${name}`);
  }
}
