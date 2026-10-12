import {
  type CatTemplate,
  TEMPLATE_BOSS_MODEL,
  TEMPLATE_EFFORT,
  TEMPLATE_WORKER_MODEL,
} from '../../../core/src/catTemplates.js';
import type { CatProfile } from '../cats/catsApi.js';
import { catsApi } from '../cats/catsClient.js';
import { onboardingEngineDefaults } from './engineDefaults.js';

/** The template's cats as profiles, the boss first. A model or effort the engine does not offer gives way to the closest one. */
export function templateProfiles(template: CatTemplate): CatProfile[] {
  const [boss] = template.cats;
  return template.cats.map((c, i) => ({
    id: c.id,
    name: c.name,
    appearance: c.appearance,
    role: c.role,
    systemPrompt: c.prompt,
    personality: c.personality,
    ...onboardingEngineDefaults(
      i === 0 ? TEMPLATE_BOSS_MODEL : TEMPLATE_WORKER_MODEL,
      TEMPLATE_EFFORT,
    ),
    parentId: i === 0 ? null : boss.id,
  }));
}

/** Save a whole team through the Cats API. Returns the error text, or null when every cat was saved. */
export function applyTemplate(template: CatTemplate): string | null {
  try {
    for (const profile of templateProfiles(template)) catsApi.saveCat(profile);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
