// Owner rule: money shows only to API users. Claude Code signs in with an API
// key (pay per use) -> costs show; a subscription or an unknown login -> every
// $ stays hidden. Codex reports no cost, so the Claude login decides.

import { catsApi } from '../cats/catsClient.js';
import { useCats } from '../cats/useCats.js';

/** Costs show only when the server's last probe saw an API key login. */
export function useMoneyShown(): boolean {
  useCats(); // re-render when the engine status changes
  return catsApi.engineOptions('claude').status?.apiKey === true;
}
