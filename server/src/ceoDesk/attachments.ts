/**
 * Files the user attaches to a CEO desk message. They are saved in
 * chats/<chatId>/attachments/. Images (PNG, JPEG, GIF, WebP, by their bytes)
 * reach the CEO as Claude image blocks. Every file also gets an
 * `[Attached ...: /abs/path (name, size)]` line, so the CEO can read it with
 * Read or hand the path to a job.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import {
  CEO_API_PREFIX,
  CEO_ATTACH_MAX_COUNT,
  CEO_ATTACH_MAX_TOTAL_BYTES,
  CEO_IMAGE_MAX_BYTES,
  type CeoAttachment,
  type CeoAttachmentUpload,
  formatSize,
} from '../../../core/src/ceoDesk.js';
import { CAT_CEO_DIR, CEO_DESK_CHATS_DIR } from '../constants.js';

export const ATTACHMENTS_DIR = 'attachments';

/** Image signatures -> the stored extension (the adapter maps it back to a media type). */
const IMAGE_MAGIC: Array<{ ext: string; test: (b: Buffer) => boolean }> = [
  { ext: '.png', test: (b) => b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) },
  { ext: '.jpg', test: (b) => b.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex')) },
  { ext: '.gif', test: (b) => b.subarray(0, 4).toString('latin1') === 'GIF8' },
  {
    ext: '.webp',
    test: (b) =>
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
];

/** Served content types: only the image types render; everything else downloads. */
const SERVED_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

const CHAT_ID = /^c-[0-9a-f]+$/;
const STORED_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface SavedAttachments {
  attachments: CeoAttachment[];
  /** Absolute paths of the images (Claude image blocks). */
  images: string[];
  /** One `[Attached ...]` line per file, for the CEO's message. */
  lines: string[];
}

function imageExt(data: Buffer): string | undefined {
  return IMAGE_MAGIC.find((m) => m.test(data))?.ext;
}

/** A file name safe on every OS: letters, digits, `.-_`; at most 80 characters. */
function safeName(name: string): string {
  const base = path.basename(name.replace(/\\/g, '/'));
  const clean = base.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._-]+/, '');
  return clean.slice(-80) || 'file';
}

/** Check the limits, then save every file. Nothing is saved when one check fails. */
export function saveAttachments(
  chatDir: string,
  chatId: string,
  uploads: CeoAttachmentUpload[],
): SavedAttachments | { error: string } {
  if (uploads.length > CEO_ATTACH_MAX_COUNT)
    return { error: `At most ${CEO_ATTACH_MAX_COUNT} files per message` };
  const files = uploads.map((u) => {
    const data = Buffer.from(u.data, 'base64');
    return { name: u.name || 'file', data, ext: imageExt(data) };
  });
  const total = files.reduce((sum, f) => sum + f.data.length, 0);
  if (total > CEO_ATTACH_MAX_TOTAL_BYTES)
    return {
      error: `The files are ${formatSize(total)}: at most ${formatSize(CEO_ATTACH_MAX_TOTAL_BYTES)} per message`,
    };
  const big = files.find((f) => f.ext && f.data.length > CEO_IMAGE_MAX_BYTES);
  if (big)
    return {
      error: `${big.name} is ${formatSize(big.data.length)}: an image can be at most ${formatSize(CEO_IMAGE_MAX_BYTES)}`,
    };

  const dir = path.join(chatDir, ATTACHMENTS_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const saved: SavedAttachments = { attachments: [], images: [], lines: [] };
  for (const f of files) {
    let stored = `${crypto.randomBytes(4).toString('hex')}-${safeName(f.name)}`;
    if (f.ext && path.extname(stored).toLowerCase() !== f.ext) stored += f.ext;
    const abs = path.join(dir, stored);
    fs.writeFileSync(abs, f.data);
    const size = formatSize(f.data.length);
    saved.attachments.push({
      name: f.name,
      size: f.data.length,
      image: !!f.ext,
      url: `${CEO_API_PREFIX}/attachments/${chatId}/${encodeURIComponent(stored)}`,
    });
    if (f.ext) saved.images.push(abs);
    saved.lines.push(`[Attached ${f.ext ? 'image' : 'file'}: ${abs} (${f.name}, ${size})]`);
  }
  return saved;
}

/**
 * The file behind GET /api/ceo/attachments/:chat/:file, or null. Both parts
 * must match the names this module writes, so no path leaves the folder.
 */
export function attachmentFile(
  stateDir: string,
  chat: string,
  file: string,
): { path: string; type: string } | null {
  if (!CHAT_ID.test(chat) || !STORED_NAME.test(file)) return null;
  const dir = path.join(stateDir, CAT_CEO_DIR, CEO_DESK_CHATS_DIR, chat, ATTACHMENTS_DIR);
  const abs = path.join(dir, file);
  if (path.dirname(abs) !== dir || !fs.statSync(abs, { throwIfNoEntry: false })?.isFile())
    return null;
  const type = SERVED_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  return { path: abs, type };
}
