import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { DESK_RULES } from '../src/ceoDesk/deskPrompt.js';
import { ensureSelfRepo } from '../src/ceoDesk/selfRepo.js';
import { UPDATE_REPO } from '../src/update/updateChecker.js';
import { waitFor } from './catOfficeHarness.js';
import {
  type CeoTurn,
  deskIdle,
  type DeskOffice,
  git,
  makeRepo,
  startDeskOffice,
} from './ceoDeskHarness.js';

let env: DeskOffice | undefined;
afterEach(async () => {
  await env?.close();
  if (env) fs.rmSync(env.tmp, { recursive: true, force: true });
  env = undefined;
});

/** A local stand-in for UPDATE_REPO with a `main` branch. */
function upstream(tmp: string): string {
  const dir = makeRepo(path.join(tmp, 'upstream'));
  git(dir, 'branch', '-M', 'main');
  return dir;
}

describe('CEO knows its own repo', () => {
  it('names UPDATE_REPO and never the upstream fork parent as a PR target', () => {
    expect(DESK_RULES).toContain(UPDATE_REPO);
    expect(DESK_RULES).toContain('project: "catavasia"');
    expect(DESK_RULES).toContain('never to pixel-agents-hq/pixel-agents');
  });

  it('clones once, then fetches and follows origin/main when clean', async () => {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pa-self-')));
    try {
      const src = upstream(tmp);
      const url = `file://${src}`;
      const state = path.join(tmp, 'state');
      const dir = await ensureSelfRepo(state, url);
      expect(dir).toBe(path.join(state, 'self-repo'));
      expect(fs.readFileSync(path.join(dir, 'README.md'), 'utf-8')).toBe('hello\n');
      fs.writeFileSync(path.join(src, 'NEW.md'), 'new\n');
      git(src, 'add', '-A');
      git(src, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'two');
      await ensureSelfRepo(state, url);
      expect(fs.existsSync(path.join(dir, 'NEW.md'))).toBe(true);
      // A dirty clone is fetched but not reset.
      fs.writeFileSync(path.join(dir, 'README.md'), 'mine\n');
      fs.writeFileSync(path.join(src, 'THREE.md'), '3\n');
      git(src, 'add', '-A');
      git(src, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'three');
      await ensureSelfRepo(state, url);
      expect(fs.existsSync(path.join(dir, 'THREE.md'))).toBe(false);
      expect(fs.readFileSync(path.join(dir, 'README.md'), 'utf-8')).toBe('mine\n');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('start_job with project "catavasia" runs in the self-repo clone, not the work folder', async () => {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pa-self-')));
    const src = upstream(tmp);
    let reply = '';
    env = await startDeskOffice(
      async ({ req, call }: CeoTurn) => {
        if (!req.message.includes('[Message from the user]')) return { text: 'noted' };
        reply = (await call('start_job', { task: 'improve the cat office', project: 'catavasia' }))
          .text;
        return { text: 'done' };
      },
      { tmp, selfRepoUrl: `file://${src}` },
    );
    env.desk.send('improve the cat office: X');
    await deskIdle(env.desk);
    const clone = path.join(env.stateDir, 'self-repo');
    expect(reply).toContain(`Folder: ${clone}`);
    const [job] = env.tasks.list();
    expect(job.cwd).toBe(clone);
    await waitFor(() => (env!.tasks.get(job.id)?.status === 'done' ? true : undefined), 30_000);
  });
});
