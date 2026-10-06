import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { CatProfile } from '../../core/src/messages.js';
import { FLOW_LOG_RETENTION_MS } from '../src/constants.js';
import {
  CAT_BREED_IDS,
  CatStore,
  type EngineCatalog,
  validateCat,
} from '../src/orchestrator/catProfiles.js';
import {
  claudeTurnEnv,
  parseClaudeHelp,
  parseCompactBoundary,
} from '../src/orchestrator/claudeAdapter.js';
import { pruneFlowLogs } from '../src/orchestrator/machine/eventLog.js';
import { PromptRepo } from '../src/orchestrator/promptRepo.js';
import { TurnScheduler } from '../src/orchestrator/turnScheduler.js';
import { commitAll, mergeBranch } from '../src/taskBoard/gitWorktree.js';

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
  effort: 'medium',
  parentId: null,
  appearance: { breed: 'smokey' },
  ...over,
});

let tmp: string;
beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pa-cats-')));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('claude turn process', () => {
  it('sets the 200K auto-compact window in the child env', () => {
    expect(claudeTurnEnv('/w')).toMatchObject({
      PWD: '/w',
      CLAUDE_CODE_AUTO_COMPACT_WINDOW: '200000',
    });
  });

  it('reads a compact_boundary line (CLI 2.1.290 shape)', () => {
    const line = JSON.stringify({
      type: 'system',
      subtype: 'compact_boundary',
      session_id: 's',
      compact_metadata: { trigger: 'auto', pre_tokens: 10809, post_tokens: 734 },
    });
    expect(parseCompactBoundary(line)).toEqual({
      trigger: 'auto',
      preTokens: 10809,
      postTokens: 734,
    });
    expect(parseCompactBoundary('{"type":"system","subtype":"init"}')).toBeUndefined();
    expect(parseCompactBoundary('compact_boundary but not json')).toBeUndefined();
  });
});

describe('flow log retention', () => {
  it('deletes task logs older than 30 days at server start', () => {
    const old = path.join(tmp, 'flows', 'old');
    const fresh = path.join(tmp, 'flows', 'fresh');
    fs.mkdirSync(old, { recursive: true });
    fs.mkdirSync(fresh, { recursive: true });
    const now = Date.now();
    const longAgo = new Date(now - FLOW_LOG_RETENTION_MS - 60_000);
    fs.utimesSync(old, longAgo, longAgo);
    pruneFlowLogs(tmp, now);
    expect(fs.readdirSync(path.join(tmp, 'flows'))).toEqual(['fresh']);
  });
});

describe('engine choices', () => {
  it('reads model aliases and effort levels from claude --help', () => {
    expect(CATALOG.claude?.models).toEqual(['fable', 'opus', 'sonnet']);
    expect(CATALOG.claude?.efforts).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
  });
});

describe('profile validation', () => {
  it('normalizes a valid cat and drops unknown fields', () => {
    const result = validateCat({ ...profile(), extra: 1, effort: 'high' }, CATALOG);
    expect(result).toEqual({ ok: true, value: { ...profile(), name: 'Murka', effort: 'high' } });
  });

  it.each([
    [{ id: 'Bad Id' }, 'id must match'],
    [{ engine: 'gpt' }, 'unknown engine'],
    [{ engine: 'codex' }, 'engine codex is not available yet'],
    [{ model: 'gpt-5' }, 'model "gpt-5" is not accepted'],
    [{ model: 'haiku' }, 'model "haiku" is not accepted'],
    [{ effort: 'turbo' }, 'effort must be one of'],
    [{ name: '  ' }, 'name is empty'],
    [{ parentId: 'murka' }, 'cannot report to itself'],
    [{ appearance: { breed: 'lion' } }, 'unknown breed "lion"'],
    [{ appearance: { pattern: 'plaid' } }, 'unknown pattern'],
    [{ appearance: { colors: { fur: 'red' } } }, 'colors.fur must be #rrggbb'],
    [{ appearance: { collar: 'blue' } }, 'collar must be #rrggbb'],
  ])('rejects %j', (over, error) => {
    const result = validateCat(profile(over as Partial<CatProfile>), CATALOG);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain(error);
  });

  it('accepts a full model name and a custom coat', () => {
    /* eslint-disable pixel-agents/no-inline-colors -- coat colours are the data under test */
    const look = { breed: 'tux', pattern: 'calico', colors: { fur: '#AABBCC' }, collar: 'none' };
    const result = validateCat(
      profile({ model: 'claude-haiku-4-5-20251001', appearance: look as never }),
      CATALOG,
    );
    expect(result.ok && result.value.appearance).toEqual({ ...look, colors: { fur: '#aabbcc' } });
    /* eslint-enable pixel-agents/no-inline-colors */
  });

  it('keeps breed ids in char_N order of scripts/cats/breeds.mjs', async () => {
    const { BREEDS } = (await import('../../scripts/cats/breeds.mjs')) as {
      BREEDS: Array<{ name: string }>;
    };
    expect([...CAT_BREED_IDS]).toEqual(BREEDS.map((b) => b.name.toLowerCase()));
  });
});

