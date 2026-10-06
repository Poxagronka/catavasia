// Type declarations for poses.mjs, so the webview can reuse the generator.

import type { Breed, Cell } from './breeds.mjs';

/** rows[dir][frame] = 32x16 grid of resolved cells (null = empty). Dirs: down, up, right. */
export function renderCatFrames(cat: Breed): Array<Array<Array<Array<Cell | null>>>>;

/** Activity pose names in sheet order: sheet frame = 7 + index. */
export const POSE_NAMES: string[];
