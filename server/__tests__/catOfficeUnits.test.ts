import Fastify from 'fastify';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { CatProfile } from '../../core/src/messages.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import { applyShowGuests, filterGuestMessage } from '../src/guests.js';
import { CatStore, type EngineCatalog, validateProfile } from '../src/orchestrator/catProfiles.js';
import { parseClaudeHelp } from '../src/orchestrator/claudeAdapter.js';
import { registerOfficeMcpRoute } from '../src/orchestrator/officeMcp.js';
import {
  callOfficeTool,
  type Flow,
  type FlowContext,
  type Member,
} from '../src/orchestrator/officeTools.js';
import { TurnScheduler } from '../src/orchestrator/turnScheduler.js';
import type { AgentState } from '../src/types.js';

/** Lines copied from `claude --help` of Claude Code 2.1.290. */
const HELP = `  --effort <level>                      Effort level for the current session
                                        (low, medium, high, xhigh, max)
  --environment <environment_id>        Create a new cloud session
  --model <model>                       Model for the current session. Provide
                                        an alias for the latest model (e.g.
                                        'fable', 'opus', or 'sonnet') or a
                                        model's full name.
  -n, --name <name>                     Set a display name
`;
const CATALOG: EngineCatalog = { claude: parseClaudeHelp(HELP) };

const profile = (over: Partial<CatProfile> = {}): Record<string, unknown> => ({
  id: 'murka',
  name: ' Murka ',
  role: 'Developer',
  systemPrompt: 'Be kind.',
  engine: 'claude',
  model: 'sonnet',
  appearance: { breed: 1 },
  ...over,
});

let tmp: string;
beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pa-cats-')));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('engine choices', () => {
  it('reads model aliases and effort levels from claude --help', () => {
    expect(CATALOG.claude?.models).toEqual(['fable', 'opus', 'sonnet']);
    expect(CATALOG.claude?.efforts).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
  });
});

describe('profile validation', () => {
  it('normalizes a valid profile and drops unknown fields', () => {
    const result = validateProfile({ ...profile(), extra: 1, effort: 'high' }, CATALOG);
    expect(result).toEqual({
      ok: true,
      profile: { ...profile(), name: 'Murka', effort: 'high' },
    });
  });

  it.each([
    [{ id: 'Bad Id' }, 'id must match'],
    [{ engine: 'gpt' }, 'engine must be one of'],
    [{ engine: 'codex' }, 'engine codex is not available yet'],
    [{ model: 'gpt-5' }, 'model gpt-5 is not accepted'],
    [{ effort: 'turbo' }, 'effort must be one of'],
    [{ name: '  ' }, 'name is empty'],
    [{ parentId: 'murka' }, 'own parent'],
    [{ appearance: {} }, 'appearance needs a breed'],
    [{ appearance: { breed: 99 } }, 'appearance.breed'],
    [{ appearance: { pattern: 'tabby', fur: 'red' } }, 'appearance.fur must be #rrggbb'],
  ])('rejects %j', (over, error) => {
    const result = validateProfile(profile(over as Partial<CatProfile>), CATALOG);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain(error);
  });

  it('accepts a full model name and a custom coat', () => {
    /* eslint-disable pixel-agents/no-inline-colors -- coat colours are the data under test */
    const custom = { pattern: 'calico', fur: '#AABBCC', eyes: '#00ff00' };
    const result = validateProfile(
      profile({ model: 'claude-haiku-4-5-20251001', appearance: custom as never }),
      CATALOG,
    );
    expect(result.ok && result.profile.appearance).toEqual({ ...custom, fur: '#aabbcc' });
    /* eslint-enable pixel-agents/no-inline-colors */
  });
});

describe('CatStore', () => {
  const file = () => path.join(tmp, 'cats.json');

  it('seeds a default team (Opus boss, three Sonnet workers) when the file is missing', () => {
    const store = new CatStore(file(), () => CATALOG);
    const cats = store.list();
    expect(cats.map((c) => [c.id, c.model, c.parentId])).toEqual([
      ['boss', 'opus', undefined],
      ['murka', 'sonnet', 'boss'],
      ['pushok', 'sonnet', 'boss'],
      ['ryzhik', 'sonnet', 'boss'],
    ]);
    for (const cat of cats) expect(validateProfile(cat, CATALOG).ok).toBe(true);
    expect(JSON.parse(fs.readFileSync(file(), 'utf-8')).version).toBe(1);
  });

  it('refuses a cycle and a missing parent, and reparents on delete', () => {
    const store = new CatStore(file(), () => CATALOG);
    expect(store.save(profile({ id: 'kitten', parentId: 'murka' })).ok).toBe(true);
    const cycle = store.save({ ...store.get('boss'), parentId: 'kitten' });
    expect(!cycle.ok && cycle.error).toContain('cycle');
    const orphan = store.save(profile({ id: 'x', parentId: 'ghost' }));
    expect(!orphan.ok && orphan.error).toContain('does not exist');
    expect(store.remove('murka')).toBeUndefined();
    expect(store.get('kitten')?.parentId).toBe('boss');
    expect(new CatStore(file(), () => CATALOG).get('kitten')?.parentId).toBe('boss');
  });

  it('keeps a copy of an unreadable file and starts from the default team', () => {
    fs.writeFileSync(file(), '{nope');
    const store = new CatStore(file(), () => CATALOG);
    expect(store.list()).toHaveLength(4);
    expect(fs.readdirSync(tmp).some((f) => f.startsWith('cats.json.bad-'))).toBe(true);
  });
});

