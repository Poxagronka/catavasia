import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleHelpMessage, HelpDesk, type HelpSend } from '../src/helpDesk/helpDesk.js';
import { HELP_DISALLOWED_TOOLS, helpPersona } from '../src/helpDesk/helpPrompt.js';
import { claudeTurnOptions } from '../src/orchestrator/claudeAdapter.js';
import type { EngineAdapter, TurnOutcome, TurnRequest } from '../src/orchestrator/engineAdapter.js';

function mockAdapter(unavailable?: string) {
  const requests: TurnRequest[] = [];
  const kills: number[] = [];
  let finish: (o: TurnOutcome) => void = () => undefined;
  const adapter = {
    engine: 'claude',
    choices: () => ({ models: [], efforts: [], fullModelPattern: /x/, unavailable }),
    mcpConfig: () => '{}',
    interactiveResumeCommand: () => ({ command: 'claude', args: [] }),
    spawnTurn: (req: TurnRequest) => {
      requests.push(req);
      const done = new Promise<TurnOutcome>((resolve) => {
        finish = resolve;
      });
      return { done, kill: () => kills.push(1) };
    },
  } as unknown as EngineAdapter;
  return { adapter, requests, kills, finish: (o: TurnOutcome) => finish(o) };
}

describe('HelpDesk', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'help-test-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('runs a read-only turn with the guide persona and sends the reply', async () => {
    const m = mockAdapter();
    const sent: Array<Parameters<HelpSend>[0]> = [];
    const desk = new HelpDesk(m.adapter, dir);
    desk.send({ text: 'Hola', context: 'onboarding', language: 'es' }, (e) => sent.push(e));
    const req = m.requests[0];
    expect(req.permissionMode).toBe('readOnly');
    expect(req.disallowedTools).toEqual(HELP_DISALLOWED_TOOLS);
    expect(req.message).toContain('Hola');
    expect(fs.readFileSync(req.systemPromptFile, 'utf-8')).toContain('Catavasia product guide');
    m.finish({ ok: true, text: 'Hi', sessionStarted: true });
    await vi.waitFor(() =>
      expect(sent).toEqual([{ type: 'helpChatEvent', event: 'reply', text: 'Hi' }]),
    );
    desk.send({ text: 'More' }, () => undefined);
    expect(m.requests[1].resume).toBe(true);
    expect(m.requests[1].sessionId).toBe(req.sessionId);
  });

  it('says Claude Code is missing without starting a turn', () => {
    const m = mockAdapter('Claude Code CLI not found');
    const sent: Array<Parameters<HelpSend>[0]> = [];
    new HelpDesk(m.adapter, dir).send({ text: 'hi' }, (e) => sent.push(e));
    expect(m.requests).toHaveLength(0);
    expect(sent[0].event).toBe('unavailable');
    expect(sent[0].text).toContain('not installed');
  });

  it('stop kills the turn and stays silent', async () => {
    const m = mockAdapter();
    const sent: unknown[] = [];
    const desk = new HelpDesk(m.adapter, dir);
    desk.send({ text: 'hi' }, (e) => sent.push(e));
    expect(handleHelpMessage(desk, { type: 'helpChatStop' }, () => undefined)).toBe(true);
    expect(m.kills).toHaveLength(1);
    m.finish({ ok: true, text: 'late', sessionStarted: true });
    await Promise.resolve();
    expect(sent).toHaveLength(0);
  });

  it('turns a login error into an unavailable notice', async () => {
    const m = mockAdapter();
    const sent: Array<Parameters<HelpSend>[0]> = [];
    new HelpDesk(m.adapter, dir).send({ text: 'hi' }, (e) => sent.push(e));
    m.finish({ ok: false, error: 'Not logged in', sessionStarted: false });
    await vi.waitFor(() => expect(sent[0]?.event).toBe('unavailable'));
  });

  it('ignores other messages', () => {
    const desk = new HelpDesk(mockAdapter().adapter, dir);
    expect(handleHelpMessage(desk, { type: 'setLanguage' }, () => undefined)).toBe(false);
  });
});

describe('help persona and engine options', () => {
  it('tells the guide to answer in the user language and stay read-only', () => {
    const text = helpPersona('settings');
    expect(text).toContain("language of the user's latest message");
    expect(text).toContain('read-only');
    expect(text).toContain('opened this chat later');
  });

  it('passes disallowedTools to the Agent SDK options', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'help-opts-'));
    const mcp = path.join(dir, 'mcp.json');
    const persona = path.join(dir, 'p.md');
    fs.writeFileSync(mcp, '{"mcpServers":{}}');
    fs.writeFileSync(persona, 'x');
    const options = claudeTurnOptions(
      {
        sessionId: 's',
        resume: false,
        cwd: dir,
        model: 'sonnet',
        systemPromptFile: persona,
        mcpConfigFile: mcp,
        permissionMode: 'readOnly',
        disallowedTools: HELP_DISALLOWED_TOOLS,
      },
      'claude',
    );
    expect(options.disallowedTools).toEqual(['Edit', 'Write', 'NotebookEdit', 'Bash']);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
