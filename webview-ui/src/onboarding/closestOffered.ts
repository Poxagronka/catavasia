import type { EngineOptions } from '../cats/catsApi.js';

/** Effort levels from the lightest to the heaviest: the closest offered one stands in for a missing one. */
const EFFORT_ORDER = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

/** The wanted model when offered, else an offered model that names it (a full name), else the first one. */
export function closestModel(wanted: string, options: EngineOptions): string {
  if (options.models.includes(wanted)) return wanted;
  const family = options.models.find((m) => m.includes(wanted));
  return family ?? options.models[0] ?? wanted;
}

/** The wanted effort when offered, else the offered level nearest to it on the scale. */
export function closestEffort(wanted: string, options: EngineOptions): string {
  if (options.efforts.includes(wanted)) return wanted;
  const rank = (e: string) => EFFORT_ORDER.indexOf(e);
  const target = rank(wanted);
  const ranked = options.efforts.filter((e) => rank(e) >= 0);
  if (target < 0 || !ranked.length) return options.efforts[0] ?? wanted;
  return ranked.reduce((best, e) =>
    Math.abs(rank(e) - target) < Math.abs(rank(best) - target) ? e : best,
  );
}
