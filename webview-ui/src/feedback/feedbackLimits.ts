/**
 * Pure rules of the feedback form's images (no DOM, so node tests import it).
 * The server checks the same limits (server/src/feedback/githubFeedback.ts).
 */

import { formatSize } from '../../../core/src/ceoDesk.js';
import {
  FEEDBACK_IMAGE_EXTENSIONS,
  FEEDBACK_IMAGE_MAX_BYTES,
  FEEDBACK_MAX_IMAGES,
  FEEDBACK_MAX_TOTAL_BYTES,
} from '../../../core/src/constants.js';

/**
 * Why `incoming` cannot join `current`, or null. Checked on add, so the user
 * sees the reason before Send.
 */
export function feedbackAttachError(
  current: Array<{ size: number }>,
  incoming: Array<{ name: string; type: string; size: number }>,
): string | null {
  const other = incoming.find((f) => !Object.hasOwn(FEEDBACK_IMAGE_EXTENSIONS, f.type));
  if (other) return `${other.name} is not a PNG, JPEG, GIF or WebP image`;
  if (current.length + incoming.length > FEEDBACK_MAX_IMAGES)
    return `At most ${FEEDBACK_MAX_IMAGES} images`;
  const big = incoming.find((f) => f.size > FEEDBACK_IMAGE_MAX_BYTES);
  if (big)
    return `${big.name} is ${formatSize(big.size)}: an image can be at most ${formatSize(FEEDBACK_IMAGE_MAX_BYTES)}`;
  const total = [...current, ...incoming].reduce((sum, f) => sum + f.size, 0);
  if (total > FEEDBACK_MAX_TOTAL_BYTES)
    return `The images are ${formatSize(total)}: at most ${formatSize(FEEDBACK_MAX_TOTAL_BYTES)} together`;
  return null;
}
