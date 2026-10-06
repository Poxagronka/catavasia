/**
 * Prompt files in the prompts git repo (context-policy.md §5, §7 steps 2, 3, 6):
 * migration from cats.json, one commit per change, hand edits, broken files.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CatStore, type EngineCatalog } from '../src/orchestrator/catProfiles.js';
import { renderPromptFile } from '../src/orchestrator/promptFile.js';
import { PromptRepo } from '../src/orchestrator/promptRepo.js';

const CATALOG: EngineCatalog = {
  claude: { models: ['opus', 'sonnet'], efforts: ['low', 'medium', 'high'] },
};

let tmp: string;
let catsFile: string;
let promptsDir: string;

const subjects = () =>
  execFileSync('git', ['-C', promptsDir, 'log', '--format=%s'], { encoding: 'utf-8' })
    .trim()
    .split('\n');
const open = () => new CatStore(catsFile, () => CATALOG, new PromptRepo(promptsDir));
const legacyCat = (id: string, parentId: string | null, systemPrompt: string) => ({
  id,
  name: id,
  role: 'Developer',
  systemPrompt,
  engine: 'claude',
  model: 'sonnet',
  effort: 'medium',
  appearance: {},
  parentId,
});

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-prompts-'));
  catsFile = path.join(tmp, 'cats.json');
  promptsDir = path.join(tmp, 'prompts');
  fs.writeFileSync(
    catsFile,
    JSON.stringify({
      version: 1,
      cats: [legacyCat('boss', null, 'Lead well.'), legacyCat('murka', 'boss', 'Write tests.')],
    }),
  );
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('prompt files', () => {
  it('migrates systemPrompt from cats.json into one committed file per cat, once', () => {
    const store = open();
    expect(subjects()).toEqual([
      'user(murka): import from cats.json',
      'user(boss): import from cats.json',
    ]);
    expect(fs.readFileSync(path.join(promptsDir, 'murka.md'), 'utf-8')).toContain(
      '# Role & conduct\n<!-- LOCKED: only the user edits this section (Cats menu). The Cat CEO never changes it. -->\nWrite tests.\n',
    );
    const onDisk = JSON.parse(fs.readFileSync(catsFile, 'utf-8'));
    expect(onDisk.cats.every((c: object) => !('systemPrompt' in c))).toBe(true);
    // The wire field still carries the Role section.
    expect(store.get('murka')?.systemPrompt).toBe('Write tests.');
    open();
    expect(subjects()).toHaveLength(2);
    expect(fs.existsSync(path.join(promptsDir, '.git'))).toBe(true);
  });

  it('commits a Role edit from the Cats menu once, keeps Rules and Lessons', () => {
    const store = open();
    const repo = store.prompts;
    repo.write(
      'murka',
      { role: 'Write tests.', rules: [{ id: 'R1', text: 'Run tests.' }], lessons: [] },
      'cat-ceo(murka): add R1',
    );
    expect(store.saveCat({ ...store.get('murka'), systemPrompt: 'Write more tests.' }).ok).toBe(
      true,
    );
    expect(store.saveCat({ ...store.get('murka'), name: 'Murka' }).ok).toBe(true);
    expect(subjects()[0]).toBe('user(murka): edit Role & conduct');
    expect(subjects()).toHaveLength(4);
    expect(repo.read('murka').file).toEqual({
      role: 'Write more tests.',
      rules: [{ id: 'R1', text: 'Run tests.' }],
      lessons: [],
    });
    expect(store.promptView('murka')).toEqual({
      rules: [{ id: 'R1', text: 'Run tests.' }],
      lessons: [],
    });
    expect(repo.headSha('murka')).toMatch(/^[0-9a-f]{40}$/);
    // The Role cannot hold a line that would end it.
    const bad = store.saveCat({ ...store.get('murka'), systemPrompt: 'x\n# Rules\ny' });
    expect(bad.ok).toBe(false);
  });

  it('creates a file for a new cat and removes it with the cat', () => {
    const store = open();
    expect(store.saveCat({ ...legacyCat('pushok', 'boss', 'New cat.') }).ok).toBe(true);
    expect(subjects()[0]).toBe('user(pushok): create');
    expect(store.removeCat('pushok')).toBeUndefined();
    expect(subjects()[0]).toBe('user(pushok): delete');
    expect(fs.existsSync(path.join(promptsDir, 'pushok.md'))).toBe(false);
  });

  it('commits a hand edit at the next load; a broken file falls back to the last commit', () => {
    open();
    const file = path.join(promptsDir, 'murka.md');
    const edited = renderPromptFile('murka', { role: 'Hand edit.', rules: [], lessons: [] });
    fs.writeFileSync(file, edited);
    expect(open().get('murka')?.systemPrompt).toBe('Hand edit.');
    expect(subjects()[0]).toBe('user(murka): manual edit');
    fs.writeFileSync(file, edited.replace('# Lessons', '# Oops'));
    const store = open();
    expect(store.get('murka')?.systemPrompt).toBe('Hand edit.');
    expect(store.promptView('murka').promptError).toContain('"# Lessons" must appear exactly once');
    expect(subjects()).toHaveLength(3);
  });
});
