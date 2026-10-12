import type { Engine, EngineOptions } from '../cats/catsApi.js';
import { catsApi } from '../cats/catsClient.js';
import { closestEffort, closestModel } from './closestOffered.js';

const usable = (o: EngineOptions) => !o.unavailable && o.models.length > 0;

/**
 * Engine, model and effort for a cat made in the onboarding: Claude Code when it can run cats, else
 * Codex when only Codex can. The wanted model and effort give way to the closest offered ones.
 */
export function onboardingEngineDefaults(
  wantedModel: string,
  wantedEffort: string,
): { engine: Engine; model: string; effort: string } {
  const claude = catsApi.engineOptions('claude');
  const codex = catsApi.engineOptions('codex');
  const engine: Engine = !usable(claude) && usable(codex) ? 'codex' : 'claude';
  const options = engine === 'codex' ? codex : claude;
  return {
    engine,
    model: closestModel(wantedModel, options),
    effort: closestEffort(wantedEffort, options),
  };
}
