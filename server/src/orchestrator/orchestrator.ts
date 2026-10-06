/**
 * The cat office: runs team tasks as state machines (machine/, spec
 * docs/catavasia/task-state-machine.md) whose turns are cat sessions.
 *
 * user -> root cat (brief, delegate) -> workers in their own worktrees
 * (branch task/<id>-<cat>) -> reports up -> each report's branch is merged
 * into the parent's worktree before the parent's next turn -> the root
 * reports -> the task branch task/<id> holds the merged result.
 *
 * Every turn is one engine process (per-turn, `--resume`), scheduled by the
 * TurnScheduler (cap + per-cat lock). Messages between cats queue in the
 * target's inbox and become the user message of its next turn. Each task has
 * an event log, so a task the server stopped resumes when the user asks.
 */

import * as path from 'path';

import type { CatProfile, ServerMessage } from '../../../core/src/messages.js';
import type { NarratorInput } from '../../../core/src/narrator.js';
import type { TaskTarget } from '../../../core/src/tasks.js';
import { CatCeo } from '../catCeo/catCeo.js';
import { applyPromptAction, promptDiff, promptHistory } from '../catCeo/promptActions.js';
import { CAT_CEO_ID, CATS_FILE_NAME, OFFICE_MCP_PATH, PROMPTS_DIR } from '../constants.js';
import type { RepoInfo } from '../taskBoard/gitWorktree.js';
import type { StoredTask } from '../taskBoard/taskStore.js';
import { CatConsoles } from './catConsoles.js';
import { CatStore, type EngineCatalog } from './catProfiles.js';
import { CatResidents, type ResidentHost } from './catResidents.js';
import { bossOf, hierarchyOf } from './catTree.js';
import type { EngineAdapter } from './engineAdapter.js';
import { personaText } from './flowPrompts.js';
import { EventLog, pruneFlowLogs } from './machine/eventLog.js';
import { isActive } from './machine/helpers.js';
import { type FlowSink, type RunnerHost, TaskRunner } from './machine/interpreter.js';
import type { MemberState, TaskState } from './machine/types.js';
import type { OfficeToolHandler, OfficeToolResult } from './officeMcp.js';
import { promptSections } from './promptFile.js';
import { PromptRepo } from './promptRepo.js';
import { TurnScheduler } from './turnScheduler.js';

export type { FlowSink } from './machine/interpreter.js';

/** The part of AgentRuntime the office needs: one resident character per cat profile. */
export type CatAgentHost = ResidentHost;

export interface OrchestratorOptions {
  host: CatAgentHost;
  stateDir: string;
  adapters: EngineAdapter[];
  emit: (message: ServerMessage) => void;
  turnConcurrency: number;
  /** Narrator input: tool activity, office messages and results of the cats. */
  narrate?: (input: NarratorInput) => void;
  /** Test seam of the Cat CEO's judge process. */
  ceoJudge?: ConstructorParameters<typeof CatCeo>[0]['judge'];
}

export class Orchestrator implements OfficeToolHandler, RunnerHost {
  readonly stateDir: string;
  readonly cats: CatStore;
  readonly scheduler: TurnScheduler;
  /** One office character per cat profile (spawned now, kept in sync with cats.json). */
  readonly residents: CatResidents;
  /** What the cat console shows for each profile cat. */
  readonly consoles = new CatConsoles();
  /** The judge above the boss (docs/catavasia/cat-ceo-judge.md). */
  readonly ceo: CatCeo;
  private readonly runners = new Map<string, TaskRunner>();
  private readonly tokens = new Map<string, { runner: TaskRunner; catId: string }>();
  /** Folder of each cat's newest finished task: a console message to an idle cat starts a task there. */
  private readonly lastCwd = new Map<string, string>();
  private baseMcpUrl = '';

