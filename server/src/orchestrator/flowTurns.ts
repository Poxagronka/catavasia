/**
 * One turn of one cat, and the git side of a team task.
 *
 * Before a turn: the cat's worktree exists, and the branches of reports it
 * received are merged into it. After a turn: a report goes up (the worker's
 * worktree is committed first), unanswered questions get the turn's text as
 * the answer, and a cat that ended its turn without reporting is nudged once,
 * then its last text counts as its report.
 */

import * as path from 'path';

import { TASK_WORKTREES_DIR } from '../constants.js';
import {
  commitAll,
  createWorktree,
  finalizeWorktree,
  mergeBranch,
  removeWorktree,
} from '../taskBoard/gitWorktree.js';
import { catLabel, mergeNote, NUDGE_REPORT, reportMessage } from './flowPrompts.js';
import { type Flow, type Member, openNodeOf, workerBranch } from './officeTools.js';
import type { Orchestrator } from './orchestrator.js';

const NO_TEXT = '(no text)';

/** Give a cat its folder: its own worktree in a git repo, else the task folder. */
export async function prepareWorkspace(flow: Flow, member: Member, stateDir: string) {
  if (member.cwd) return;
  if (!flow.repo) {
    member.cwd = flow.task.cwd;
    return;
  }
  const worktreePath = path.join(stateDir, TASK_WORKTREES_DIR, `${flow.task.id}-${member.cat.id}`);
  member.branch = workerBranch(flow.task.id, member.cat.id);
  await createWorktree(flow.repo, worktreePath, member.branch);
  member.worktreePath = worktreePath;
  member.cwd = path.join(worktreePath, flow.repo.subdir);
}

/** Merge the branches of the reports this cat received; one note per merge. */
async function mergeReports(flow: Flow, member: Member): Promise<string[]> {
  const notes: string[] = [];
  const children = member.pendingMerges.splice(0);
  if (!member.worktreePath) return notes;
  await commitAll(member.worktreePath, `${catLabel(member.cat)}: work in progress`);
  for (const childId of children) {
    const child = flow.members.get(childId);
    if (!child?.branch) continue;
    const outcome = await mergeBranch(member.worktreePath, child.branch, `Merge ${child.branch}`);
    notes.push(mergeNote(child.cat, child.branch, outcome));
  }
  return notes;
}

export async function runTurnFor(office: Orchestrator, flow: Flow, member: Member): Promise<void> {
  const adapter = office.adapterFor(member.cat)!;
  // Merge until no report is pending, then take the inbox in the same tick, so
  // a report never reaches the cat before its branch is merged.
  const notes: string[] = [];
  while (member.pendingMerges.length) notes.push(...(await mergeReports(flow, member)));
  const message = [...notes, ...member.inbox.splice(0)].join('\n\n---\n\n');
  if (!message) return;
  // Questions this turn reads; one that arrives mid-turn waits for the next turn.
  const askedThisTurn = new Set(member.askedBy);
  office.ensureCharacter(flow, member);
  const agentId = member.agentId!;
  const taskId = flow.task.id;
  office.opts.emit({ type: 'catTurnStarted', catId: member.cat.id, taskId, id: agentId });
  office.opts.host.setHeadlessAgentActive(agentId, true);

  member.handle = adapter.spawnTurn({
    sessionId: member.sessionId,
    resume: member.started,
    cwd: member.cwd!,
    model: member.cat.model,
    effort: member.cat.effort,
    systemPromptFile: member.systemPromptFile,
    mcpConfigFile: member.mcpConfigFile,
    message,
    onLog: (entry) =>
      office.log(flow, {
        ...entry,
        name: entry.kind === 'tool' ? `${member.cat.name}: ${entry.name}` : member.cat.name,
      }),
  });
  const outcome = await member.handle.done;
  member.handle = undefined;
  member.started ||= outcome.sessionStarted;
  const sessionCost = outcome.sessionCostUsd ?? member.sessionCostUsd;
  const costUsd = Math.max(0, sessionCost - member.sessionCostUsd);
  member.sessionCostUsd = sessionCost;
  flow.task.costUsd = (flow.task.costUsd ?? 0) + costUsd;
  office.opts.host.setHeadlessAgentActive(agentId, false);
  office.opts.emit({
    type: 'catTurnFinished',
    catId: member.cat.id,
    taskId,
    id: agentId,
    ok: outcome.ok,
    costUsd,
    inputTokens: outcome.usage?.inputTokens,
    cacheReadTokens: outcome.usage?.cacheReadTokens,
    cacheCreationTokens: outcome.usage?.cacheCreationTokens,
    outputTokens: outcome.usage?.outputTokens,
  });
  if (!outcome.ok)
    office.log(flow, { kind: 'error', name: member.cat.name, text: outcome.error ?? '' });
  office.save(flow);
  if (flow.ended) return;

  const isRoot = member.cat.id === flow.rootId;
  if (!outcome.ok) {
    if (isRoot)
      return office.endFlow(flow, false, `${catLabel(member.cat)} failed: ${outcome.error}`);
    if (openNodeOf(flow, member.cat.id)) {
      await sendReport(office, flow, member, `The turn failed: ${outcome.error}`, true);
    }
    return;
  }
  if (member.final !== undefined) return office.endFlow(flow, true, member.final);
  if (member.outgoingReport !== undefined) {
    const text = member.outgoingReport;
    member.outgoingReport = undefined;
    await sendReport(office, flow, member, text, false);
  }
  // A question this cat did not answer with reply: its last text is the answer.
  for (const asker of askedThisTurn) {
    if (!member.askedBy.delete(asker)) continue;
    office.message(flow, member.cat.id, asker, 'reply', outcome.text ?? NO_TEXT);
    const target = office.deliver(
      flow,
      asker,
      `[Reply from ${catLabel(member.cat)}]\n${outcome.text ?? NO_TEXT}`,
    );
    target.waitingOn.delete(member.cat.id);
  }
  await finishIfIdle(office, flow, member, outcome.text ?? NO_TEXT);
}

