/**
 * The standalone server's auth token, kept in ~/.pixel-agents/auth-token so
 * every start uses the same one: an open tab (and the `?token=` URL it saved)
 * keeps its edit rights across server restarts.
 *
 * The file is the user's own secret: mode 0600, a regular file, owned by this
 * user. A file that fails any of these checks may have leaked, so it is
 * replaced by a fresh token instead of trusted. Delete the file and restart
 * the server to rotate the token.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { AUTH_TOKEN_FILE_NAME, LAYOUT_FILE_DIR } from './constants.js';

const MIN_TOKEN_LENGTH = 16;

function readTrustedToken(file: string): string | undefined {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile()) return undefined;
    // POSIX only: Windows has no group/other mode bits to check.
    if (process.platform !== 'win32') {
      if ((stat.mode & 0o077) !== 0) return undefined;
      if (process.getuid && stat.uid !== process.getuid()) return undefined;
    }
    const token = fs.readFileSync(file, 'utf-8').trim();
    return token.length >= MIN_TOKEN_LENGTH ? token : undefined;
  } catch {
    return undefined; // Missing or unreadable.
  }
}

/** Read the saved token, or create and save a new one (0600, atomic). */
export function loadOrCreateAuthToken(
  dir: string = path.join(os.homedir(), LAYOUT_FILE_DIR),
): string {
  const file = path.join(dir, AUTH_TOKEN_FILE_NAME);
  const saved = readTrustedToken(file);
  if (saved) return saved;

  const token = crypto.randomUUID();
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    // The mode applies at create time, so the secret is never readable by others.
    fs.writeFileSync(tmp, `${token}\n`, { mode: 0o600, flag: 'wx' });
    // rename replaces a loose file or a symlink itself, never its target.
    fs.renameSync(tmp, file);
  } catch (e) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // The tmp file was never written.
    }
    console.error(`[catavasia] Could not save the auth token; it lasts until restart: ${e}`);
  }
  return token;
}
