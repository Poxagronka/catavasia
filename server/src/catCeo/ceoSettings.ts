/**
 * The `catCeo` block of cats.json (cat-ceo-judge.md §2) and the fixed text of
 * the judge: its default Role & conduct and the judge rules of §5.3.
 */

import type { CatAppearance, CatProfile } from '../../../core/src/messages.js';
import { CAT_CEO_COLLAR, CAT_CEO_EDITS_PER_DAY_DEFAULT, CAT_CEO_ID } from '../constants.js';
import { type EngineCatalog, validateCat } from '../orchestrator/catProfiles.js';

export interface CeoSettings {
  enabled: boolean;
  name: string;
  appearance: CatAppearance;
  model: string;
  effort: string;
  maxEditsPerCatPerDay: number;
}

/** A tuxedo cat with a gold collar: the boss of the boss. */
export const CEO_DEFAULTS: CeoSettings = {
  enabled: true,
  name: 'Cat CEO',
  appearance: { breed: 'tux', pattern: 'tuxedo', collar: CAT_CEO_COLLAR },
  model: 'opus',
  effort: 'high',
  maxEditsPerCatPerDay: CAT_CEO_EDITS_PER_DAY_DEFAULT,
};

export const CEO_DEFAULT_ROLE =
  'You are the Cat CEO of a pixel office of AI cats. You review finished team tasks, ' +
  'score each cat fairly on evidence, and keep their Rules and Lessons short and useful. ' +
  'You are strict about tests and the office protocol, and calm in tone.';

/** The fixed judge rules (§5.3, §5.5), after the Role in the judge's system prompt. */
export const JUDGE_RULES = `# Judge rules (fixed by the office)

- The user message is a digest of one finished team task. It is all you know. You have no tools.
- Score every assignment (assignmentId = its id, catId = the child) and the lead's own work (assignmentId "root", catId = the lead) with the rubric. Use only cat ids that appear in the digest.
- Rubric, 0-100 each, score = weighted sum: goalFit 30 (the diff and report do what was asked), verification 20 (relevant tests/lint/build ran and the report states the result truthfully), protocol 20 (used report, no nudge, answered asks, worked only in its folder, did not push), scope 15 (no edits outside its part, no merge conflict; a lead split work without overlap), efficiency 15 (turns and cost fit the change; no auto-compaction).
- Cite evidence from the digest for every score below 70.
- verdict: "pass" when every score >= 70 and no high anomaly; "fail" when a score < 40 or a cat caused the task error; else "concerns".
- bubble: at most 40 characters, a short and kind line about that cat's work, e.g. "forgot the tests".
- Report an anomaly only with evidence from the digest. Propose an edit only for an anomaly with severity medium or high, and list its anomaly ids.
- Rules hold behaviour ("Run the tests before you report"). Lessons hold facts about the repo or tools.
- Prefer "replace" of a weak item over "add". At most 3 edits per cat. Item text: one line, at most 240 characters, no markdown headings, no code fences.
- Never edit "Role & conduct". Never edit the Cat CEO. Never add praise, names of people, secrets, tokens, or paths outside the repo.
- When the work is fine, return no edits.
- Write summary, bubble, evidence and item text in English, whatever the language of the digest.`;

/** The settings in cats.json, with defaults for absent or bad fields (old files have none). */
export function readCeoSettings(raw: unknown): CeoSettings {
  const rec = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const merged = { ...CEO_DEFAULTS };
  if (typeof rec.enabled === 'boolean') merged.enabled = rec.enabled;
  const checked = checkCeoPatch(rec, merged);
  return checked.ok ? checked.value : merged;
}

/** A pseudo profile of the judge: the resident character and the profile checks use it. */
export function ceoProfile(s: CeoSettings, role = ''): CatProfile {
  return {
    id: CAT_CEO_ID,
    name: s.name,
    appearance: s.appearance,
    role: 'Cat CEO',
    systemPrompt: role,
    engine: 'claude',
    model: s.model,
    effort: s.effort,
    parentId: null,
  };
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Apply a settings change. Name, look, model and effort pass the same checks
 * as a cat profile (with the CLI catalog when given).
 */
export function checkCeoPatch(
  patch: Record<string, unknown>,
  current: CeoSettings,
  catalog?: EngineCatalog,
): Result<CeoSettings> {
  const next: CeoSettings = { ...current };
  if (patch.enabled !== undefined) {
    if (typeof patch.enabled !== 'boolean')
      return { ok: false, error: 'enabled must be true or false' };
    next.enabled = patch.enabled;
  }
  if (patch.maxEditsPerCatPerDay !== undefined) {
    const n = patch.maxEditsPerCatPerDay;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 10) {
      return { ok: false, error: 'maxEditsPerCatPerDay must be an integer 0-10' };
    }
    next.maxEditsPerCatPerDay = n;
  }
  const profile = validateCat(
    {
      ...ceoProfile(next),
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.appearance !== undefined ? { appearance: patch.appearance } : {}),
      ...(patch.model !== undefined ? { model: patch.model } : {}),
      ...(patch.effort !== undefined ? { effort: patch.effort } : {}),
    },
    catalog,
  );
  if (!profile.ok) return profile;
  const { name, appearance, model, effort } = profile.value;
  return { ok: true, value: { ...next, name, appearance, model, effort } };
}
