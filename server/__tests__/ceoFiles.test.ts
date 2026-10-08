/**
 * The `@` menu of the CEO dock: GET /api/ceo/files lists files of the folder
 * the chat runs in (gitignore-aware, ranked, capped), behind the server token,
 * and never a file outside that folder.
 */

import * as fs from 'fs';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { matchFiles } from '../src/ceoDesk/fileMentions.js';
import { CEO_MENTION_MAX_FILES } from '../src/constants.js';
import { type DeskOffice, git, makeRepo, startDeskOffice } from './ceoDeskHarness.js';

let env: DeskOffice | undefined;

afterEach(async () => {
  await env?.close();
  if (env) fs.rmSync(env.tmp, { recursive: true, force: true });
  env = undefined;
});

const write = (file: string, text = 'x') => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

describe('matchFiles', () => {
  const files = ['src/app.ts', 'src/apple/pie.ts', 'docs/map.md', 'README.md', 'test/a_p_p.ts'];

  it('ranks name prefix, name, path, then fuzzy; shorter paths first in a rank', () => {
    expect(matchFiles(files, 'app', 10)).toEqual([
      'src/app.ts',
      'src/apple/pie.ts',
      'test/a_p_p.ts',
    ]);
    expect(matchFiles(files, 'ap', 10)).toEqual([
      'src/app.ts',
      'docs/map.md',
      'src/apple/pie.ts',
      'test/a_p_p.ts',
    ]);
    expect(matchFiles(files, 'READ', 10)).toEqual(['README.md']);
    expect(matchFiles(files, 'zzz', 10)).toEqual([]);
  });

  it('an empty query lists every file, shortest first, up to the cap', () => {
    expect(matchFiles(files, '', 2)).toEqual(['README.md', 'src/app.ts']);
  });
});

describe('GET /api/ceo/files', () => {
  const get = (q: string, headers: Record<string, string> = { authorization: 'Bearer tok' }) =>
    env!.server.app.inject({
      method: 'GET',
      url: `/api/ceo/files?q=${encodeURIComponent(q)}`,
      headers,
    });

  it('needs the server token', async () => {
    env = await startDeskOffice(() => ({ text: 'ok' }));
    expect((await get('', {})).statusCode).toBe(401);
    expect((await get('')).statusCode).toBe(200);
  });

  it('lists the project folder only: gitignore-aware, no file above it, capped', async () => {
    env = await startDeskOffice(() => ({ text: 'ok' }));
    const repo = makeRepo(path.join(env.tmp, 'repo'));
    const project = path.join(repo, 'app');
    write(path.join(repo, 'secret.txt'));
    write(path.join(project, '.gitignore'), 'dist/\n');
    write(path.join(project, 'src/main.ts'));
    write(path.join(project, 'dist/bundle.js'));
    git(repo, 'add', 'app/.gitignore');
    for (let n = 0; n < CEO_MENTION_MAX_FILES + 5; n++) write(path.join(project, `many/f${n}.ts`));
    env.desk.setFolder(project);

    expect((await get('main')).json()).toEqual({ files: ['src/main.ts'] });
    expect((await get('gitignore')).json()).toEqual({ files: ['.gitignore'] });
    // .gitignore hides dist/.
    expect((await get('bundle')).json()).toEqual({ files: [] });
    // A query is only a filter: `..` never reaches the repo above the folder.
    expect((await get('../secret')).json()).toEqual({ files: [] });
    expect((await get('secret')).json()).toEqual({ files: [] });

    expect((await get('many')).json<{ files: string[] }>().files).toHaveLength(
      CEO_MENTION_MAX_FILES,
    );
  });

  it("without a project it lists the chat's own folder", async () => {
    env = await startDeskOffice(() => ({ text: 'ok' }));
    write(path.join(env.desk.cwd, 'notes.md'));
    expect((await get('note')).json()).toEqual({ files: ['notes.md'] });
  });
});
