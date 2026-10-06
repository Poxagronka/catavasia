import Fastify from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';

import type { CatProfile } from '../../core/src/messages.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import { applyShowGuests, filterGuestMessage } from '../src/guests.js';
import {
  askMessage,
  chatLines,
  delegateMessage,
  NUDGE_REPORT,
  reportMessage,
  rootTaskMessage,
  TURN_PART_SEPARATOR,
} from '../src/orchestrator/flowPrompts.js';
import { wireFlow } from '../src/orchestrator/machine/helpers.js';
import { reduce, startTask } from '../src/orchestrator/machine/taskReducer.js';
import type { TaskState } from '../src/orchestrator/machine/types.js';
import { OFFICE_TOOLS, registerMcpRoute } from '../src/orchestrator/officeMcp.js';
import type { AgentState } from '../src/types.js';

const profile = (over: Partial<CatProfile>): CatProfile =>
  ({
    name: over.id,
    role: 'Developer',
    systemPrompt: '',
    engine: 'claude',
    model: 'sonnet',
    effort: 'medium',
    parentId: null,
    appearance: {},
    ...over,
  }) as CatProfile;

describe('office MCP protocol', () => {
  it('answers initialize, tools/list and tools/call; notifications get 202', async () => {
    const app = Fastify();
    const calls: unknown[] = [];
    registerMcpRoute(app, '/mcp', OFFICE_TOOLS, {
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
    const delegate = list.json().result.tools.find((t: { name: string }) => t.name === 'delegate');
    expect(delegate.inputSchema.properties.rework.type).toBe('boolean');
    expect(delegate.inputSchema.required).toEqual(['to', 'task']);
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

  it('serves a second tool set at its own path with its own tokens and an async handler', async () => {
    const app = Fastify();
    registerMcpRoute(app, '/mcp', OFFICE_TOOLS, {
      knowsToken: (t) => t === 'cat-token',
      callTool: () => ({ text: 'office' }),
    });
    const deskTools = [{ name: 'start_job', description: 'x', inputSchema: { type: 'object' } }];
    registerMcpRoute(app, '/api/ceo-mcp', deskTools, {
      knowsToken: (t) => t === 'ceo-token',
      callTool: async (_token, name) => ({ text: `desk ${name}` }),
    });
    const post = (url: string, token: string, payload: object) =>
      app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${token}` }, payload });
    const list = await post('/api/ceo-mcp', 'ceo-token', {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    });
    expect(list.json().result.tools).toEqual(deskTools);
    const call = await post('/api/ceo-mcp', 'ceo-token', {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'start_job', arguments: {} },
    });
    expect(call.json().result.content).toEqual([{ type: 'text', text: 'desk start_job' }]);
    expect(
      (await post('/api/ceo-mcp', 'cat-token', { jsonrpc: '2.0', id: 3, method: 'ping' }))
        .statusCode,
    ).toBe(401);
    expect(
      (await post('/mcp', 'ceo-token', { jsonrpc: '2.0', id: 4, method: 'ping' })).statusCode,
    ).toBe(401);
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
  ];
  let state: TaskState;
  const call = (from: string, name: string, args: Record<string, unknown> = {}) => {
    const step = reduce(state, { type: 'ToolCalled', catId: from, name, args });
    state = step.state;
    return step.reply!;
  };

  beforeEach(() => {
    state = startTask({
      type: 'TaskStarted',
      taskId: 't1',
      rootId: 'boss',
      prompt: 'p',
      cats,
      runnable: cats.map((c) => c.id),
      repo: null,
      catCeo: false,
      cwd: '/tmp',
    }).state;
  });

  it('delegates only to direct reports', () => {
    expect(call('w1', 'delegate', { to: 'deep', task: 'x' })).toMatchObject({ isError: true });
    expect(call('boss', 'delegate', { to: 'deep', task: 'x' }).text).toContain(
      'not your direct report',
    );
    expect(call('boss', 'delegate', { to: 'mid', task: 'build' }).isError).toBeUndefined();
    expect(wireFlow(state).nodes).toEqual([
      { cat: 'mid', from: 'boss', goal: 'build', status: 'working', branch: undefined },
    ]);
    expect(state.phase).toBe('working');
    expect(state.members.mid.inbox[0]).toContain('[Task from Boss (boss)]');
    expect(call('boss', 'delegate', { to: 'mid', task: 'again' }).text).toContain('still works');
  });

  it('lets ask and reply go up, down and to siblings only', () => {
    expect(call('deep', 'ask', { to: 'w1', question: 'q' })).toMatchObject({ isError: true });
    expect(call('boss', 'ask', { to: 'deep', question: 'q' })).toMatchObject({ isError: true });
    expect(call('deep', 'ask', { to: 'mid', question: 'q' }).isError).toBeUndefined();
    expect(call('w1', 'ask', { to: 'mid', question: 'q' }).isError).toBeUndefined();
    expect(state.members.mid.askedBy).toEqual(['deep', 'w1']);
    expect(call('mid', 'reply', { to: 'w1', answer: 'a' }).isError).toBeUndefined();
    expect(state.members.mid.askedBy).toEqual(['deep']);
    expect(state.members.w1.waitingOn).toEqual([]);
  });

  it('reports only on a delegated task; the root reports last; only the root briefs', () => {
    expect(call('w1', 'report', { result: 'r' }).text).toContain('Nobody gave you a task');
    expect(call('w1', 'brief', { plan: 'p' })).toMatchObject({ isError: true });
    expect(call('boss', 'brief', { plan: 'p' }).isError).toBeUndefined();
    call('boss', 'delegate', { to: 'mid', task: 'build' });
    expect(call('mid', 'report', { result: 'built' }).isError).toBeUndefined();
    expect(state.members.mid.outgoingReport).toBe('built');
    expect(call('boss', 'report', { result: 'r' }).text).toContain('Wait: mid');
    Object.assign(state.assignments[0], { state: 'reported', report: 'built' });
    expect(call('boss', 'report', { result: 'final' }).isError).toBeUndefined();
    expect(state.members.boss.final).toBe('final');
  });

  it('refuses a report while reports below are open or unread, and cats outside the team', () => {
    call('boss', 'delegate', { to: 'mid', task: 'build' });
    call('mid', 'delegate', { to: 'deep', task: 'part' });
    expect(call('mid', 'report', { result: 'r' }).text).toContain('Wait: deep');
    Object.assign(state.assignments[1], { state: 'reported', report: 'part done' });
    state.members.mid.unreadReports = 1;
    expect(call('mid', 'report', { result: 'r' }).text).toContain('next turn');
    state.members.mid.unreadReports = 0;
    expect(call('mid', 'report', { result: 'r' }).isError).toBeUndefined();
    // A task led by mid: its lead and siblings are outside the team.
    state.rootId = 'mid';
    expect(call('mid', 'ask', { to: 'boss', question: 'q' }).text).toContain('not in the team');
  });

  it('refuses a cat whose engine cannot run, and a rework with nothing to rework', () => {
    state.runnable = ['boss', 'mid', 'deep'];
    expect(call('boss', 'delegate', { to: 'w1', task: 'x' }).text).toContain('cannot run yet');
    expect(call('boss', 'delegate', { to: 'mid', task: 'x', rework: true }).text).toContain(
      'no report to rework',
    );
  });

  it('rejects unknown cats, tools and empty arguments', () => {
    expect(call('boss', 'delegate', { to: 'ghost', task: 'x' }).text).toContain('no cat with id');
    expect(call('boss', 'fly')).toMatchObject({ isError: true });
    expect(call('boss', 'delegate', { to: 'mid' }).text).toContain('"task" is required');
    expect(call('w1', 'list_team').text).toContain('Your lead Boss');
  });

  it('never lists a cat as its own report; a cat with no reports works itself', () => {
    const byId = (id: string) => cats.find((c) => c.id === id)!;
    const lead = rootTaskMessage('t1', 'p', byId('boss'), cats);
    expect(lead).toContain('- Mid (mid)');
    expect(lead).toContain('- W1 (w1)');
    expect(lead).not.toContain('- Boss (boss)');
    const solo = rootTaskMessage('t1', 'p', byId('w1'), cats);
    expect(solo).toContain('do the task yourself');
    expect(solo).not.toContain('delegate');
    expect(call('boss', 'delegate', { to: 'boss', task: 'x' }).text).toContain(
      'not your direct report',
    );
  });

  it('shows the chat only what the sender wrote', () => {
    const [boss, mid] = [cats[0], cats[1]];
    const turn = [
      rootTaskMessage('t1', 'привет\nsecond line', mid, cats),
      '[Message from the user]\nand one more',
      delegateMessage(boss, mid, 'fix it', cats, 'task/t1-mid', 'the plan', true),
      askMessage(mid, 'which file?'),
      reportMessage(mid, 'done', true),
      NUDGE_REPORT,
    ].join(TURN_PART_SEPARATOR);
    expect(chatLines(turn)).toEqual([
      'привет\nsecond line',
      'and one more',
      'Rework from Boss (boss):\nfix it',
      'Question from Mid (mid):\nwhich file?',
      'Failure report from Mid (mid):\ndone',
    ]);
  });

  it('answers every tool with "ended" after the task left the active states', () => {
    state.phase = 'done';
    expect(call('boss', 'list_team')).toEqual({ text: 'This task has ended.', isError: true });
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
