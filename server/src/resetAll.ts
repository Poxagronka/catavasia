/**
 * Settings "Reset everything" (resetAllToDefault): back up the user's state,
 * then put back the default layout, a fresh pet-care state and, with a cat
 * office, the default cat team. Shared by the standalone server and VS Code.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  BACKUPS_DIR,
  CATS_FILE_NAME,
  LAYOUT_FILE_DIR,
  LAYOUT_FILE_NAME,
  PETS_STATE_FILE_NAME,
  PROMPTS_DIR,
  TASKS_FILE_NAME,
} from './constants.js';
import { writeLayoutToFile } from './layoutPersistence.js';
import type { Orchestrator } from './orchestrator/orchestrator.js';
import { clearPetCareState } from './petCarePersistence.js';

/** The resetAllResult message without its type (core/asyncapi.yaml). */
export interface ResetAllOutcome {
  backupDir?: string;
  error?: string;
}

/** Copy the state files and the prompts/ repo to ~/.pixel-agents/backups/<timestamp>/. */
export function backupState(now = new Date()): string {
  const root = path.join(os.homedir(), LAYOUT_FILE_DIR);
  const dir = path.join(root, BACKUPS_DIR, now.toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  for (const name of [CATS_FILE_NAME, LAYOUT_FILE_NAME, PETS_STATE_FILE_NAME, TASKS_FILE_NAME]) {
    const from = path.join(root, name);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(dir, name));
  }
  const prompts = path.join(root, PROMPTS_DIR);
  if (fs.existsSync(prompts)) fs.cpSync(prompts, path.join(dir, PROMPTS_DIR), { recursive: true });
  return dir;
}

/**
 * The whole reset. Nothing changes when it is refused or the backup fails.
 * A busy office refuses (cancelling tasks half-way would orphan their worktrees).
 */
export function resetAll(
  defaultLayout: Record<string, unknown> | null | undefined,
  office?: Orchestrator,
  beforeLayoutWrite?: () => void,
): ResetAllOutcome {
  if (!defaultLayout) return { error: 'No bundled default layout to reset to.' };
  if (office?.busy()) {
    return {
      error: 'Cats are working: wait for their tasks to finish or cancel them, then reset.',
    };
  }
  let backupDir: string;
  try {
    backupDir = backupState();
  } catch (err) {
    return { error: `Backup failed, nothing was reset: ${String(err)}` };
  }
  try {
    const error = office?.resetToDefaults();
    if (error) return { error: `${error} (backup: ${backupDir})` };
    beforeLayoutWrite?.();
    writeLayoutToFile(defaultLayout);
    clearPetCareState();
  } catch (err) {
    return { error: `Reset failed part-way: ${String(err)} (backup: ${backupDir})` };
  }
  return { backupDir };
}
