/**
 * The onboarding help chat: one Claude Code turn per user message, with read-only tools and the
 * built-in guide persona. It runs through the same engine adapter as every cat. State lives in
 * memory: the chat is for the first walk-through, so there is no history file.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { EngineStatus } from '../../../core/src/messages.js';
import { DeskStream } from '../ceoDesk/deskStream.js';
import type { EngineAdapter, TurnHandle } from '../orchestrator/engineAdapter.js';
import { actionableMessage, isAuthError } from '../orchestrator/engineStatus.js';
import { HELP_DISALLOWED_TOOLS, type HelpContext, helpPersona } from './helpPrompt.js';

export const HELP_MODEL = 'sonnet';
const HELP_DIR_NAME = 'catavasia-help';
const EMPTY_MCP_CONFIG = JSON.stringify({ mcpServers: {} });

const REPLACED_TEXT = 'Another window asked a new question. Ask again.';
const NOT_INSTALLED = { installed: false } as EngineStatus;
const NOT_LOGGED_IN = { installed: true, loggedIn: false } as EngineStatus;

// A type alias, not an interface: it must fit the transports' Record<string, unknown> sender.
export type HelpEvent = {
  event: 'draft' | 'reply' | 'error' | 'unavailable';
  text: string;
};
export type HelpSend = (message: { type: 'helpChatEvent' } & HelpEvent) => void;

export interface HelpChatMessage {
  text: string;
  context?: string;
  language?: string;
}

export class HelpDesk {
  private sessionId = crypto.randomUUID();
  private started = false;
  private turn: TurnHandle | undefined;
  /** Sender of the running turn: a replaced turn tells its own client, which waits for an answer. */
  private turnEmit: ((e: HelpEvent) => void) | undefined;

  constructor(
    private readonly adapter: EngineAdapter,
    private readonly dir = path.join(os.tmpdir(), HELP_DIR_NAME),
  ) {}

  /** Why the chat cannot run now (Claude Code missing); undefined: it can. */
  unavailable(): string | undefined {
    if (!this.adapter.choices().unavailable) return undefined;
    return actionableMessage('claude', NOT_INSTALLED);
  }

  /** Start a turn for the user's message. A running turn ends first. */
  send(msg: HelpChatMessage, send: HelpSend): void {
    const emit = (e: HelpEvent) => send({ type: 'helpChatEvent', ...e });
    const down = this.unavailable();
    if (down) return emit({ event: 'unavailable', text: down });
    const text = msg.text.trim();
    if (!text) return;
    if (this.turn) this.turnEmit?.({ event: 'error', text: REPLACED_TEXT });
    this.stop();
    const context: HelpContext = msg.context === 'settings' ? 'settings' : 'onboarding';
    fs.mkdirSync(this.dir, { recursive: true });
    const systemPromptFile = path.join(this.dir, `persona-${context}.md`);
    fs.writeFileSync(systemPromptFile, helpPersona(context));
    const mcpConfigFile = path.join(this.dir, 'mcp.json');
    fs.writeFileSync(mcpConfigFile, EMPTY_MCP_CONFIG);
    // Reuse the CEO desk stream reader for the live reply text; the rows themselves are dropped.
    const stream = new DeskStream({
      add: (row) => ({ ...row, at: Date.now() }),
      update: () => undefined,
      saveImages: () => [],
      context: () => undefined,
      draft: (draft) => emit({ event: 'draft', text: draft }),
      status: () => undefined,
      folders: [],
    });
    const hint = msg.language ? `[UI language: ${msg.language}]\n` : '';
    const turn = this.adapter.spawnTurn({
      sessionId: this.sessionId,
      resume: this.started,
      cwd: this.dir,
      model: HELP_MODEL,
      systemPromptFile,
      mcpConfigFile,
      permissionMode: 'readOnly',
      disallowedTools: HELP_DISALLOWED_TOOLS,
      partialText: true,
      onLine: (line) => stream.line(line),
      message: this.started ? text : `${hint}${text}`,
    });
    this.turn = turn;
    this.turnEmit = emit;
    void turn.done.then((outcome) => {
      if (this.turn !== turn) return; // stopped or replaced: stay silent
      this.turn = undefined;
      if (outcome.sessionStarted) this.started = true;
      if (outcome.ok && outcome.text) return emit({ event: 'reply', text: outcome.text });
      const error = outcome.error ?? 'No answer';
      if (isAuthError(error)) {
        return emit({ event: 'unavailable', text: actionableMessage('claude', NOT_LOGGED_IN) });
      }
      emit({ event: 'error', text: error });
    });
  }

  /** End the running turn without an answer (the panel closed). */
  stop(): void {
    const turn = this.turn;
    this.turn = undefined;
    turn?.kill();
  }

  /** Stop and forget the conversation. */
  reset(): void {
    this.stop();
    this.sessionId = crypto.randomUUID();
    this.started = false;
  }
}

/** Handle one help chat client message. Returns true when it was a help chat message. */
export function handleHelpMessage(
  desk: HelpDesk,
  msg: Record<string, unknown>,
  send: HelpSend,
): boolean {
  switch (msg.type) {
    case 'helpChatSend':
      if (typeof msg.text === 'string') {
        desk.send(
          {
            text: msg.text,
            context: typeof msg.context === 'string' ? msg.context : undefined,
            language: typeof msg.language === 'string' ? msg.language : undefined,
          },
          send,
        );
      }
      return true;
    case 'helpChatStop':
      desk.stop();
      return true;
    case 'helpChatReset':
      desk.reset();
      return true;
    default:
      return false;
  }
}
