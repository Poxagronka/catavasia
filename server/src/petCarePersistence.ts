import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { LAYOUT_FILE_DIR, PETS_STATE_FILE_NAME, PETS_STATE_MAX_BYTES } from './constants.js';

/**
 * ~/.pixel-agents/pets-state.json — the pet-care snapshot (needs, bowls,
 * litter, floor poops). The server treats it as an opaque object: the format
 * belongs to the webview pet-care module, which also applies the offline
 * catch-up from the snapshot's own `savedAt` stamp. Both surfaces share the
 * file, like layout.json. Writes are atomic (tmp + rename).
 */
function getPetCareFilePath(): string {
  return path.join(os.homedir(), LAYOUT_FILE_DIR, PETS_STATE_FILE_NAME);
}

export function readPetCareState(): Record<string, unknown> | null {
  const filePath = getPetCareFilePath();
  try {
    if (!fs.existsSync(filePath)) return null;
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch (err) {
    console.error('[catavasia] Failed to read pet-care state:', err);
    return null;
  }
}

/** Returns false (and writes nothing) for a non-object or oversized payload. */
export function writePetCareState(state: unknown): boolean {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
  const json = JSON.stringify(state);
  if (json.length > PETS_STATE_MAX_BYTES) {
    console.warn('[catavasia] Pet-care state too large, not saved');
    return false;
  }
  const filePath = getPetCareFilePath();
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmpPath = filePath + '.tmp';
    fs.writeFileSync(tmpPath, json, 'utf-8');
    fs.renameSync(tmpPath, filePath);
    return true;
  } catch (err) {
    console.error('[catavasia] Failed to write pet-care state:', err);
    return false;
  }
}

/** "Reset everything": the next load starts with fresh needs, bowls and litter. */
export function clearPetCareState(): void {
  fs.rmSync(getPetCareFilePath(), { force: true });
}
