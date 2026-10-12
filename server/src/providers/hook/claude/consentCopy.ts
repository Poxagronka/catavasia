/**
 * Disclosure text for the hooks consent gate. Both surfaces show the SAME
 * in-app ask: the server ships these strings in the `hooksConsentRequest`
 * message and the webview's IntroBubble (the greeter character's speech
 * bubble) renders them verbatim on the Intro's consent step, so there is
 * exactly one copy of the terms and no client-side duplicate to drift into
 * asking for approval on weaker terms.
 *
 * Two pieces: the HEADLINE is the title of the Intro's consent step and the
 * DISCLOSURE is that step's body. The headline carries NO disclosure facts —
 * every fact lives in the shared disclosure block, so no fact depends on how a
 * surface renders its title slot (consentCopy.test.ts pins that split).
 *
 * The event count is interpolated from CLAUDE_HOOK_EVENTS, never written out:
 * a hardcoded number silently becomes a lie the next time the list changes.
 *
 * The text lives in server/src/i18n/consent/<language>.ts and follows the chosen UI language.
 * The English exports below stay the default and the test reference.
 */

import { consent } from '../../../i18n/consent/en.js';
import { translate } from '../../../i18n/translate.js';
import { CLAUDE_HOOK_EVENTS, SETTINGS_BACKUP_SUFFIX } from './constants.js';

const SETTINGS_FILE = '~/.claude/settings.json';

/**
 * The consent ask in one language. The HEADLINE titles the Intro's consent step and carries NO disclosure facts.
 * The DISCLOSURE is its body: three facts as blank-line separated paragraphs, in order. WHY we ask and WHAT we
 * write, WHAT data moves and where it stops, HOW to undo it. The IntroBubble renders every paragraph in full on the
 * decision surface itself, with no "Details" affordance that would put the disclosure one click from the decision.
 *
 * "Nothing leaves your machine" is not something this prompt can promise: `npx pixel-agents --host 0.0.0.0` binds
 * the same server to every interface, and an accepted socket receives the store broadcasts
 * (server/src/httpServer.ts). So the data fact states the default and names the one thing that changes it.
 *
 * A user whose hooks a pre-consent version already installed is migrated silently (the migration only ever drops
 * events), so there is a single headline.
 */
export function consentCopy(language?: unknown): { headline: string; disclosure: string } {
  const params = {
    count: CLAUDE_HOOK_EVENTS.length,
    file: SETTINGS_FILE,
    backup: `settings.json${SETTINGS_BACKUP_SUFFIX}`,
  };
  return {
    headline: translate(consent, 'headline', language),
    disclosure: [
      translate(consent, 'what', language, params),
      translate(consent, 'data', language),
      translate(consent, 'reversible', language),
    ].join('\n\n'),
  };
}

/** The English headline: the first-run gate's default. */
export const CONSENT_INSTALL_HEADLINE = consentCopy().headline;

/** The English disclosure: the three facts as one block. */
export const CONSENT_DISCLOSURE = consentCopy().disclosure;
