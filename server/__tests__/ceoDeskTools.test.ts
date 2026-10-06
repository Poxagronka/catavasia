import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { DESK_TOOLS } from '../src/ceoDesk/deskTools.js';
import { checkWorkFolder } from '../src/ceoDesk/workFolder.js';
import { waitFor } from './catOfficeHarness.js';
import {
  type CeoTurn,
  deskIdle,
  type DeskOffice,
  git,
  makeRepo,
  startDeskOffice,
  type ToolReply,
} from './ceoDeskHarness.js';

let env: DeskOffice | undefined;

afterEach(async () => {
  delete process.env.FAKE_MODE;
  await env?.close();
  if (env) fs.rmSync(env.tmp, { recursive: true, force: true });
  env = undefined;
});

/** A desk whose CEO runs `steps` (tool calls) on the next user message and returns the replies. */
async function withTools(): Promise<{
  run: (steps: Array<[string, Record<string, unknown>?]>) => Promise<ToolReply[]>;
}> {
  let steps: Array<[string, Record<string, unknown>?]> = [];
  let out: ToolReply[] = [];
  env = await startDeskOffice(async ({ req, call }: CeoTurn) => {
    if (!req.message.includes('[Message from the user]')) return { text: 'noted' };
    out = [];
    for (const [name, args] of steps) out.push(await call(name, args));
    return { text: 'done' };
  });
  const desk = env.desk;
  return {
    run: async (next) => {
      steps = next;
      desk.send('go');
      await deskIdle(desk);
      return out;
    },
  };
}

