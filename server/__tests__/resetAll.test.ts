/**
 * Settings "Reset everything" (resetAllToDefault) and the one-time rename of
 * the old Russian default cat names. Runs in a temp HOME.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { EDIT_RIGHTS_HINT } from '../../core/src/constants.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import { handleClientMessage } from '../src/clientMessageHandler.js';
import { Orchestrator } from '../src/orchestrator/orchestrator.js';
import { FakeCatHost } from './catOfficeHarness.js';

const DEFAULT_LAYOUT = { version: 1, cols: 2, rows: 2, tiles: [1, 1, 1, 1] };
const OLD = {
  cats: JSON.stringify({
    version: 1,
    cats: [
      cat('boss', 'Barsik', null, 'Team lead'),
      cat('dev', 'Smokey', 'boss', 'Developer'),
      cat('murka', 'Kitty', 'boss', 'Developer'),
    ],
    catCeo: { enabled: false },
  }),
  layout: JSON.stringify({ version: 1, cols: 9, rows: 9, tiles: [] }),
  pets: JSON.stringify({ savedAt: 1, needs: {} }),
  tasks: JSON.stringify({ version: 1, tasks: [] }),
};

let home: string;
let stateDir: string;
let originalHome: string | undefined;

function cat(id: string, name: string, parentId: string | null, role: string) {
  return {
    id,
    name,
    role,
    systemPrompt: `I am ${name}.`,
    engine: 'claude',
    model: 'sonnet',
    effort: 'medium',
    appearance: {},
    parentId,
  };
}

const file = (name: string) => path.join(stateDir, name);
const readJson = (name: string) => JSON.parse(fs.readFileSync(file(name), 'utf-8'));
const office = () =>
  new Orchestrator({
    host: new FakeCatHost(),
    stateDir,
    adapters: [],
    emit: () => {},
    turnConcurrency: 2,
  });

function reset(orchestrator: Orchestrator | undefined, privileged: boolean) {
  const store = new AgentStateStore();
  const sent: Array<Record<string, unknown>> = [];
  const broadcast: Array<Record<string, unknown>> = [];
  store.on('broadcast', (m) => broadcast.push(m));
  handleClientMessage({ type: 'resetAllToDefault' }, (m) => sent.push(m), {
    store,
    cache: { defaultLayout: DEFAULT_LAYOUT } as never,
    orchestrator,
    privileged,
  });
  return { sent, broadcast };
}

beforeEach(() => {
  home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pa-reset-')));
  originalHome = process.env.HOME;
  process.env.HOME = home;
  stateDir = path.join(home, '.pixel-agents');
  fs.mkdirSync(stateDir);
  fs.writeFileSync(file('cats.json'), OLD.cats);
  fs.writeFileSync(file('layout.json'), OLD.layout);
  fs.writeFileSync(file('pets-state.json'), OLD.pets);
  fs.writeFileSync(file('tasks.json'), OLD.tasks);
});

afterEach(() => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  fs.rmSync(home, { recursive: true, force: true });
});

describe('old default names', () => {
  it('a default cat with its old Russian name gets the English one, a renamed cat keeps its name', () => {
    const names = office()
      .cats.list()
      .map((c) => [c.id, c.name]);
    expect(names).toEqual([
      ['boss', 'Oliver'],
      ['dev', 'Smokey'],
      ['murka', 'Kitty'],
    ]);
    // Persisted: the next start reads the new name from cats.json.
    expect(readJson('cats.json').cats[0].name).toBe('Oliver');
  });
});

describe('resetAllToDefault', () => {
  it('backs up every file first, then resets cats, prompts, layout and pet care', () => {
    const o = office();
    const { sent, broadcast } = reset(o, true);

    const result = sent.at(-1)!;
    expect(result.type).toBe('resetAllResult');
    expect(result.error).toBeUndefined();
    const backupDir = String(result.backupDir);
    expect(path.dirname(backupDir)).toBe(path.join(stateDir, 'backups'));
    const backup = (name: string) => fs.readFileSync(path.join(backupDir, name), 'utf-8');
    expect(JSON.parse(backup('cats.json')).cats[1].name).toBe('Smokey');
    expect(backup('layout.json')).toBe(OLD.layout);
    expect(backup('pets-state.json')).toBe(OLD.pets);
    expect(backup('tasks.json')).toBe(OLD.tasks);
    expect(backup('prompts/dev.md')).toContain('I am Smokey.');

    expect(readJson('cats.json').cats.map((c: { id: string }) => c.id)).toEqual([
      'boss',
      'murka',
      'pushok',
      'ryzhik',
    ]);
    expect(o.cats.list().map((c) => c.name)).toEqual(['Oliver', 'Luna', 'Milo', 'Pepper']);
    const prompts = path.join(stateDir, 'prompts');
    expect(
      fs
        .readdirSync(prompts)
        .filter((n) => n.endsWith('.md'))
        .sort(),
    ).toEqual(['boss.md', 'cat-ceo.md', 'murka.md', 'pushok.md', 'ryzhik.md']);
    const git = (...args: string[]) =>
      execFileSync('git', ['-C', prompts, ...args], { encoding: 'utf-8' }).trim();
    expect(git('log', '-1', '--format=%s')).toBe('user(all): reset to defaults');
    expect(git('status', '--porcelain')).toBe('');
    // The history before the reset is kept.
    expect(git('log', '--format=%s', '--', 'dev.md')).toContain('user(dev): import from cats.json');

    expect(readJson('layout.json')).toEqual(DEFAULT_LAYOUT);
    expect(fs.existsSync(file('pets-state.json'))).toBe(false);
    expect(readJson('tasks.json')).toEqual(JSON.parse(OLD.tasks));
    expect(broadcast).toEqual([
      { type: 'layoutLoaded', layout: DEFAULT_LAYOUT },
      { type: 'petCareLoaded', state: null },
    ]);
  });

  it('without a cat office it resets the layout and pet care (VS Code)', () => {
    const { sent } = reset(undefined, false);
    expect(sent.at(-1)!.backupDir).toBeDefined();
    expect(readJson('layout.json')).toEqual(DEFAULT_LAYOUT);
    expect(fs.existsSync(file('pets-state.json'))).toBe(false);
    expect(fs.readFileSync(file('cats.json'), 'utf-8')).toBe(OLD.cats);
  });

  it('refuses an untokened client and a busy office, and changes nothing', () => {
    const o = office();
    const before = fs.readFileSync(file('cats.json'), 'utf-8');
    expect(reset(o, false).sent).toEqual([{ type: 'resetAllResult', error: EDIT_RIGHTS_HINT }]);

    void o.scheduler.run('boss', () => new Promise(() => {}));
    const { sent, broadcast } = reset(o, true);
    expect(sent).toEqual([
      { type: 'resetAllResult', error: expect.stringContaining('Cats are working') },
    ]);
    expect(broadcast).toEqual([]);

    expect(fs.existsSync(path.join(stateDir, 'backups'))).toBe(false);
    expect(fs.readFileSync(file('cats.json'), 'utf-8')).toBe(before);
    expect(fs.readFileSync(file('layout.json'), 'utf-8')).toBe(OLD.layout);
    expect(fs.readFileSync(file('pets-state.json'), 'utf-8')).toBe(OLD.pets);
  });
});
