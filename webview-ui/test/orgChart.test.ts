import { describe, expect, it } from 'vitest';

import type { CatProfile } from '../src/cats/catsApi.js';
import { buildTree, draftReport, HierarchyError } from '../src/cats/hierarchy.js';
import { createLocalCatsAdapter } from '../src/cats/localCatsAdapter.js';
import {
  type LaidOutNode,
  layoutOrgChart,
  NODE_H,
  NODE_W,
  STACK_AFTER,
} from '../src/cats/orgLayout.js';

const cat = (id: string, parentId: string | null): CatProfile => ({
  id,
  name: id,
  appearance: {},
  role: '',
  systemPrompt: '',
  engine: 'claude',
  model: 'sonnet',
  effort: 'medium',
  parentId,
});

/** 3 levels, 9 cats: boss → a (a1, a2), b (b1), c (c1, c2, c3). */
const team9 = () => [
  cat('boss', null),
  cat('a', 'boss'),
  cat('b', 'boss'),
  cat('c', 'boss'),
  cat('a1', 'a'),
  cat('a2', 'a'),
  cat('b1', 'b'),
  cat('c1', 'c'),
  cat('c2', 'c'),
];

const overlap = (p: LaidOutNode, q: LaidOutNode) =>
  p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
const centre = (n: LaidOutNode) => n.x + n.w / 2;
const at = (nodes: LaidOutNode[], id: string) => nodes.find((n) => n.id === id)!;

describe('org chart layout', () => {
  it('lays out every cat once and no two boxes overlap', () => {
    const { nodes, width, height } = layoutOrgChart(buildTree(team9()));
    expect(nodes.map((n) => n.id).sort()).toEqual(
      team9()
        .map((c) => c.id)
        .sort(),
    );
    for (const p of nodes) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x + p.w).toBeLessThanOrEqual(width);
      expect(p.y + p.h).toBeLessThanOrEqual(height);
      for (const q of nodes) if (p !== q) expect(overlap(p, q)).toBe(false);
    }
  });

  it('centres each parent over its reports, one level per row', () => {
    const { nodes } = layoutOrgChart(buildTree(team9()));
    const [boss, a, c] = ['boss', 'a', 'c'].map((id) => at(nodes, id));
    expect(centre(boss)).toBe((centre(a) + centre(c)) / 2);
    expect(centre(a)).toBe((centre(at(nodes, 'a1')) + centre(at(nodes, 'a2'))) / 2);
    expect(centre(at(nodes, 'b'))).toBe(centre(at(nodes, 'b1')));
    expect(a.y).toBeGreaterThan(boss.y + NODE_H);
    expect(at(nodes, 'a1').y).toBeGreaterThan(a.y + NODE_H);
    expect(a.y).toBe(c.y);
  });

  it('keeps sibling subtrees apart: wide subtrees push their neighbours', () => {
    const cats = [...team9(), cat('a3', 'a'), cat('a11', 'a1'), cat('a12', 'a1')];
    const { nodes } = layoutOrgChart(buildTree(cats));
    const a2 = at(nodes, 'a2');
    expect(at(nodes, 'b').x).toBeGreaterThanOrEqual(a2.x + NODE_W);
    for (const p of nodes) for (const q of nodes) if (p !== q) expect(overlap(p, q)).toBe(false);
  });

  it('is deterministic', () => {
    expect(layoutOrgChart(buildTree(team9()))).toEqual(layoutOrgChart(buildTree(team9())));
  });

  it(`stacks more than ${STACK_AFTER} leaf reports in one compact column`, () => {
    const leaves = Array.from({ length: STACK_AFTER + 1 }, (_, i) => cat(`l${i}`, 'boss'));
    const { nodes } = layoutOrgChart(buildTree([cat('boss', null), ...leaves]));
    const rows = nodes.filter((n) => n.compact);
    expect(rows.map((r) => r.id)).toEqual(leaves.map((l) => l.id));
    expect(new Set(rows.map((r) => r.x)).size).toBe(1);
    for (let i = 1; i < rows.length; i++) expect(rows[i].y).toBeGreaterThan(rows[i - 1].y);
  });

  it('draws one orthogonal connector per report', () => {
    const { connectors } = layoutOrgChart(buildTree(team9()));
    expect(connectors).toHaveLength(team9().length - 1);
    for (const { points } of connectors)
      for (let i = 1; i < points.length; i++)
        expect(points[i][0] === points[i - 1][0] || points[i][1] === points[i - 1][1]).toBe(true);
  });

  it('is empty without a boss', () => {
    expect(layoutOrgChart(null).nodes).toEqual([]);
  });
});

describe('chart edits', () => {
  const memoryStore = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: data.set.bind(data) };
  };
  const parentOf = (api: ReturnType<typeof createLocalCatsAdapter>, id: string) =>
    api.getSnapshot().cats.find((c) => c.id === id)?.parentId;

  it('adds a report under the clicked cat with the next free name', () => {
    const api = createLocalCatsAdapter(memoryStore());
    const before = api.getSnapshot().cats;
    const fresh = draftReport(
      before,
      'dev',
      'new',
      ['Marmalade', 'Shadow'],
      ['nikolai', 'shadow'],
      api.engineOptions('claude'),
    );
    expect(fresh).toMatchObject({
      name: 'Shadow',
      role: 'Worker',
      engine: 'claude',
      model: 'sonnet',
      parentId: 'dev',
      appearance: { breed: 'shadow' },
    });
    api.saveCat(fresh);
    expect(parentOf(api, 'new')).toBe('dev');
    expect(api.getSnapshot().cats).toHaveLength(before.length + 1);
  });

  it('takes the breed parallel to the name (a renamed breed keeps its id)', () => {
    const fresh = draftReport([], 'a', 'x', ['Biscuit'], ['nikolai'], {
      models: ['opus'],
      efforts: ['low'],
    });
    expect(fresh.appearance).toEqual({ breed: 'nikolai' });
  });

  it('falls back to "Cat N" when every listed name is taken', () => {
    const fresh = draftReport(team9(), 'a', 'x', ['a'], ['nikolai'], {
      models: ['opus'],
      efforts: ['low'],
    });
    expect(fresh.name).toBe('Cat 10');
    expect(fresh.model).toBe('opus');
  });

  it('deletes a cat and moves its reports up to its parent', () => {
    const api = createLocalCatsAdapter(memoryStore());
    api.saveCat({ ...cat('dev1', 'dev'), name: 'Dev one' });
    api.deleteCat('dev');
    expect(parentOf(api, 'dev1')).toBe('boss');
  });

  it('deleting the boss hands over to its first report', () => {
    const api = createLocalCatsAdapter(memoryStore());
    api.deleteCat('boss');
    expect(parentOf(api, 'dev')).toBeNull();
    expect(parentOf(api, 'qa')).toBe('dev');
  });

  it('refuses a link that makes a cycle', () => {
    const api = createLocalCatsAdapter(memoryStore());
    api.saveCat({ ...cat('dev1', 'dev'), name: 'Dev one' });
    expect(() => api.setParent('dev', 'dev1')).toThrow(HierarchyError);
    expect(parentOf(api, 'dev')).toBe('boss');
  });
});
