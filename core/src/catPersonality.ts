/**
 * Idle behaviour presets of office cats, shared by the server (cats.json,
 * CEO settings) and the webview (pickers, engine). The wire type is
 * `CatPersonality` (asyncapi.yaml). The tuning lives in webview-ui constants.
 */

import type { CatPersonality } from './messages.js';

export const CAT_PERSONALITY_IDS = [
  'scrappy',
  'playful',
  'pooper',
  'sleepy',
  'social',
  'zoomie',
] as const satisfies readonly CatPersonality[];

export function isCatPersonality(v: unknown): v is CatPersonality {
  return (CAT_PERSONALITY_IDS as readonly unknown[]).includes(v);
}
