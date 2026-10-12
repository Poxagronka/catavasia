import { ClaudeAdapter } from '../orchestrator/claudeAdapter.js';
import { HelpDesk } from './helpDesk.js';

let desk: HelpDesk | undefined;

/** The one help chat of this process (standalone server or VS Code extension host). */
export function sharedHelpDesk(): HelpDesk {
  desk ??= new HelpDesk(new ClaudeAdapter());
  return desk;
}
