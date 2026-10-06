import { afterEach, describe, expect, it, vi } from 'vitest';

import { updateBranch, UpdateChecker } from '../src/update/updateChecker.js';
import { compareVersions, isVersion } from '../src/update/version.js';

describe('compareVersions', () => {
  it('orders cats prereleases numerically', () => {
    expect(compareVersions('1.4.1-cats.9', '1.4.1-cats.10')).toBe(-1);
    expect(compareVersions('1.4.1-cats.10', '1.4.1-cats.9')).toBe(1);
  });

  it('treats equal versions as equal', () => {
    expect(compareVersions('1.4.1-cats.18', '1.4.1-cats.18')).toBe(0);
  });

  it('sees an older main as older', () => {
    expect(compareVersions('1.4.1-cats.17', '1.4.1-cats.20')).toBe(-1);
  });

  it('follows semver precedence for core numbers and releases', () => {
    expect(compareVersions('1.4.2-cats.1', '1.4.1-cats.99')).toBe(1);
    expect(compareVersions('1.4.1', '1.4.1-cats.99')).toBe(1);
    expect(compareVersions('1.4.1-cats', '1.4.1-cats.1')).toBe(-1);
    expect(compareVersions('1.4.1-alpha.1', '1.4.1-cats.1')).toBe(-1);
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
  });

  it('rejects non-versions', () => {
    expect(isVersion('1.4.1-cats.18')).toBe(true);
    expect(isVersion('main')).toBe(false);
    expect(isVersion(18)).toBe(false);
    expect(() => compareVersions('x', '1.0.0')).toThrow();
  });
});

describe('updateBranch', () => {
  it('follows main unless the test knob names a branch', () => {
    expect(updateBranch({})).toBe('main');
    expect(updateBranch({ CATAVASIA_UPDATE_BRANCH: 'feat/self-update' })).toBe('feat/self-update');
    expect(updateBranch({ CATAVASIA_UPDATE_BRANCH: '--upload-pack=x' })).toBe('main');
    expect(updateBranch({ CATAVASIA_UPDATE_BRANCH: 'a/../../other/main' })).toBe('main');
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const SHA = 'a708587aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function makeChecker(fetchImpl: (url: string) => Promise<Response>, autoCheck = { on: true }) {
  const fetchFn = vi.fn(fetchImpl);
  const checker = new UpdateChecker({
    currentVersion: '1.4.1-cats.9',
    currentCommit: SHA,
    branch: 'main',
    getAutoCheck: () => autoCheck.on,
    setAutoCheck: (on) => (autoCheck.on = on),
    fetch: fetchFn,
    intervalMs: 1000,
  });
  return { checker, fetchFn, autoCheck };
}

const compareBody = {
  commits: [
    { sha: '1', html_url: 'u1', parents: [{}], commit: { message: 'feat: one\n\nbody' } },
    { sha: 'm', html_url: 'um', parents: [{}, {}], commit: { message: 'Merge pull request #1' } },
    { sha: '2', html_url: 'u2', parents: [{}], commit: { message: 'fix: two' } },
  ],
};

describe('UpdateChecker', () => {
  afterEach(() => vi.useRealTimers());

  it('offers a newer main and lists its commits newest first, without merges', async () => {
    const { checker, fetchFn } = makeChecker(async (url) =>
      url.includes('raw.githubusercontent.com')
        ? json({ version: '1.4.1-cats.10' })
        : json(compareBody),
    );
    await checker.check();
    const s = checker.state();
    expect(s.available).toBe(true);
    expect(s.latestVersion).toBe('1.4.1-cats.10');
    expect(s.commits?.map((c) => c.title)).toEqual(['fix: two', 'feat: one']);
    expect(s.compareUrl).toBe(`https://github.com/Poxagronka/catavasia/compare/${SHA}...main`);
    expect(fetchFn.mock.calls[0][0]).toBe(
      'https://raw.githubusercontent.com/Poxagronka/catavasia/main/package.json',
    );
  });

  it('offers nothing when main is equal or older', async () => {
    for (const version of ['1.4.1-cats.9', '1.4.1-cats.8']) {
      const { checker, fetchFn } = makeChecker(async () => json({ version }));
      await checker.check();
      expect(checker.state().available).toBe(false);
      expect(fetchFn).toHaveBeenCalledTimes(1); // no compare call
    }
  });

  it('keeps a failure in lastError and clears it on the next success', async () => {
    let fail = true;
    const { checker } = makeChecker(async () => {
      if (fail) throw new Error('offline');
      return json({ version: '1.4.1-cats.9' });
    });
    await checker.check();
    expect(checker.state().lastError).toBe('offline');
    expect(checker.state().lastCheckedAt).toBeTypeOf('number');
    fail = false;
    await checker.check();
    expect(checker.state().lastError).toBeUndefined();
  });

  it('reports a rate limit as a failed check', async () => {
    const { checker } = makeChecker(async () => json({ message: 'rate limit' }, 429));
    await checker.check();
    expect(checker.state().lastError).toMatch(/429/);
  });

  it('falls back to the compare link when the compare API fails', async () => {
    const { checker } = makeChecker(async (url) =>
      url.includes('raw.') ? json({ version: '1.4.1-cats.10' }) : json({}, 403),
    );
    await checker.check();
    expect(checker.state().available).toBe(true);
    expect(checker.state().commits).toBeUndefined();
  });

  it('checks at start and on every interval while auto-check is on', async () => {
    vi.useFakeTimers();
    const { checker, fetchFn, autoCheck } = makeChecker(async () =>
      json({ version: '1.4.1-cats.9' }),
    );
    checker.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    autoCheck.on = false;
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    checker.dispose();
  });

  it('does not check at start when auto-check is off; turning it on checks once', async () => {
    vi.useFakeTimers();
    const { checker, fetchFn, autoCheck } = makeChecker(
      async () => json({ version: '1.4.1-cats.9' }),
      { on: false },
    );
    checker.start();
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchFn).not.toHaveBeenCalled();
    checker.setAutoCheck(true);
    expect(autoCheck.on).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    checker.dispose();
  });

  it('shares one in-flight check and remembers "Later" per version', async () => {
    const { checker, fetchFn } = makeChecker(async (url) =>
      url.includes('raw.') ? json({ version: '1.4.1-cats.10' }) : json(compareBody),
    );
    await Promise.all([checker.check(), checker.check()]);
    expect(fetchFn).toHaveBeenCalledTimes(2); // one package.json + one compare
    checker.dismiss('1.4.1-cats.10');
    expect(checker.state().dismissedVersion).toBe('1.4.1-cats.10');
  });

  it('links the commit list when the build has no commit', async () => {
    const checker = new UpdateChecker({
      currentVersion: '1.4.1-cats.9',
      branch: 'main',
      getAutoCheck: () => true,
      setAutoCheck: () => {},
      fetch: async () => json({ version: '1.4.1-cats.10' }),
    });
    await checker.check();
    expect(checker.state().commits).toBeUndefined();
    expect(checker.state().compareUrl).toBe('https://github.com/Poxagronka/catavasia/commits/main');
  });
});
