/**
 * Approval cards: a cat or the CEO waits for the user's yes or no before one
 * action (its permission mode asked, claudeAdapter.ts). The CEO dock shows
 * the open ones; an unanswered card counts as Deny after APPROVAL_TIMEOUT_MS.
 */

import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';

import type { CeoApproval, CeoQuestion } from '../../../core/src/ceoDesk.js';
import { APPROVAL_TIMEOUT_MS } from '../constants.js';
import { relativePaths, summarizeInput } from '../taskBoard/streamJson.js';
import type { PermissionAnswer, PermissionAsk } from './engineAdapter.js';

/** Claude Code tools in plain words ("wants to ..."). */
const ACTIONS: Record<string, string> = {
  Bash: 'run a command',
  Write: 'create or replace a file',
  Edit: 'change a file',
  MultiEdit: 'change a file',
  NotebookEdit: 'change a notebook',
  Read: 'read a file',
  Glob: 'look for files',
  Grep: 'search in files',
  WebFetch: 'open a web page',
  WebSearch: 'search the web',
  Agent: 'start a helper',
  Task: 'start a helper',
  AskUserQuestion: 'ask you a question',
  ExitPlanMode: 'start work on this plan',
};

/** The questions of an AskUserQuestion call, or undefined for any other tool. */
function questionsOf(toolName: string, input: Record<string, unknown>): CeoQuestion[] | undefined {
  if (toolName !== 'AskUserQuestion' || !Array.isArray(input.questions)) return undefined;
  return (input.questions as CeoQuestion[]).map((q) => ({
    question: q.question,
    header: q.header,
    options: q.options.map((o) => ({ label: o.label, description: o.description })),
    multiSelect: !!q.multiSelect,
  }));
}

/** What a tool call does, in plain words, and its command, file or address (relative to `folders`). */
export function describeAction(
  toolName: string,
  input: Record<string, unknown>,
  folders: string[] = [],
): { action: string; detail: string } {
  const mcp = /^mcp__(.+?)__(.+)$/.exec(toolName);
  const action =
    ACTIONS[toolName] ??
    (mcp ? `use ${mcp[2].replace(/_/g, ' ')} (${mcp[1]})` : `use the ${toolName} tool`);
  return { action, detail: relativePaths(summarizeInput(input), folders) };
}

interface Open {
  approval: CeoApproval;
  finish(answer: PermissionAnswer): void;
}

export class Approvals {
  readonly events = new EventEmitter<{ change: [] }>();
  private readonly open = new Map<string, Open>();

  constructor(private readonly timeoutMs = APPROVAL_TIMEOUT_MS) {}

  /** Show a card for `who` and wait for the answer (Deny on timeout or when the turn ends). */
  ask(who: { catId: string; name: string }, ask: PermissionAsk): Promise<PermissionAnswer> {
    if (ask.signal.aborted) return Promise.resolve('deny');
    const id = randomUUID();
    return new Promise((resolve) => {
      const finish = (answer: PermissionAnswer) => {
        if (!this.open.delete(id)) return;
        clearTimeout(timer);
        ask.signal.removeEventListener('abort', onAbort);
        this.events.emit('change');
        resolve(answer);
      };
      const onAbort = () => finish('deny');
      const timer = setTimeout(onAbort, this.timeoutMs);
      timer.unref();
      ask.signal.addEventListener('abort', onAbort, { once: true });
      const questions = questionsOf(ask.toolName, ask.input);
      const plan =
        ask.toolName === 'ExitPlanMode' && typeof ask.input.plan === 'string'
          ? ask.input.plan
          : undefined;
      const approval: CeoApproval = {
        id,
        catId: who.catId,
        who: who.name,
        ...describeAction(ask.toolName, ask.input, ask.folders),
        canAlwaysAllow: ask.canAlwaysAllow && !questions && plan === undefined,
        expiresAt: Date.now() + this.timeoutMs,
        ...(questions ? { questions, detail: '' } : {}),
        ...(plan !== undefined ? { plan, detail: '' } : {}),
      };
      this.open.set(id, { approval, finish });
      this.events.emit('change');
    });
  }

  /** The user's answer. False: no such card (answered, timed out, or its turn ended). */
  answer(id: string, answer: PermissionAnswer): boolean {
    const open = this.open.get(id);
    if (!open) return false;
    // No rule to keep, answers to a card without questions, or a plan choice
    // on a card without a plan: a plain Allow or Deny.
    const card = open.approval;
    const plain =
      (answer === 'always' && !card.canAlwaysAllow) ||
      (typeof answer === 'object' && 'answers' in answer && !card.questions) ||
      (typeof answer === 'object' && 'mode' in answer && card.plan === undefined);
    const refused =
      typeof answer === 'object' && 'keepPlanning' in answer && card.plan === undefined;
    // A plain Allow of a plan leaves Plan mode as the CLI's "ask for each edit" does.
    const planAllow = card.plan !== undefined && (answer === 'allow' || answer === 'always');
    open.finish(refused ? 'deny' : planAllow ? { mode: 'ask' } : plain ? 'allow' : answer);
    return true;
  }

  /** The open cards, oldest first. */
  list(): CeoApproval[] {
    return [...this.open.values()].map((o) => o.approval);
  }
}