/** A cat with nothing left to wait for must report: one nudge, then auto-report. */
async function finishIfIdle(office: Orchestrator, flow: Flow, member: Member, lastText: string) {
  const isRoot = member.cat.id === flow.rootId;
  const busy =
    member.inbox.length > 0 ||
    member.pendingMerges.length > 0 ||
    member.waitingOn.size > 0 ||
    flow.task.flow.nodes.some((n) => n.from === member.cat.id && n.status === 'working');
  const owesReport = isRoot || openNodeOf(flow, member.cat.id) !== undefined;
  if (busy || !owesReport) return;
  if (!member.nudged) {
    member.nudged = true;
    office.message(flow, 'office', member.cat.id, 'nudge', NUDGE_REPORT);
    office.deliver(flow, member.cat.id, NUDGE_REPORT);
    return;
  }
  if (isRoot) {
    office.message(flow, member.cat.id, 'user', 'final', lastText);
    return office.endFlow(flow, true, lastText);
  }
  const node = openNodeOf(flow, member.cat.id)!;
  office.message(flow, member.cat.id, node.from, 'report', lastText);
  await sendReport(office, flow, member, lastText, false);
}

/** Commit the worker's worktree, then hand its report (and branch) to the delegator. */
async function sendReport(
  office: Orchestrator,
  flow: Flow,
  member: Member,
  text: string,
  failed: boolean,
) {
  const node = flow.task.flow.nodes.find((n) => n.cat === member.cat.id);
  if (!node) return;
  node.status = failed ? 'failed' : 'reported';
  member.nudged = false;
  const parent = node.from;
  if (member.worktreePath && !failed) {
    await commitAll(
      member.worktreePath,
      `${catLabel(member.cat)}: ${node.goal.split('\n')[0].slice(0, 72)}`,
    );
  }
  if (member.branch && !failed) flow.members.get(parent)?.pendingMerges.push(member.cat.id);
  office.deliver(flow, parent, reportMessage(member.cat, text, failed));
  const stillOpen = flow.task.flow.nodes.some((n) => n.status === 'working');
  if (parent === flow.rootId && !stillOpen) office.setState(flow, 'reporting');
}

/** Commit and remove every worker worktree (branches stay), then finalize the task worktree. */
export async function endFlowWorkspaces(flow: Flow): Promise<string | undefined> {
  const errors: string[] = [];
  const { task } = flow;
  for (const m of flow.members.values()) {
    if (m.cat.id === flow.rootId || !m.worktreePath || !flow.repo) continue;
    try {
      await commitAll(m.worktreePath, `${catLabel(m.cat)}: leftovers`);
      await removeWorktree(flow.repo.root, m.worktreePath);
    } catch (err) {
      errors.push(`Worktree of ${m.cat.id} kept at ${m.worktreePath}: ${String(err)}`);
    }
  }
  if (task.worktreePath && task.repoRoot && task.baseCommit) {
    try {
      const outcome = await finalizeWorktree(
        task.repoRoot,
        task.worktreePath,
        task.baseCommit,
        `task ${task.id}: ${task.title}`,
      );
      Object.assign(task, outcome);
    } catch (err) {
      errors.push(`Worktree cleanup failed (kept at ${task.worktreePath}): ${String(err)}`);
    }
  }
  return errors.length ? errors.join('\n') : undefined;
}