describe('CatStore', () => {
  const file = () => path.join(tmp, 'cats.json');
  const prompts = () => new PromptRepo(path.join(tmp, 'prompts'));
  const tree = (store: CatStore) => store.list().map((c) => [c.id, c.parentId]);

  it('seeds a default team (Opus boss, three Sonnet workers) when the file is missing', () => {
    const store = new CatStore(file(), () => CATALOG, prompts());
    const cats = store.list();
    expect(cats.map((c) => [c.id, c.model, c.effort, c.parentId])).toEqual([
      ['boss', 'opus', 'high', null],
      ['murka', 'sonnet', 'medium', 'boss'],
      ['pushok', 'sonnet', 'medium', 'boss'],
      ['ryzhik', 'sonnet', 'medium', 'boss'],
    ]);
    for (const cat of cats) expect(validateCat(cat, CATALOG).ok).toBe(true);
    const onDisk = JSON.parse(fs.readFileSync(file(), 'utf-8'));
    expect(onDisk.version).toBe(1);
  });

  it('keeps exactly one boss and refuses cycles and unknown parents', () => {
    const store = new CatStore(file(), () => CATALOG, prompts());
    expect(store.saveCat(profile({ id: 'kitten', parentId: 'murka' })).ok).toBe(true);
    // A new cat without a parent reports to the boss: promoteToBoss makes bosses.
    expect(store.saveCat(profile({ id: 'stray' })).ok).toBe(true);
    expect(store.get('stray')?.parentId).toBe('boss');
    const cycle = store.saveCat({ ...store.get('murka'), parentId: 'kitten' });
    expect(!cycle.ok && cycle.error).toContain('one of its reports');
    expect(store.setParent('murka', 'kitten')).toContain('one of its reports');
    expect(store.setParent('boss', 'murka')).toContain('one of its reports');
    const orphan = store.saveCat(profile({ id: 'x', parentId: 'ghost' }));
    expect(!orphan.ok && orphan.error).toContain('does not exist');
    expect(store.setParent('kitten', 'pushok')).toBeUndefined();
    expect(store.get('kitten')?.parentId).toBe('pushok');
  });

  it('promotes a boss and hands the tree over on delete', () => {
    const store = new CatStore(file(), () => CATALOG, prompts());
    expect(store.promoteToBoss('pushok')).toBeUndefined();
    expect(store.get('pushok')?.parentId).toBeNull();
    expect(store.get('boss')?.parentId).toBe('pushok');
    // Deleting a middle cat moves its reports up.
    expect(store.removeCat('boss')).toBeUndefined();
    expect(tree(store)).toEqual([
      ['murka', 'pushok'],
      ['pushok', null],
      ['ryzhik', 'pushok'],
    ]);
    // Deleting the boss hands over to its first report.
    expect(store.removeCat('pushok')).toBeUndefined();
    expect(tree(store)).toEqual([
      ['murka', null],
      ['ryzhik', 'murka'],
    ]);
    expect(tree(new CatStore(file(), () => CATALOG, prompts()))).toEqual(tree(store));
  });

  it('keeps a copy of an unreadable file and starts from the default team', () => {
    fs.writeFileSync(file(), '{nope');
    const store = new CatStore(file(), () => CATALOG, prompts());
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

describe('merging worker branches', () => {
  it('leaves a conflict open for the cat and never commits conflict markers', async () => {
    const git = (...args: string[]) =>
      execFileSync('git', ['-C', tmp, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args]);
    git('init', '-q', '-b', 'main');
    fs.writeFileSync(path.join(tmp, 'a.txt'), 'base\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    git('checkout', '-q', '-b', 'worker');
    fs.writeFileSync(path.join(tmp, 'a.txt'), 'worker\n');
    git('commit', '-q', '-am', 'worker');
    git('checkout', '-q', 'main');
    fs.writeFileSync(path.join(tmp, 'a.txt'), 'lead\n');
    git('commit', '-q', '-am', 'lead');
    const outcome = await mergeBranch(tmp, 'worker', 'Merge worker');
    expect(outcome).toMatchObject({ ok: false, conflicts: ['a.txt'] });
    await expect(commitAll(tmp, 'wip')).rejects.toThrow('unresolved merge conflict in a.txt');
  });
});