describe('work folder checks', () => {
  it('rejects relative paths, non-folders, /, the home folder and catavasia state', () => {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pa-folder-')));
    const state = path.join(tmp, 'state');
    fs.mkdirSync(path.join(state, 'cat-ceo'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'file.txt'), 'x');
    const error = (p: string) => {
      const r = checkWorkFolder(p, state);
      return r.ok ? undefined : r.error;
    };
    expect(error('proj')).toContain('Not an absolute path');
    expect(error(path.join(tmp, 'file.txt'))).toContain('Not a folder');
    expect(error(path.join(tmp, 'missing'))).toContain('Not a folder');
    expect(error('/')).toContain('root');
    expect(error(os.homedir())).toContain('home folder');
    expect(error(path.join(state, 'cat-ceo'))).toContain('catavasia state');
    expect(checkWorkFolder(`${tmp}/`, state)).toEqual({ ok: true, path: tmp });
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

describe('desk tools', () => {
  it('lists the desk tools only at the desk path, and keeps the two tokens apart', async () => {
    await withTools();
    const { port } = env!.server;
    const token = JSON.parse(
      fs.readFileSync(path.join(env!.stateDir, 'cat-ceo', 'desk.json'), 'utf-8'),
    ).mcpToken as string;
    const list = async (url: string, bearer: string) =>
      fetch(`http://127.0.0.1:${port}${url}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      });
    const desk = await list('/api/ceo-mcp', token);
    expect(
      ((await desk.json()) as { result: { tools: Array<{ name: string }> } }).result.tools.map(
        (t) => t.name,
      ),
    ).toEqual(DESK_TOOLS.map((t) => t.name));
    expect((await list('/mcp', token)).status).toBe(401);
    expect((await list('/api/ceo-mcp', 'cat-token')).status).toBe(401);
  });

  it('list_team, set_folder, and the start_job refusals', async () => {
    const { run } = await withTools();
    const repo = makeRepo(path.join(env!.tmp, 'repo'));
    const [team, badFolder, setFolder, unknownCat, unknownFrom] = await run([
      ['list_team'],
      ['set_folder', { path: os.homedir() }],
      ['set_folder', { path: repo }],
      ['start_job', { task: 'x', to: 'nobody' }],
      ['start_job', { task: 'x', from: 'ffffffff' }],
    ]);
    expect(team.text).toBe(
      [
        'Lead: Oliver (boss): Team lead, claude sonnet. start_job with to "team" goes to the lead.',
        '- Luna (murka): Developer, claude sonnet, reports to Oliver',
        '- Milo (pushok): Developer, claude sonnet, reports to Oliver',
      ].join('\n'),
    );
    expect(badFolder).toMatchObject({ isError: true });
    expect(setFolder.text).toBe(`The work folder of this chat is now ${repo}.`);
    expect(env!.desk.folder).toBe(repo);
    expect(unknownCat).toMatchObject({
      isError: true,
      text: expect.stringContaining('Unknown cat'),
    });
    expect(unknownFrom).toMatchObject({ isError: true, text: 'No job ffffffff in this chat.' });
  });

  it('refuses a job when the lead engine cannot run', async () => {
    env = await startDeskOffice(
      async ({ req, call }) =>
        req.message.includes('[Message')
          ? { text: (await call('start_job', { task: 'x' })).text }
          : {},
      {
        seed: (stateDir) => {
          const file = path.join(stateDir, 'cats.json');
          const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
          data.cats[0].engine = 'codex';
          fs.writeFileSync(file, JSON.stringify(data));
        },
      },
    );
    env.desk.send('go');
    await deskIdle(env.desk);
    expect(env.ceo.replies[0]).toEqual({
      isError: true,
      text: 'Oliver cannot work now. codex has no adapter',
    });
    expect(env.tasks.list()).toEqual([]);
  });

  it('caps live jobs, sends messages to a running lead, and cancels a job', async () => {
    process.env.FAKE_MODE = 'hang';
    const { run } = await withTools();
    const repo = makeRepo(path.join(env!.tmp, 'repo'));
    env!.desk.setFolder(repo);
    const started = await run([
      ['start_job', { task: 'one' }],
      ['start_job', { task: 'two', to: 'murka' }],
      ['start_job', { task: 'three', to: 'pushok' }],
      ['start_job', { task: 'four' }],
    ]);
    expect(started.slice(0, 3).every((r) => !r.isError)).toBe(true);
    expect(started[3]).toMatchObject({
      isError: true,
      text: expect.stringContaining('3 jobs already run'),
    });
    const jobs = env!.tasks.chatJobs(path.basename(env!.ceo.turns[0].cwd));
    expect(jobs).toHaveLength(3);
    const one = jobs.find((j) => j.prompt === 'one')!;
    await waitFor(() => (env!.office.liveMember('boss') ? true : undefined));
    const [msg, status, cancel] = await run([
      ['message_job', { jobId: one.id, text: 'hurry' }],
      ['job_status', {}],
      ['cancel_job', { jobId: one.id }],
    ]);
    expect(msg.text).toBe(`Sent to the lead of job ${one.id}.`);
    expect(status.text.split('\n')).toHaveLength(3);
    expect(cancel.text).toBe(`Job ${one.id} is cancelling. Its branches stay.`);
    await waitFor(() => (env!.tasks.get(one.id)?.flow?.state === 'cancelled' ? true : undefined));
    // The cancelled job becomes a notice for the CEO.
    await waitFor(() =>
      env!.ceo.turns.some((t) => t.message.includes(`[Job ${one.id} cancelled]`))
        ? true
        : undefined,
    );
  });

  it('a rework starts from the branch of the job it corrects, at most twice per request', async () => {
    const { run } = await withTools();
    const repo = makeRepo(path.join(env!.tmp, 'repo'));
    env!.desk.setFolder(repo);
    const [first] = await run([['start_job', { task: 'first' }]]);
    const firstId = /Job ([0-9a-f]+) started/.exec(first.text)![1];
    await waitFor(() => (env!.tasks.get(firstId)?.status === 'done' ? true : undefined), 30_000);
    await deskIdle(env!.desk);
    const replies = await run([
      ['start_job', { task: 'fix 1', from: firstId }],
      ['start_job', { task: 'fix 2', from: firstId, to: 'murka' }],
      ['start_job', { task: 'fix 3', from: firstId, to: 'pushok' }],
    ]);
    expect(replies[0].text).toContain(`(from task/${firstId})`);
    expect(replies[1].isError).toBe(false);
    expect(replies[2]).toMatchObject({
      isError: true,
      text: expect.stringContaining('Already 2 reworks'),
    });
    const reworkId = /Job ([0-9a-f]+) started/.exec(replies[0].text)![1];
    // The rework branch starts at the corrected job's branch head.
    expect(git(repo, 'merge-base', '--is-ancestor', `task/${firstId}`, `task/${reworkId}`)).toBe(
      '',
    );
  });
});
