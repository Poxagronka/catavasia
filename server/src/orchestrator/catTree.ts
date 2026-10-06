/**
 * Cat tree helpers. Rules mirror webview-ui/src/cats/hierarchy.ts: the boss is
 * the one cat with `parentId: null`; every other cat reports to a known cat;
 * no cycles. Siblings share a parent.
 */

import type { CatProfile } from '../../../core/src/messages.js';

export function bossOf(cats: readonly CatProfile[]): CatProfile | undefined {
  return cats.find((c) => c.parentId === null);
}

export function childrenOf(cats: readonly CatProfile[], catId: string): CatProfile[] {
  return cats.filter((c) => c.parentId === catId);
}

export function hierarchyOf(cats: readonly CatProfile[]): {
  bossId?: string;
  children: Record<string, string[]>;
} {
  const children: Record<string, string[]> = {};
  for (const cat of cats) if (cat.parentId !== null) (children[cat.parentId] ??= []).push(cat.id);
  return { bossId: bossOf(cats)?.id, children };
}

/** True when `catId` is `ancestorId` or sits anywhere below it. */
export function isInSubtree(
  cats: readonly CatProfile[],
  ancestorId: string,
  catId: string,
): boolean {
  const byId = new Map(cats.map((c) => [c.id, c]));
  const seen = new Set<string>();
  let cur: string | null | undefined = catId;
  while (cur !== null && cur !== undefined && !seen.has(cur)) {
    if (cur === ancestorId) return true;
    seen.add(cur);
    cur = byId.get(cur)?.parentId;
  }
  return false;
}

/** Exactly one boss, every parent known, no cycles: a cat that breaks a rule reports to the boss. */
export function normalizeHierarchy(cats: readonly CatProfile[]): CatProfile[] {
  if (cats.length === 0) return [];
  const ids = new Set(cats.map((c) => c.id));
  const boss = bossOf(cats) ?? cats[0];
  const fixed = cats.map((c) => {
    if (c.id === boss.id) return { ...c, parentId: null };
    const bad = c.parentId === null || !ids.has(c.parentId) || c.parentId === c.id;
    return bad ? { ...c, parentId: boss.id } : c;
  });
  return fixed.map((c) =>
    c.parentId !== null && !isInSubtree(fixed, boss.id, c.id) ? { ...c, parentId: boss.id } : c,
  );
}

export type Relation = 'parent' | 'child' | 'sibling';

/** How `to` stands to `from` in the tree, or null when they are not adjacent. */
export function relationOf(cats: readonly CatProfile[], from: string, to: string): Relation | null {
  const a = cats.find((c) => c.id === from);
  const b = cats.find((c) => c.id === to);
  if (!a || !b || a.id === b.id) return null;
  if (a.parentId === b.id) return 'parent';
  if (b.parentId === a.id) return 'child';
  if (a.parentId !== null && a.parentId === b.parentId) return 'sibling';
  return null;
}