describe('TurnScheduler', () => {
  it('caps running turns, keeps FIFO order, and never runs one cat twice at once', async () => {
    const states: string[] = [];
    const scheduler = new TurnScheduler(2, (s) => states.push(`${s.running}|${s.queued}`));
    const release: Record<string, () => void> = {};
    const started: string[] = [];
    const job = (name: string) => () =>
      new Promise<void>((resolve) => {
        started.push(name);
        release[name] = resolve;
      });
    const done = [
      scheduler.run('a', job('a1')),
      scheduler.run('a', job('a2')),
      scheduler.run('b', job('b1')),
      scheduler.run('c', job('c1')),
    ];
    await new Promise((r) => setTimeout(r, 10));
    expect(started).toEqual(['a1', 'b1']);
    expect(scheduler.state()).toEqual({ running: ['a', 'b'], queued: ['a', 'c'], cap: 2 });
    release.b1();
    await new Promise((r) => setTimeout(r, 10));
    expect(started).toEqual(['a1', 'b1', 'c1']); // a2 waits for a1: the per-cat lock
    release.a1();
    await new Promise((r) => setTimeout(r, 10));
    expect(started).toEqual(['a1', 'b1', 'c1', 'a2']);
    release.a2();
    release.c1();
    await Promise.all(done);
    expect(scheduler.state()).toEqual({ running: [], queued: [], cap: 2 });
    expect(states.length).toBeGreaterThan(0);
  });
});

describe('office MCP protocol', () => {
  it('answers initialize, tools/list and tools/call; notifications get 202', async () => {
    const app = Fastify();
    const calls: unknown[] = [];
    registerOfficeMcpRoute(app, {
      knowsToken: (t) => t === 'cat-token',
      callTool: (token, name, args) => {
        calls.push({ token, name, args });
        return { text: 'done', isError: name === 'bad' };
      },
    });
    const post = (payload: unknown) =>
      app.inject({
        method: 'POST',
        url: '/mcp',
        headers: { authorization: 'Bearer cat-token' },
        payload: payload as object,
      });
    const init = await post({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26' },
    });
    expect(init.json().result.protocolVersion).toBe('2025-03-26');
    expect(init.json().result.capabilities.tools).toBeDefined();
    expect((await post({ jsonrpc: '2.0', method: 'notifications/initialized' })).statusCode).toBe(
      202,
    );
    const list = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(list.json().result.tools.map((t: { name: string }) => t.name)).toEqual([
      'brief',
      'delegate',
      'ask',
      'reply',
      'report',
      'list_team',
    ]);
    const call = await post({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'bad', arguments: { a: 1 } },
    });
    expect(call.json().result).toEqual({
      content: [{ type: 'text', text: 'done' }],
      isError: true,
    });
    expect(calls).toEqual([{ token: 'cat-token', name: 'bad', args: { a: 1 } }]);
    expect((await app.inject({ method: 'GET', url: '/mcp' })).statusCode).toBe(405);
    await app.close();
  });
});

