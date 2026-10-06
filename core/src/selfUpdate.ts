/** Wire types of the self-update HTTP API (`/api/update`, standalone). */

export interface UpdateCommit {
  sha: string;
  title: string;
  url: string;
}

export interface UpdateCheckState {
  currentVersion: string;
  /** Version on the branch at the last successful check. */
  latestVersion?: string;
  /** The branch holds a newer version than the running one. */
  available: boolean;
  checking: boolean;
  lastCheckedAt?: number;
  /** Why the last check failed; cleared by the next successful one. */
  lastError?: string;
  autoCheck: boolean;
  /** Commits between the installed build and the branch, newest first.
   *  Absent when GitHub could not tell (no build commit, rate limit). */
  commits?: UpdateCommit[];
  /** GitHub page with the same changes, for when `commits` is absent. */
  compareUrl: string;
  /** The version the user answered "Later" to (until the next start). */
  dismissedVersion?: string;
}

export type UpdatePhase = 'idle' | 'running' | 'failed' | 'restarting';
export type UpdateStepStatus = 'pending' | 'running' | 'done' | 'failed';

export interface UpdateRunState {
  phase: UpdatePhase;
  steps: Array<{ name: string; status: UpdateStepStatus }>;
  /** Last lines of command output. */
  log: string[];
  logPath?: string;
  error?: string;
  /** Version that was installed (phase `restarting`). */
  installedVersion?: string;
}

export type UpdateStatus = UpdateCheckState & { run: UpdateRunState };
