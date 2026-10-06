// Pure hierarchy operations over the cat list. The boss is the one cat with
// parentId === null. Every function returns a new array and keeps that rule.

import type { CatProfile, EngineOptions } from './catsApi.js';

export interface TreeNode {
  cat: CatProfile;
  children: TreeNode[];
}

export class HierarchyError extends Error {}

export function findBoss(cats: readonly CatProfile[]): CatProfile | undefined {
  return cats.find((c) => c.parentId === null);
}

/** True when `id` is `ancestorId` or sits anywhere below it. */
export function isInSubtree(cats: readonly CatProfile[], ancestorId: string, id: string): boolean {
  const byId = new Map(cats.map((c) => [c.id, c]));
  const seen = new Set<string>();
  let cur: string | null | undefined = id;
  while (cur != null && !seen.has(cur)) {
    if (cur === ancestorId) return true;
    seen.add(cur);
    cur = byId.get(cur)?.parentId;
  }
  return false;
}

/**
 * Repair the tree: exactly one boss, every parentId points to a known cat, no
 * cycles. Cats that break a rule report to the boss.
 */
export function normalizeHierarchy(cats: readonly CatProfile[]): CatProfile[] {
  if (cats.length === 0) return [];
  const ids = new Set(cats.map((c) => c.id));
  const boss = findBoss(cats) ?? cats[0];
  const fixed = cats.map((c) => {
    if (c.id === boss.id) return c.parentId === null ? c : { ...c, parentId: null };
    const bad = c.parentId === null || !ids.has(c.parentId) || c.parentId === c.id;
    return bad ? { ...c, parentId: boss.id } : c;
  });
  // A cycle never reaches the boss: cut it at its first member.
  return fixed.map((c) =>
    c.parentId !== null && !isInSubtree(fixed, boss.id, c.id) ? { ...c, parentId: boss.id } : c,
  );
}

/** Make `id` report to `parentId`. Rejects self, unknown cats and cycles. */
export function moveCat(cats: readonly CatProfile[], id: string, parentId: string): CatProfile[] {
  if (!cats.some((c) => c.id === id) || !cats.some((c) => c.id === parentId))
    throw new HierarchyError('unknown cat');
  if (isInSubtree(cats, id, parentId))
    throw new HierarchyError('a cat cannot report to itself or to one of its reports');
  return cats.map((c) => (c.id === id ? { ...c, parentId } : c));
}

/** `id` becomes the boss, the old boss reports to it. Other links stay. */
export function promoteToBoss(cats: readonly CatProfile[], id: string): CatProfile[] {
  const boss = findBoss(cats);
  if (!cats.some((c) => c.id === id)) throw new HierarchyError('unknown cat');
  if (!boss || boss.id === id) return cats.slice();
  return cats.map((c) => {
    if (c.id === id) return { ...c, parentId: null };
    if (c.id === boss.id) return { ...c, parentId: id };
    return c;
  });
}

/** Remove a cat. Its reports move to its parent; a deleted boss hands over to its first report. */
export function removeCat(cats: readonly CatProfile[], id: string): CatProfile[] {
  const gone = cats.find((c) => c.id === id);
  if (!gone) return cats.slice();
  const rest = cats.filter((c) => c.id !== id);
  let heir = gone.parentId;
  if (heir === null) heir = rest.find((c) => c.parentId === id)?.id ?? null;
  return rest.map((c) => {
    if (c.id === heir && gone.parentId === null) return { ...c, parentId: null };
    return c.parentId === id ? { ...c, parentId: heir } : c;
  });
}

/** Tree from the boss down, children in list order. */
export function buildTree(cats: readonly CatProfile[]): TreeNode | null {
  const boss = findBoss(cats);
  if (!boss) return null;
  const build = (cat: CatProfile, seen: Set<string>): TreeNode => {
    seen.add(cat.id);
    const children = cats
      .filter((c) => c.parentId === cat.id && !seen.has(c.id))
      .map((c) => build(c, seen));
    return { cat, children };
  };
  return build(boss, new Set());
}

/**
 * A new direct report of `parentId`: the first free name of `names` (else
 * "Cat N"), role "Worker", sonnet / medium when offered. `breeds` is parallel
 * to `names` (char_N order): the breed follows the name ("Biscuit" -> nikolai).
 */
export function draftReport(
  cats: readonly CatProfile[],
  parentId: string,
  id: string,
  names: readonly string[],
  breeds: readonly string[],
  options: EngineOptions,
): CatProfile {
  const taken = new Set(cats.map((c) => c.name));
  let name = names.find((n) => !taken.has(n));
  for (let n = cats.length + 1; !name; n++) if (!taken.has(`Cat ${n}`)) name = `Cat ${n}`;
  return {
    id,
    name,
    appearance: { breed: breeds[names.indexOf(name)] ?? breeds[0] },
    role: 'Worker',
    systemPrompt: '',
    engine: 'claude',
    model: options.models.includes('sonnet') ? 'sonnet' : options.models[0],
    effort: options.efforts.includes('medium') ? 'medium' : options.efforts[0],
    parentId,
  };
}
