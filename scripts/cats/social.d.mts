// Type declarations for social.mjs, so the webview can reuse the generator.

import type { Breed, Cell } from './breeds.mjs';

type Grid = Array<Array<Cell | null>>;

/** Talk frames of one breed per direction (down, up, right). */
export function renderSocialCatFrames(
  breed: Breed,
): Record<'down' | 'up' | 'right', { talk: Grid[] }>;