  constructor(readonly opts: OrchestratorOptions) {
    this.stateDir = opts.stateDir;
    const prompts = new PromptRepo(path.join(opts.stateDir, PROMPTS_DIR));
    this.cats = new CatStore(
      path.join(opts.stateDir, CATS_FILE_NAME),
      () => this.catalog(),
      prompts,
    );
    this.scheduler = new TurnScheduler(opts.turnConcurrency, (state) => {
      opts.emit({ type: 'queueChanged', ...state });
      this.consoles.statusChanged();
    });
    const claude = opts.adapters.find((a) => a.engine === 'claude') as { bin?: string } | undefined;
    this.ceo = new CatCeo({
      stateDir: opts.stateDir,
      cats: this.cats,
      scheduler: this.scheduler,
      residents: () => this.residents,
      consoles: this.consoles,
      catalog: () => this.catalog(),
      emit: opts.emit,
      promptsChanged: (catIds) => {
        for (const catId of catIds) this.cats.reloadPrompt(catId);
        for (const message of this.profileMessages()) opts.emit(message);
      },
      ...(claude?.bin ? { claudeBin: claude.bin } : {}),
      ...(opts.ceoJudge ? { judge: opts.ceoJudge } : {}),
    });
    // The Cat CEO is a resident too (while it is on), outside the cat tree.
    this.residents = new CatResidents(
      opts.host,
      () => [...this.cats.list(), ...this.ceo.resident()],
      opts.emit,
    );
    this.residents.sync();
    pruneFlowLogs(opts.stateDir, Date.now());
  }

  catalog(): EngineCatalog {
    return Object.fromEntries(this.opts.adapters.map((a) => [a.engine, a.choices()]));
  }

  adapterFor(cat: CatProfile): EngineAdapter | undefined {
    return this.opts.adapters.find((a) => a.engine === cat.engine);
  }

  /** The server is listening: cats reach the office MCP tools here. */
  setServerUrl(baseUrl: string): void {
    this.baseMcpUrl = `${baseUrl}${OFFICE_MCP_PATH}`;
  }

  // ── RunnerHost ──

  mcpUrl(): string {
    return this.baseMcpUrl;
  }

  emit(message: ServerMessage): void {
    this.opts.emit(message);
  }

  narrate(input: NarratorInput): void {
    this.opts.narrate?.(input);
  }

  /** Intro line + the cat's prompt file + office rules; `sha` = the prompt file's commit. */
  persona(cat: CatProfile): { text: string; sha?: string } {
    const { file } = this.cats.prompts.read(cat.id);
    return { text: personaText(cat, promptSections(file)), sha: this.cats.prompts.headSha(cat.id) };
  }

  setToken(token: string, owner: { runner: TaskRunner; catId: string } | undefined): void {
    if (owner) this.tokens.set(token, owner);
    else this.tokens.delete(token);
  }

  /** The review region of a finished task (task-state-machine.md §3.4). */
  requestReview(task: StoredTask, state: TaskState, sink: FlowSink): void {
    this.ceo.request(task, state, sink);
  }

  finished(runner: TaskRunner): void {
    this.runners.delete(runner.task.id);
    for (const catId of Object.keys(runner.state.members)) this.lastCwd.set(catId, runner.task.cwd);
  }

  // ── Profiles (WebSocket) ──

  profileMessages(): ServerMessage[] {
    const cats = this.cats.list().map((c) => ({ ...c, ...this.cats.promptView(c.id) }));
    const engineOptions = this.opts.adapters.map((a) => {
      const { models, efforts } = a.choices();
      return { engine: a.engine, models, efforts };
    });
    return [
      { type: 'catProfilesLoaded', cats, engineOptions },
      { type: 'catHierarchy', ...hierarchyOf(cats) },
      this.ceo.message(),
      this.residents.message(),
    ];
  }

