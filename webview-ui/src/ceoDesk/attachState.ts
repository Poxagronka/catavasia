/**
 * Pure rules of the dock's attachments (no DOM, so node tests import it):
 * which files a message may take, the downscale size of a big image, and the
 * size labels. The server checks the same limits (server/src/ceoDesk/attachments.ts).
 */

import {
  CEO_ATTACH_MAX_COUNT,
  CEO_ATTACH_MAX_TOTAL_BYTES,
  CEO_IMAGE_EDGE_PX,
  CEO_IMAGE_MAX_BYTES,
  CEO_IMAGE_TYPES,
  formatSize,
} from '../../../core/src/ceoDesk.js';

/** A file in the composer, ready to send. */
export interface DraftAttachment {
  id: number;
  name: string;
  /** The MIME type to send (a downscaled image is JPEG). */
  type: string;
  size: number;
  /** An image the CEO sees: the strip shows a thumbnail. */
  image: boolean;
  blob: Blob;
  /** Object URL of the thumbnail (images only). */
  preview?: string;
}

export function isImageType(type: string): boolean {
  return CEO_IMAGE_TYPES.includes(type);
}

/** An image the dock downscales before it sends (bigger than the server takes). */
export function needsDownscale(file: { type: string; size: number }): boolean {
  return isImageType(file.type) && file.size > CEO_IMAGE_MAX_BYTES;
}

/** The size of an image whose longest edge is at most `edge` (never upscaled). */
export function fitEdge(
  width: number,
  height: number,
  edge = CEO_IMAGE_EDGE_PX,
): { width: number; height: number } {
  const scale = Math.min(1, edge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Why `incoming` cannot join `current`, or null. Checked on add, so the user
 * sees the reason before Send.
 */
export function attachError(
  current: Array<{ size: number }>,
  incoming: Array<{ name: string; size: number; image: boolean }>,
): string | null {
  if (current.length + incoming.length > CEO_ATTACH_MAX_COUNT)
    return `At most ${CEO_ATTACH_MAX_COUNT} files per message`;
  const big = incoming.find((f) => f.image && f.size > CEO_IMAGE_MAX_BYTES);
  if (big)
    return `${big.name} is ${formatSize(big.size)}: an image can be at most ${formatSize(CEO_IMAGE_MAX_BYTES)}`;
  const total = [...current, ...incoming].reduce((sum, f) => sum + f.size, 0);
  if (total > CEO_ATTACH_MAX_TOTAL_BYTES)
    return `The files are ${formatSize(total)}: at most ${formatSize(CEO_ATTACH_MAX_TOTAL_BYTES)} per message`;
  return null;
}