describe('office tools: hierarchy', () => {
  // boss -> mid -> deep, boss -> w1
  const cats = [
    profile({ id: 'boss', name: 'Boss' }),
    profile({ id: 'mid', name: 'Mid', parentId: 'boss' }),
    profile({ id: 'w1', name: 'W1', parentId: 'boss' }),
    profile({ id: 'deep', name: 'Deep', parentId: 'mid' }),
  ] as unknown as CatProfile[];
  const member = (cat: CatProfile) =>
    ({
      cat,
      inbox: [],
      askedBy: new Set(),
      waitingOn: new Set(),
      pendingMerges: [],
    }) as unknown as Member;
  let flow: Flow;
  let delivered: Array<[string, string]>;
  let ctx: FlowContext;
  const call = (from: string, name: string, args: Record<string, unknown> = {}) =>
    callOfficeTool(ctx, flow, from, name, args);

  beforeEach(() => {
    delivered = [];
    flow = {
      task: { id: 't1', flow: { root: 'boss', state: 'briefing', nodes: [], turns: 0 } },
      cats,
      rootId: 'boss',
      members: new Map(cats.map((c) => [c.id, member(c)])),
      repo: null,
      ended: false,
    } as unknown as Flow;
    ctx = {
      deliver: (f, to, text) => {
        delivered.push([to, text]);
        return f.members.get(to)!;
      },
      message: () => {},
      setState: (f, state) => {
        f.task.flow.state = state;
      },
    };
  });

  it('delegates only to direct reports', () => {
    expect(call('w1', 'delegate', { to: 'deep', task: 'x' })).toMatchObject({ isError: true });
    expect(call('boss', 'delegate', { to: 'deep', task: 'x' }).text).toContain(
      'not your direct report',
    );
    expect(call('boss', 'delegate', { to: 'mid', task: 'build' }).isError).toBeUndefined();
    expect(flow.task.flow.nodes).toEqual([
      { cat: 'mid', from: 'boss', goal: 'build', status: 'working', branch: undefined },
    ]);
    expect(flow.task.flow.state).toBe('working');
    expect(delivered[0][0]).toBe('mid');
    expect(call('boss', 'delegate', { to: 'mid', task: 'again' }).text).toContain('still works');
  });

  it('lets ask and reply go up, down and to siblings only', () => {
    expect(call('deep', 'ask', { to: 'w1', question: 'q' })).toMatchObject({ isError: true });
    expect(call('boss', 'ask', { to: 'deep', question: 'q' })).toMatchObject({ isError: true });
    expect(call('deep', 'ask', { to: 'mid', question: 'q' }).isError).toBeUndefined();
    expect(call('w1', 'ask', { to: 'mid', question: 'q' }).isError).toBeUndefined();
    expect(flow.members.get('mid')!.askedBy).toEqual(new Set(['deep', 'w1']));
    expect(call('mid', 'reply', { to: 'w1', answer: 'a' }).isError).toBeUndefined();
    expect(flow.members.get('mid')!.askedBy).toEqual(new Set(['deep']));
    expect(flow.members.get('w1')!.waitingOn.size).toBe(0);
  });

  it('reports only on a delegated task; the root reports last; only the root briefs', () => {
    expect(call('w1', 'report', { result: 'r' }).text).toContain('Nobody gave you a task');
    expect(call('w1', 'brief', { plan: 'p' })).toMatchObject({ isError: true });
    expect(call('boss', 'brief', { plan: 'p' }).isError).toBeUndefined();
    call('boss', 'delegate', { to: 'mid', task: 'build' });
    expect(call('mid', 'report', { result: 'built' }).isError).toBeUndefined();
    expect(flow.members.get('mid')!.outgoingReport).toBe('built');
    expect(call('boss', 'report', { result: 'r' }).text).toContain('Wait: mid');
    flow.task.flow.nodes[0].status = 'reported';
    expect(call('boss', 'report', { result: 'final' }).isError).toBeUndefined();
    expect(flow.members.get('boss')!.final).toBe('final');
  });

  it('rejects unknown cats, tools and empty arguments', () => {
    expect(call('boss', 'delegate', { to: 'ghost', task: 'x' }).text).toContain('no cat with id');
    expect(call('boss', 'fly')).toMatchObject({ isError: true });
    expect(call('boss', 'delegate', { to: 'mid' }).text).toContain('"task" is required');
    expect(call('w1', 'list_team').text).toContain('Your lead Boss');
  });
});

describe('guests', () => {
  const agent = (isExternal: boolean) =>
    ({
      isExternal,
      activeToolStatuses: new Map([['t1', 'Reading']]),
      activeToolNames: new Map([['t1', 'Read']]),
      backgroundAgentToolIds: new Set(),
      isWaiting: false,
    }) as unknown as AgentState;

  it('hides guests by default and shows them when showGuests is on', () => {
    const store = new AgentStateStore();
    store.set(1, agent(false));
    store.set(2, agent(true));
    const show = { current: false };
    expect(filterGuestMessage({ type: 'agentCreated', id: 2 }, store, show)).toBeNull();
    expect(filterGuestMessage({ type: 'agentStatus', id: 1 }, store, show)).not.toBeNull();
    expect(filterGuestMessage({ type: 'agentClosed', id: 2 }, store, show)).not.toBeNull();
    const existing = filterGuestMessage(
      {
        type: 'existingAgents',
        agents: [1, 2],
        agentMeta: { 1: {}, 2: {} },
        folderNames: {},
        externalAgents: { 2: true },
      },
      store,
      show,
    );
    expect(existing).toMatchObject({ agents: [1], agentMeta: { 1: {} }, externalAgents: {} });

    const added: number[] = [];
    const sent: Array<Record<string, unknown>> = [];
    store.on('agentAdded', (id) => added.push(id));
    store.on('broadcast', (m) => sent.push(m));
    applyShowGuests(store, show, true);
    expect(show.current).toBe(true);
    expect(added).toEqual([2]);
    expect(sent).toEqual([
      { type: 'agentToolStart', id: 2, toolId: 't1', status: 'Reading', toolName: 'Read' },
    ]);
    expect(filterGuestMessage({ type: 'agentCreated', id: 2 }, store, show)).not.toBeNull();
    sent.length = 0;
    applyShowGuests(store, show, false);
    expect(sent).toEqual([{ type: 'agentClosed', id: 2 }]);
  });
});
