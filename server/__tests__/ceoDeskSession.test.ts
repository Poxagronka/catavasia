import * as fs from 'fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { waitFor } from './catOfficeHarness.js';
import { deskIdle, type DeskOffice, HANG, startDeskOffice } from './ceoDeskHarness.js';
import { backgroundTasks } from './fixtures/sdkLines.js';

let env: DeskOffice | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  await env?.close();
  if (env) fs.rmSync(env.tmp, { recursive: true, force: true });
  env = undefined;
});

describe('CEO desk live session', () => {
  it('applies a mode or model change from the dock to the live process', async () => {
    env = await startDeskOffice(() => ({ text: 'ok' }));
    const { desk, ceo, office } = env;
    desk.send('one');
    await deskIdle(desk);
    expect(office.ceo.update({ model: 'opus', permissionMode: 'ask' })).toBeUndefined();
    expect(ceo.updates.at(-1)).toMatchObject({ model: 'opus', permissionMode: 'ask' });
    desk.send('two');
    await deskIdle(desk);
    expect(ceo.sessions).toHaveLength(1);
    expect(ceo.closes).toBe(0);
  });

  it('a change the process cannot take opens a resumed one, after the old one is gone', async () => {
    env = await startDeskOffice(() => ({ text: 'ok' }));
    const { desk, ceo, office } = env;
    desk.send('one');
    await deskIdle(desk);
    ceo.liveUpdates = false;
    let release = () => {};
    ceo.closeGate = new Promise((resolve) => (release = resolve));
    expect(office.ceo.update({ model: 'opus', effort: 'high' })).toBeUndefined();
    desk.send('two');
    await waitFor(() => (ceo.closes === 1 ? true : undefined));
    // The old process still exits: the message waits, no second process yet.
    expect(ceo.sessions).toHaveLength(1);
    expect(desk.snapshot().status.queued).toBe(1);
    release();
    await deskIdle(desk);
    expect(ceo.sessions).toHaveLength(2);
    expect(ceo.sessions[1]).toMatchObject({ resume: true, sessionId: ceo.sessions[0].sessionId });
    expect(ceo.turns.at(-1)!.message).toContain('two');
  });

  it('a process that dies shows the error; the next message resumes in a new one', async () => {
    env = await startDeskOffice(({ req }) =>
      req.message.includes('slow') ? HANG : { text: 'ok' },
    );
    const { desk, ceo } = env;
    desk.send('slow');
    await waitFor(() => (desk.snapshot().status.busy ? true : undefined));
    // The first message made the session (as a result would say).
    ceo.sessions[0].onResult({ ok: true, text: 'started', sessionStarted: true });
    ceo.crash('Claude Code exited with code 1');
    await deskIdle(desk);
    expect(desk.snapshot().entries.at(-1)).toMatchObject({
      kind: 'error',
      text: 'The CEO could not answer: Claude Code exited with code 1',
    });
    desk.send('two');
    await deskIdle(desk);
    expect(ceo.sessions).toHaveLength(2);
    expect(ceo.sessions[1]).toMatchObject({ resume: true, sessionId: ceo.sessions[0].sessionId });
  });

  it('never kills a long turn on a timer: only Stop or a teardown ends it', async () => {
    const timers = vi.spyOn(global, 'setTimeout');
    env = await startDeskOffice(() => HANG);
    const { desk, ceo } = env;
    desk.send('think for an hour');
    await waitFor(() => (desk.snapshot().status.busy ? true : undefined));
    const long = timers.mock.calls.filter(([, ms]) => (ms ?? 0) >= 60_000);
    expect(long).toEqual([]);
    expect(ceo.closes).toBe(0);
    await desk.stop();
    await deskIdle(desk);
    expect(ceo.interrupts).toBe(1);
    expect(ceo.closes).toBe(0);
  });

  it('background tasks show in the status; their own Stop reaches stopTask with the id', async () => {
    const sleep = { task_id: 'b3a1k73m9', task_type: 'local_bash', description: 'Sleep 60' };
    env = await startDeskOffice(() => ({ text: 'ok', lines: [backgroundTasks([sleep])] }));
    const { desk, ceo, server } = env;
    const stop = (id: string, auth = true) =>
      server.app.inject({
        method: 'POST',
        url: `/api/ceo/tasks/${id}/stop`,
        ...(auth ? { headers: { authorization: 'Bearer tok' } } : {}),
      });
    expect((await stop('b3a1k73m9')).statusCode).toBe(409);
    desk.send('run it in the background');
    await deskIdle(desk);
    expect(desk.snapshot().status.tasks).toEqual([
      { id: 'b3a1k73m9', type: 'local_bash', description: 'Sleep 60' },
    ]);
    expect((await stop('b3a1k73m9', false)).statusCode).toBe(401);
    expect((await stop('a.b')).statusCode).toBe(400);
    const ok = await stop('b3a1k73m9');
    expect(ok.json()).toEqual({ ok: true });
    expect(ceo.stoppedTasks).toEqual(['b3a1k73m9']);
    // The process ends: its task list goes with it.
    desk.newChat();
    expect(desk.snapshot().status.tasks).toBeUndefined();
  });

  it('New chat closes the live process; the new chat opens its own', async () => {
    env = await startDeskOffice(() => ({ text: 'ok' }));
    const { desk, ceo } = env;
    desk.send('one');
    await deskIdle(desk);
    desk.newChat();
    expect(ceo.closes).toBe(1);
    desk.send('two');
    await deskIdle(desk);
    expect(ceo.sessions).toHaveLength(2);
    expect(ceo.sessions[1].resume).toBe(false);
  });
});