  /**
   * One Cats-menu change (client message). Returns an error, or broadcasts the
   * new snapshot: the tree rules may move other cats too.
   */
  editProfiles(msg: Record<string, unknown>): string | undefined {
    const catId = String(msg.id ?? '');
    let error: string | undefined;
    const profileId = (msg.profile as { id?: unknown } | undefined)?.id;
    if (catId === CAT_CEO_ID || profileId === CAT_CEO_ID) {
      return this.ceo.settings.enabled
        ? 'The Cat CEO cannot be deleted or changed as a cat while "Cat CEO reviews" is on'
        : 'cat-ceo is the id of the Cat CEO';
    }
    switch (msg.type) {
      case 'setCatCeoSettings':
        error = this.ceo.update(msg);
        break;
      case 'saveCatProfile': {
        const result = this.cats.saveCat(msg.profile);
        if (!result.ok) return result.error;
        const profile = { ...result.value, ...this.cats.promptView(result.value.id) };
        this.opts.emit({ type: 'catProfileSaved', profile });
        break;
      }
      case 'deleteCatProfile':
        error = this.cats.removeCat(catId);
        break;
      case 'setCatParent':
        error = this.cats.setParent(catId, String(msg.parentId ?? ''));
        break;
      case 'promoteCatToBoss':
        error = this.cats.promoteToBoss(catId);
        break;
      default:
        return `unknown change ${String(msg.type)}`;
    }
    if (error) return error;
    this.residents.sync();
    for (const message of this.profileMessages()) this.opts.emit(message);
    return undefined;
  }

  /**
   * One prompt-history request of the Cats menu. Reads answer the requester;
   * a change is committed, then every client gets the new profiles.
   */
  promptRequest(msg: Record<string, unknown>): { error?: string; reply?: ServerMessage } {
    const catId = String(msg.catId ?? '');
    if (catId !== CAT_CEO_ID && !this.cats.get(catId))
      return { error: `cat ${catId} does not exist` };
    const prompts = this.cats.prompts;
    if (msg.type === 'getPromptHistory') {
      return { reply: promptHistory(catId, prompts, this.ceo.store) };
    }
    if (msg.type === 'tidyPrompt') {
      const error = this.ceo.tidy.requestManual(catId);
      return error ? { error } : {};
    }
    if (msg.type === 'getPromptDiff') {
      const diff = promptDiff(prompts, catId, msg.sha);
      if (diff === undefined) return { error: 'unknown commit' };
      return { reply: { type: 'promptDiff', catId, sha: String(msg.sha), diff } };
    }
    const error = applyPromptAction(prompts, msg);
    if (error) return { error };
    this.cats.reloadPrompt(catId);
    for (const message of this.profileMessages()) this.opts.emit(message);
    return { reply: promptHistory(catId, prompts, this.ceo.store) };
  }

  // ── Task board ──

  targets(): TaskTarget[] {
    const cats = this.cats.list();
    const boss = bossOf(cats);
    const blocked = (c: CatProfile) =>
      this.adapterFor(c) ? {} : { disabled: `${c.engine} adapter not ready` };
    return [
      ...(boss ? [{ id: 'team', label: `Team: ${boss.name} leads`, ...blocked(boss) }] : []),
      ...cats.map((c) => ({
        id: c.id,
        label: c.role ? `${c.name}: ${c.role}` : c.name,
        ...blocked(c),
      })),
    ];
  }

  /** The cat that leads a task for `target`: `team` = the boss. */
  resolveTarget(target: string): CatProfile | undefined {
    const cats = this.cats.list();
    return target === 'team' ? bossOf(cats) : cats.find((c) => c.id === target);
  }

