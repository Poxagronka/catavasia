/**
 * The cat office: runs team tasks (flows) as turns of cat sessions.
 *
 * user -> root cat (brief, delegate) -> workers in their own worktrees
 * (branch task/<id>-<cat>) -> reports up -> each report's branch is merged
 * into the parent's worktree before the parent's next turn -> the root
 * reports -> the task branch task/<id> holds the merged result.
 *
 * Every turn is one engine process (per-turn, `--resume`), scheduled by the
 * TurnScheduler (cap + per-cat lock). Messages between cats queue in the
 * target's inbox and become the user message of its next turn.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import type {
  CatMessageKind,
  CatProfile,
  FlowState,
  ServerMessage,
} from '../../../core/src/messages.js';
import type { NarratorInput } from '../../../core/src/narrator.js';
import type { TaskLogEntry, TaskTarget } from '../../../core/src/tasks.js';
import {
  CATS_FILE_NAME,
  FLOW_MAX_TURNS,
  OFFICE_MCP_PATH,
  ORCHESTRATOR_DIR,
  TASK_LOG_MAX_ENTRIES,
  TASK_LOG_TEXT_MAX_CHARS,
} from '../constants.js';
import type { RepoInfo } from '../taskBoard/gitWorktree.js';
import type { StoredTask } from '../taskBoard/taskStore.js';
import { CAT_BREED_IDS, CatStore, type EngineCatalog } from './catProfiles.js';
import { bossOf, hierarchyOf } from './catTree.js';
import type { EngineAdapter } from './engineAdapter.js';
import { catLabel, personaText, rootTaskMessage } from './flowPrompts.js';
import { endFlowWorkspaces, prepareWorkspace, runTurnFor } from './flowTurns.js';
import type { OfficeToolHandler, OfficeToolResult } from './officeMcp.js';
import { callOfficeTool, type Flow, type FlowContext, type Member } from './officeTools.js';
import { TurnScheduler } from './turnScheduler.js';

/** The part of AgentRuntime the office needs: one character per cat per task. */
export interface CatAgentHost {
  launchHeadlessAgent(
    sessionId: string,
    cwd: string,
    look?: { palette?: number; hueShift?: number },
  ): { id: number; palette?: number; hueShift?: number };
  finishHeadlessAgent(id: number, taskId: string): void;
  setHeadlessAgentActive(id: number, active: boolean): void;
  removeAgent(id: number): void;
}

/** Where a flow's task is persisted (the task board). */
export interface FlowSink {
  save(task: StoredTask): void;
  ended(task: StoredTask): void;
}

export interface OrchestratorOptions {
  host: CatAgentHost;
  stateDir: string;
  adapters: EngineAdapter[];
  emit: (message: ServerMessage) => void;
  turnConcurrency: number;
  /** Narrator input: tool activity, office messages and results of the cats. */
  narrate?: (input: NarratorInput) => void;
}

export class Orchestrator implements OfficeToolHandler, FlowContext {
  readonly cats: CatStore;
  readonly scheduler: TurnScheduler;
  private readonly flows = new Map<string, Flow>();
  private readonly sinks = new Map<string, FlowSink>();
  private readonly tokens = new Map<string, { flow: Flow; catId: string }>();
  /** Character of each cat's last finished task, replaced by its next one. */
  private readonly lastAgentByCat = new Map<string, number>();
  private mcpUrl = '';

  constructor(readonly opts: OrchestratorOptions) {
    this.cats = new CatStore(path.join(opts.stateDir, CATS_FILE_NAME), () => this.catalog());
    this.scheduler = new TurnScheduler(opts.turnConcurrency, (state) =>
      opts.emit({ type: 'queueChanged', ...state }),
    );
  }

  catalog(): EngineCatalog {
    return Object.fromEntries(this.opts.adapters.map((a) => [a.engine, a.choices()]));
  }

  adapterFor(cat: CatProfile): EngineAdapter | undefined {
    return this.opts.adapters.find((a) => a.engine === cat.engine);
  }

  /** The server is listening: cats reach the office MCP tools here. */
  setServerUrl(baseUrl: string): void {
    this.mcpUrl = `${baseUrl}${OFFICE_MCP_PATH}`;
  }

  // ── Profiles (WebSocket) ──

  profileMessages(): ServerMessage[] {
    const cats = this.cats.list();
    const engineOptions = this.opts.adapters.map((a) => {
      const { models, efforts } = a.choices();
      return { engine: a.engine, models, efforts };
    });
    return [
      { type: 'catProfilesLoaded', cats, engineOptions },
      { type: 'catHierarchy', ...hierarchyOf(cats) },
    ];
  }

