/**
 * Self-update check: reads the version on the fixed GitHub repo's branch and
 * compares it with the running build. Runs at start and every 6 hours while
 * the "Check for updates automatically" setting is on, and on demand from
 * Settings. Failures are kept in `lastError` and never thrown.
 */

import type { UpdateCheckState, UpdateCommit } from '../../../core/src/selfUpdate.js';
import { compareVersions, isVersion } from './version.js';

/** The ONLY repo the updater reads from or installs. */
export const UPDATE_REPO = 'Poxagronka/catavasia';
export const UPDATE_REPO_GIT_URL = `https://github.com/${UPDATE_REPO}.git`;
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_COMMITS = 50;

/**
 * The branch of UPDATE_REPO to follow: `main`, unless the test-only
 * CATAVASIA_UPDATE_BRANCH env var names another branch of the same repo.
 */
export function updateBranch(env: NodeJS.ProcessEnv = process.env): string {
  const branch = env['CATAVASIA_UPDATE_BRANCH'];
  return branch && /^[\w][\w./-]*$/.test(branch) ? branch : 'main';
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface UpdateCheckerOptions {
  currentVersion: string;
  /** Git commit the running build was made from (stamped by esbuild). */
  currentCommit?: string;
  branch: string;
  getAutoCheck: () => boolean;
  setAutoCheck: (enabled: boolean) => void;
  fetch?: FetchFn;
  intervalMs?: number;
  now?: () => number;
}

export class UpdateChecker {
  private latestVersion?: string;
  private lastCheckedAt?: number;
  private lastError?: string;
  private commits?: UpdateCommit[];
  private commitsFor?: string;
  private dismissedVersion?: string;
  private inFlight?: Promise<void>;
  private timer?: ReturnType<typeof setInterval>;
  private readonly commit?: string;

  constructor(private readonly opts: UpdateCheckerOptions) {
    this.commit = /^[0-9a-f]{7,40}$/.test(opts.currentCommit ?? '')
      ? opts.currentCommit
      : undefined;
  }

  /** First check now (when enabled), then one every interval while enabled. */
  start(): void {
    if (this.opts.getAutoCheck()) void this.check();
    this.timer = setInterval(() => {
      if (this.opts.getAutoCheck()) void this.check();
    }, this.opts.intervalMs ?? UPDATE_CHECK_INTERVAL_MS);
    this.timer.unref?.();
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  setAutoCheck(enabled: boolean): void {
    this.opts.setAutoCheck(enabled);
    if (enabled && this.lastCheckedAt === undefined) void this.check();
  }

  /** "Later" for this version; undefined shows the offer again. */
  dismiss(version: string | undefined): void {
    this.dismissedVersion = version;
  }

  /** One check at a time; a second caller shares the running one. */
  check(): Promise<void> {
    this.inFlight ??= this.runCheck().finally(() => (this.inFlight = undefined));
    return this.inFlight;
  }

  state(): UpdateCheckState {
    const { currentVersion, branch } = this.opts;
    return {
      currentVersion,
      latestVersion: this.latestVersion,
      available: this.isNewer(this.latestVersion),
      checking: this.inFlight !== undefined,
      lastCheckedAt: this.lastCheckedAt,
      lastError: this.lastError,
      autoCheck: this.opts.getAutoCheck(),
      commits: this.commits,
      compareUrl: this.commit
        ? `https://github.com/${UPDATE_REPO}/compare/${this.commit}...${branch}`
        : `https://github.com/${UPDATE_REPO}/commits/${branch}`,
      dismissedVersion: this.dismissedVersion,
    };
  }

  private isNewer(version: string | undefined): boolean {
    if (!version || !isVersion(this.opts.currentVersion)) return false;
    return compareVersions(version, this.opts.currentVersion) > 0;
  }

  private async runCheck(): Promise<void> {
    const fetchFn = this.opts.fetch ?? fetch;
    const url = `https://raw.githubusercontent.com/${UPDATE_REPO}/${this.opts.branch}/package.json`;
    try {
      const res = await fetchFn(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`GitHub answered HTTP ${res.status}`);
      const version = ((await res.json()) as { version?: unknown }).version;
      if (!isVersion(version)) throw new Error('The repo package.json has no valid version');
      this.latestVersion = version;
      this.lastError = undefined;
      if (this.isNewer(version) && this.commitsFor !== version) {
        this.commits = await this.loadCommits(fetchFn);
        this.commitsFor = this.commits ? version : undefined;
      }
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
    } finally {
      this.lastCheckedAt = (this.opts.now ?? Date.now)();
    }
  }

  /** Best effort: undefined on any failure (the UI then links compareUrl). */
  private async loadCommits(fetchFn: FetchFn): Promise<UpdateCommit[] | undefined> {
    if (!this.commit) return undefined;
    const url = `https://api.github.com/repos/${UPDATE_REPO}/compare/${this.commit}...${this.opts.branch}`;
    try {
      const res = await fetchFn(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'catavasia-updater' },
      });
      if (!res.ok) return undefined;
      const body = (await res.json()) as {
        commits?: Array<{
          sha: string;
          html_url: string;
          parents?: unknown[];
          commit: { message: string };
        }>;
      };
      if (!Array.isArray(body.commits)) return undefined;
      return body.commits
        .filter((c) => (c.parents?.length ?? 1) <= 1) // merge commits repeat the PR title
        .map((c) => ({ sha: c.sha, title: c.commit.message.split('\n')[0], url: c.html_url }))
        .reverse()
        .slice(0, MAX_COMMITS);
    } catch {
      return undefined;
    }
  }
}