  /** Start a team task. `cwd` is where the root works (the task worktree, or the folder). */
  start(task: StoredTask, cwd: string, repo: RepoInfo | null, sink: FlowSink): void {
    const root = this.resolveTarget(task.target ?? '');
    if (!root) throw new Error(`Unknown task target: ${task.target}`);
    if (!this.adapterFor(root)) throw new Error(`Engine ${root.engine} has no adapter`);
    const cats = this.cats.list();
    const runner = TaskRunner.start(this, task, sink, EventLog.of(this.stateDir, task.id), {
      type: 'TaskStarted',
      taskId: task.id,
      rootId: root.id,
      prompt: task.prompt,
      cats,
      runnable: cats.filter((c) => this.adapterFor(c)).map((c) => c.id),
      repo,
      catCeo: this.ceo.settings.enabled,
      cwd,
      ...(task.worktreePath ? { worktreePath: task.worktreePath } : {}),
      ...(task.branch ? { branch: task.branch } : {}),
    });
    this.runners.set(task.id, runner);
  }

  /** T14: a task the server stopped goes on from its saved state. */
  resume(task: StoredTask, sink: FlowSink): void {
    const runner = this.load(task, sink);
    runner.dispatch({ type: 'ResumeRequested' });
  }

  /** T12 / T15: stop the turns, keep the branches, end the task as cancelled. */
  cancel(task: StoredTask, sink: FlowSink): void {
    const runner = this.runners.get(task.id) ?? this.load(task, sink);
    runner.dispatch({ type: 'CancelRequested' });
  }

  /** A stopped task from its event log, in `interrupted` (T13 for a crash). */
  private load(task: StoredTask, sink: FlowSink): TaskRunner {
    if (this.runners.has(task.id)) throw new Error('The task is running.');
    const log = EventLog.of(this.stateDir, task.id);
    const saved = log.load();
    if (!saved) throw new Error('The task has no saved state.');
    const runner = new TaskRunner(this, task, sink, log, saved.state, saved.seq);
    if (saved.state.phase !== 'interrupted') runner.dispatch({ type: 'ServerRestarted' });
    if (runner.state.phase !== 'interrupted') {
      throw new Error(`The task is ${runner.state.phase}, not interrupted.`);
    }
    this.runners.set(task.id, runner);
    return runner;
  }

  /** Server shutdown: every task goes to `interrupted` (T13) and its turns stop. */
  dispose(): void {
    this.ceo.dispose();
    for (const runner of this.runners.values()) runner.interrupt();
    this.runners.clear();
    this.tokens.clear();
  }

  // ── Office MCP ──

  knowsToken(token: string): boolean {
    return this.tokens.has(token);
  }

  callTool(token: string, name: string, args: Record<string, unknown>): OfficeToolResult {
    const entry = this.tokens.get(token);
    const reply = entry?.runner.dispatch({ type: 'ToolCalled', catId: entry.catId, name, args });
    return reply ?? { text: 'This task has ended.', isError: true };
  }

  // ── Cat console (server/src/catTerminal/officeCatSource.ts) ──

  /** The newest live task of a cat, with its member state. */
  liveMember(catId: string): { taskId: string; member: MemberState } | undefined {
    let found: { taskId: string; member: MemberState } | undefined;
    for (const runner of this.runners.values()) {
      const member = runner.state.members[catId];
      if (member && isActive(runner.state.phase)) found = { taskId: runner.task.id, member };
    }
    return found;
  }

  /** A turn of this cat runs or waits for a slot. */
  hasPendingTurn(catId: string): boolean {
    const { running, queued } = this.scheduler.state();
    return running.includes(catId) || queued.includes(catId);
  }

  /**
   * A user message from the cat console: the next turn of the cat's live task
   * reads it. Returns false when the cat has no live task.
   */
  sendUserMessage(catId: string, text: string): boolean {
    const live = this.liveMember(catId);
    if (!live) return false;
    this.runners.get(live.taskId)!.dispatch({ type: 'UserMessage', catId, text });
    return true;
  }

  lastCwdOf(catId: string): string | undefined {
    const live = this.liveMember(catId);
    return live ? this.runners.get(live.taskId)!.task.cwd : this.lastCwd.get(catId);
  }
}