  /**
   * One Cats-menu change (client message). Returns an error, or broadcasts the
   * new snapshot: the tree rules may move other cats too.
   */
  editProfiles(msg: Record<string, unknown>): string | undefined {
    const catId = String(msg.id ?? '');
    let error: string | undefined;
    switch (msg.type) {
      case 'saveCatProfile': {
        const result = this.cats.saveCat(msg.profile);
        if (!result.ok) return result.error;
        this.opts.emit({ type: 'catProfileSaved', profile: result.value });
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
    if (!error) for (const message of this.profileMessages()) this.opts.emit(message);
    return error;
  }

  // ── Task board ──

  targets(): TaskTarget[] {
    const cats = this.cats.list();
    const boss = bossOf(cats);
    return [
      ...(boss ? [{ id: 'team', label: `Team (${boss.name} leads)` }] : []),
      ...cats.map((c) => ({ id: c.id, label: c.role ? `${c.name}: ${c.role}` : c.name })),
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
    task.flow = { root: root.id, state: 'briefing', nodes: [], turns: 0 };
    const flow: Flow = {
      task: task as Flow['task'],
      cats: this.cats.list(),
      rootId: root.id,
      members: new Map(),
      repo,
      ended: false,
    };
    this.flows.set(task.id, flow);
    this.sinks.set(task.id, sink);
    const member = this.join(flow, root.id);
    member.cwd = cwd;
    member.worktreePath = task.worktreePath;
    member.branch = task.branch;
    this.opts.emit({ type: 'flowStateChanged', taskId: task.id, state: 'briefing' });
    this.message(flow, 'user', root.id, 'task', task.prompt);
    this.deliver(flow, root.id, rootTaskMessage(task.id, task.prompt, root, flow.cats));
  }

  /** Server shutdown: stop every turn. The task board marks the tasks interrupted. */
  dispose(): void {
    for (const flow of this.flows.values()) {
      flow.ended = true;
      for (const m of flow.members.values()) m.handle?.kill();
    }
    this.flows.clear();
    this.tokens.clear();
  }

  // ── Office MCP ──

  knowsToken(token: string): boolean {
    return this.tokens.has(token);
  }

  callTool(token: string, name: string, args: Record<string, unknown>): OfficeToolResult {
    const entry = this.tokens.get(token);
    if (!entry || entry.flow.ended) return { text: 'This task has ended.', isError: true };
    const result = callOfficeTool(this, entry.flow, entry.catId, name, args);
    this.save(entry.flow);
    return result;
  }

  // ── FlowContext ──

  deliver(flow: Flow, to: string, text: string): Member {
    const member = flow.members.get(to) ?? this.join(flow, to);
    member.inbox.push(text);
    this.schedule(flow, member);
    return member;
  }

  message(flow: Flow, from: string, to: string, kind: CatMessageKind, text: string): void {
    this.opts.emit({ type: 'catMessage', taskId: flow.task.id, from, to, kind, text });
    this.log(flow, { kind: 'message', name: `${from} -> ${to} (${kind})`, text });
    const sender = flow.members.get(from)?.agentId;
    if (sender !== undefined) {
      const name = (catId: string) => flow.cats.find((c) => c.id === catId)?.name ?? catId;
      const narrated = kind === 'final' ? 'result' : 'message';
      this.opts.narrate?.({
        catId: sender,
        ts: Date.now(),
        kind: narrated,
        from: name(from),
        to: name(to),
        text,
      });
    }
  }

  setState(flow: Flow, state: FlowState): void {
    if (flow.task.flow.state === state) return;
    flow.task.flow.state = state;
    this.opts.emit({ type: 'flowStateChanged', taskId: flow.task.id, state });
    this.save(flow);
  }

  // ── Internals shared with flowTurns.ts ──

  log(flow: Flow, entry: TaskLogEntry) {
    const text =
      entry.text.length > TASK_LOG_TEXT_MAX_CHARS
        ? `${entry.text.slice(0, TASK_LOG_TEXT_MAX_CHARS)}...`
        : entry.text;
    const log = flow.task.log;
    log.push({ ...entry, text });
    if (log.length > TASK_LOG_MAX_ENTRIES) log.splice(0, log.length - TASK_LOG_MAX_ENTRIES);
  }

  save(flow: Flow): void {
    this.sinks.get(flow.task.id)?.save(flow.task);
  }

  ensureCharacter(flow: Flow, member: Member): void {
    if (member.agentId !== undefined || !member.cwd) return;
    const previous = this.lastAgentByCat.get(member.cat.id);
    if (previous !== undefined) {
      this.lastAgentByCat.delete(member.cat.id);
      this.opts.host.removeAgent(previous);
    }
    // The office character shows the breed preset; custom coats are drawn by the Cats menu art.
    const palette = CAT_BREED_IDS.indexOf(member.cat.appearance.breed as never);
    const agent = this.opts.host.launchHeadlessAgent(
      member.sessionId,
      member.cwd,
      palette >= 0 ? { palette, hueShift: 0 } : undefined,
    );
    member.agentId = agent.id;
    if (member.cat.id === flow.rootId) {
      Object.assign(flow.task, {
        agentId: agent.id,
        palette: agent.palette,
        hueShift: agent.hueShift,
      });
    }
  }

  /** End a flow: stop its turns, finalize worktrees, release the characters. */
  async endFlow(flow: Flow, ok: boolean, text: string, caller?: Member): Promise<void> {
    if (flow.ended) return;
    flow.ended = true;
    const { task } = flow;
    if (ok) this.setState(flow, 'merging');
    const running = [...flow.members.values()].flatMap((m) => (m.handle ? [m.handle] : []));
    for (const handle of running) handle.kill();
    await Promise.all(running.map((h) => h.done));
    // Turns busy with git work (worktree, merge, commit) see `ended` and stop;
    // wait for them before the worktrees go away.
    await Promise.all(
      [...flow.members.values()].flatMap((m) => (m !== caller && m.busy ? [m.busy] : [])),
    );

    const worktreeError = await endFlowWorkspaces(flow);
    // Persona and MCP config files: the tokens in them die with the task.
    fs.rmSync(path.join(this.opts.stateDir, ORCHESTRATOR_DIR, task.id), {
      recursive: true,
      force: true,
    });
    if (ok) task.result = text;
    else task.error = text;
    if (worktreeError) task.error = task.error ? `${task.error}\n${worktreeError}` : worktreeError;
    task.status = ok && !worktreeError ? 'done' : 'error';
    task.numTurns = task.flow.turns;
    task.finishedAt = Date.now();
    flow.task.flow.state = task.status;
    this.opts.emit({ type: 'flowStateChanged', taskId: task.id, state: task.flow.state });

    for (const m of flow.members.values()) {
      this.tokens.delete(m.token);
      if (m.agentId === undefined) continue;
      this.opts.host.finishHeadlessAgent(m.agentId, task.id);
      this.lastAgentByCat.set(m.cat.id, m.agentId);
    }
    this.flows.delete(task.id);
    const sink = this.sinks.get(task.id);
    this.sinks.delete(task.id);
    sink?.ended(task);
    console.log(`[Pixel Agents] Team task ${task.id} ${task.status}`);
  }

  /** Queue a turn for a cat that has something to read, unless one is queued. */
  schedule(flow: Flow, member: Member): void {
    if (flow.ended || member.scheduled) return;
    if (member.retryAt !== undefined && Date.now() < member.retryAt) return;
    member.retryAt = undefined;
    if (member.inbox.length === 0 && member.pendingMerges.length === 0) return;
    member.scheduled = true;
    void this.scheduler
      .run(member.cat.id, () => this.turn(flow, member))
      .catch((err: unknown) => {
        const text = `${catLabel(member.cat)}: ${err instanceof Error ? err.message : String(err)}`;
        return this.endFlow(flow, false, text);
      })
      .finally(() => {
        member.scheduled = false;
        this.schedule(flow, member);
      });
  }

  private async turn(flow: Flow, member: Member): Promise<void> {
    if (flow.ended) return;
    if (++flow.task.flow.turns > FLOW_MAX_TURNS) {
      return this.endFlow(
        flow,
        false,
        `Stopped: the team used more than ${FLOW_MAX_TURNS} turns.`,
        member,
      );
    }
    const busy = (async () => {
      await prepareWorkspace(flow, member, this.opts.stateDir);
      await runTurnFor(this, flow, member);
    })();
    member.busy = busy.catch(() => {});
    try {
      await busy;
    } finally {
      member.busy = undefined;
    }
  }

  private join(flow: Flow, catId: string): Member {
    const cat = flow.cats.find((c) => c.id === catId);
    if (!cat) throw new Error(`Unknown cat ${catId}`);
    const adapter = this.adapterFor(cat);
    if (!adapter) throw new Error(`Engine ${cat.engine} has no adapter`);
    const dir = path.join(this.opts.stateDir, ORCHESTRATOR_DIR, flow.task.id);
    fs.mkdirSync(dir, { recursive: true });
    const token = crypto.randomBytes(24).toString('hex');
    const member: Member = {
      cat,
      sessionId: crypto.randomUUID(),
      token,
      systemPromptFile: path.join(dir, `${catId}.md`),
      mcpConfigFile: path.join(dir, `${catId}.mcp.json`),
      started: false,
      inbox: [],
      scheduled: false,
      sessionCostUsd: 0,
      pendingMerges: [],
      askedBy: new Set(),
      waitingOn: new Set(),
      unreadReports: 0,
      nudged: false,
    };
    fs.writeFileSync(member.systemPromptFile, personaText(cat), { mode: 0o600 });
    const mcp = adapter.mcpConfig({ url: this.mcpUrl, token });
    fs.writeFileSync(member.mcpConfigFile, mcp, { mode: 0o600 });
    flow.members.set(catId, member);
    this.tokens.set(token, { flow, catId });
    return member;
  }
}
