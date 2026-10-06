/**
 * Cat CEO tidy, pure parts (docs/catavasia/cat-ceo-judge.md §14): the output
 * schema and its check, the validator (locked Role, user-item protection, net
 * size, merge citations, dedupe, secrets, change cap), and the item history
 * read from the prompts repo.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { judgeArgs } from '../src/catCeo/judgeRunner.js';
import { buildTidyDigest, itemHistory, type ItemMeta } from '../src/catCeo/tidyDigest.js';
import { planTidy } from '../src/catCeo/tidyPatch.js';
import { parseTidyOutput, TIDY_SCHEMA, type TidyOp } from '../src/catCeo/tidySchema.js';
import type { PromptFile } from '../src/orchestrator/promptFile.js';
import { PromptRepo } from '../src/orchestrator/promptRepo.js';

const ROLE = 'I am murka.\nBe kind.';
const FILE: PromptFile = {
  role: ROLE,
  rules: [
    { id: 'R1', text: 'Write short commit messages.' },
    { id: 'R2', text: 'Run npm test before you report. (task t1, 2026-10-01)' },
    { id: 'R3', text: 'Always run the tests before the report. (task t2, 2026-10-02)' },
    { id: 'R4', text: 'Use the office report tool to finish an assignment. (task t3, 2026-10-03)' },
  ],
  lessons: [
    { id: 'L1', text: 'The webview tests need npm run build:core first. (task t4, 2026-10-04)' },
    { id: 'L2', text: 'The repo uses vitest.' },
  ],
};

const ceo: ItemMeta = { owner: 'cat-ceo', addedBy: 'cat-ceo', kinds: [] };
const user: ItemMeta = { owner: 'user', addedBy: 'user', kinds: [] };
const META = new Map<string, ItemMeta>([
  ['R1', user],
  ['R2', ceo],
  ['R3', ceo],
  ['R4', ceo],
  ['L1', ceo],
  ['L2', user],
]);

const ctx = (userItems = false) => ({
  meta: META,
  userItems,
  mergeSuffix: '(tidy td-1, 2026-10-06)',
});
const op = (o: Partial<TidyOp>): TidyOp => ({
  op: 'remove',
  section: 'Rules',
  itemIds: [],
  reason: 'r',
  ...o,
});
const chars = (f: PromptFile) => [...f.rules, ...f.lessons].reduce((n, i) => n + i.text.length, 0);

describe('tidy schema', () => {
  it('passes the tidy schema to the CLI and checks the output shape', () => {
    const args = judgeArgs({
      model: 'sonnet',
      effort: 'low',
      systemPrompt: 'x',
      budgetUsd: 1,
      schema: TIDY_SCHEMA,
    });
    expect(JSON.parse(args[args.indexOf('--json-schema') + 1])).toEqual(TIDY_SCHEMA);
    expect(TIDY_SCHEMA.properties.ops.items.properties.op.enum).toEqual([
      'merge',
      'rewrite',
      'remove',
      'keep',
    ]);
    const ok = parseTidyOutput({
      summary: 's',
      ops: [{ op: 'merge', section: 'Rules', itemIds: ['R2', 'R3'], text: 't', reason: 'dup\n' }],
    });
    expect(ok).toMatchObject({ ok: true, value: { ops: [{ op: 'merge', reason: 'dup ' }] } });
    expect(parseTidyOutput({ summary: 's', ops: [{ op: 'add', section: 'Rules' }] }).ok).toBe(
      false,
    );
    expect(
      parseTidyOutput({ summary: 's', ops: [{ op: 'keep', section: 'Rules', itemIds: [1] }] }),
    ).toMatchObject({ ok: false, error: 'ops[0].itemIds: not a list of ids' });
    expect(parseTidyOutput([]).ok).toBe(false);
  });
});

describe('tidy validator', () => {
  it('merges cited items into one new id at the first source, rewrites in place, removes', () => {
    const plan = planTidy(
      FILE,
      [
        op({ op: 'merge', itemIds: ['R2', 'R3'], text: 'Run npm test before you report.' }),
        op({ op: 'rewrite', itemIds: ['R4'], text: 'Finish with the report tool.' }),
        op({ op: 'remove', section: 'Lessons', itemIds: ['L1'] }),
        op({ op: 'keep', itemIds: ['R1'] }),
      ],
      ctx(),
    );
    expect(plan.rejected).toEqual([]);
    expect(plan.file.role).toBe(ROLE);
    expect(plan.file.rules).toEqual([
      { id: 'R1', text: 'Write short commit messages.' },
      { id: 'R5', text: 'Run npm test before you report. (tidy td-1, 2026-10-06)' },
      // A rewrite keeps the id and the provenance suffix.
      { id: 'R4', text: 'Finish with the report tool. (task t3, 2026-10-03)' },
    ]);
    expect(plan.file.lessons.map((i) => i.id)).toEqual(['L2']);
    expect(plan.rows.map((r) => [r.op, r.applied, r.before.map((i) => i.id), r.after?.id])).toEqual(
      [
        ['merge', true, ['R2', 'R3'], 'R5'],
        ['rewrite', true, ['R4'], 'R4'],
        ['remove', true, ['L1'], undefined],
      ],
    );
    expect(chars(plan.file)).toBeLessThan(chars(FILE));
  });

  it('needs citations: two or more sources for a merge, known ids, each id once', () => {
    const plan = planTidy(
      FILE,
      [
        op({ op: 'merge', itemIds: ['R2'], text: 'x' }),
        op({ op: 'remove', itemIds: ['R9'] }),
        op({ op: 'remove', itemIds: ['L1'] }),
        op({ op: 'remove', itemIds: ['R2'] }),
        op({ op: 'rewrite', itemIds: ['R2'], text: 'Run tests.' }),
        op({ op: 'rewrite', itemIds: ['R3', 'R4'], text: 'x' }),
        op({ op: 'merge', itemIds: ['R3', 'R4'] }),
      ],
      ctx(),
    );
    expect(plan.rejected.map((r) => r.reason)).toEqual([
      'a merge cites two or more source ids',
      'R9 is not a Rules item',
      'L1 is not a Rules item',
      'R2 is in another op already',
      'a rewrite has exactly one item id',
      'empty text',
    ]);
    expect(plan.file.rules.map((i) => i.id)).toEqual(['R1', 'R3', 'R4']);
  });

  it('never grows the items: a longer rewrite or merge is refused', () => {
    const long = 'Run npm test in your own folder before you report, every single time. Always.';
    const plan = planTidy(
      FILE,
      [
        op({ op: 'rewrite', itemIds: ['R2'], text: long }),
        op({ op: 'merge', itemIds: ['R3', 'R4'], text: `${long} ${long}` }),
        op({ op: 'rewrite', itemIds: ['R3'], text: 'Always run the tests before the report.' }),
      ],
      ctx(),
    );
    expect(plan.rejected.map((r) => r.reason)).toEqual([
      'the new text is longer than the items it replaces',
      'the new text is longer than the items it replaces',
      'the rewrite does not change the text',
    ]);
    expect(plan.file).toEqual(FILE);
  });

  it('marks user items instead of changing them, unless the user allows merges and rewrites', () => {
    const ops = [
      op({ op: 'remove', itemIds: ['R1'] }),
      op({ op: 'rewrite', section: 'Lessons', itemIds: ['L2'], text: 'Tests use vitest.' }),
    ];
    const off = planTidy(FILE, ops, ctx(false));
    expect(off.file).toEqual(FILE);
    expect(off.rows.map((r) => [r.op, r.applied])).toEqual([
      ['remove', false],
      ['rewrite', false],
    ]);
    const on = planTidy(FILE, ops, ctx(true));
    // A remove of a user item stays a mark even then.
    expect(on.rows.map((r) => [r.op, r.applied])).toEqual([
      ['remove', false],
      ['rewrite', true],
    ]);
    expect(on.file.rules.map((i) => i.id)).toContain('R1');
    expect(on.file.lessons[1]).toEqual({ id: 'L2', text: 'Tests use vitest.' });
    // An item without history counts as the user's.
    expect(planTidy(FILE, [ops[0]], { ...ctx(), meta: new Map() }).rows[0].applied).toBe(false);
  });

  it('refuses secrets, headings and duplicates of a staying item; caps the changes', () => {
    const plan = planTidy(
      FILE,
      [
        op({ op: 'rewrite', itemIds: ['R2'], text: 'See /Users/me/x' }),
        op({ op: 'rewrite', itemIds: ['R3'], text: '# Rules' }),
        op({ op: 'rewrite', itemIds: ['R4'], text: 'write short commit messages' }),
      ],
      ctx(),
    );
    expect(plan.rejected.map((r) => r.reason)).toEqual([
      'text looks like a secret or a private path',
      'text starts with #',
      'the same idea is already another item',
    ]);
    const many: PromptFile = {
      role: ROLE,
      rules: Array.from({ length: 10 }, (_, i) => ({ id: `R${i + 1}`, text: `rule ${i + 1}` })),
      lessons: [],
    };
    const meta = new Map(many.rules.map((r) => [r.id, ceo]));
    const capped = planTidy(
      many,
      many.rules.map((r) => op({ itemIds: [r.id] })),
      { ...ctx(), meta },
    );
    expect(capped.rows).toHaveLength(8);
    expect(capped.rejected.map((r) => r.reason)).toEqual([
      'at most 8 changes per tidy',
      'at most 8 changes per tidy',
    ]);
    expect(capped.file.role).toBe(ROLE);
  });
});

describe('item history', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-tidy-'));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('reads who added and changed each item from the prompts repo', () => {
    const repo = new PromptRepo(path.join(tmp, 'prompts'));
    const base = { role: ROLE, rules: [{ id: 'R1', text: 'mine' }], lessons: [] };
    repo.write('murka', base, 'user(murka): create');
    const added = {
      ...base,
      rules: [...base.rules, { id: 'R2', text: 'judge (task t1, 2026-10-01)' }],
    };
    repo.write(
      'murka',
      added,
      'cat-ceo(murka): add R2',
      'Task: t1 "x"\nAnomalies: no_tests_run\n\nPrompt-Edit-By: cat-ceo\nPrompt-Review: rv-1',
    );
    const both = {
      ...added,
      rules: [...added.rules, { id: 'R3', text: 'judge 2 (task t2, 2026-10-02)' }],
    };
    repo.write('murka', both, 'cat-ceo(murka): add R3', 'Prompt-Edit-By: cat-ceo');
    repo.write(
      'murka',
      { ...both, rules: both.rules.map((r) => (r.id === 'R3' ? { ...r, text: 'edited' } : r)) },
      'user(murka): edit R3',
    );
    const meta = itemHistory('murka', repo);
    expect(meta.get('R1')).toMatchObject({ owner: 'user', addedBy: 'user' });
    expect(meta.get('R2')).toMatchObject({
      owner: 'cat-ceo',
      reviewId: 'rv-1',
      taskId: 't1',
      kinds: ['no_tests_run'],
    });
    expect(meta.get('R3')).toMatchObject({ owner: 'user', addedBy: 'cat-ceo', editedBy: 'user' });
    const digest = buildTidyDigest({
      catId: 'murka',
      file: repo.read('murka').file,
      meta,
      reviews: [
        {
          reviewId: 'rv-2',
          taskId: 't9',
          title: 't',
          at: Date.now() + 1000,
          verdict: 'concerns',
          summary: 'murka skipped tests again, see R2',
          scores: [{ catId: 'murka', assignmentId: 'a1', score: 60, bubble: 'b' }],
          anomalies: [
            { id: 'x', catId: 'murka', kind: 'no_tests_run', severity: 'medium', evidence: 'R2' },
          ],
          edits: [],
          rejected: [],
        },
      ],
    });
    expect(digest).toContain('## Role & conduct (read-only context: never edit)');
    expect(digest).toContain('- R2: judge (task t1, 2026-10-01)');
    expect(digest).toMatch(/owner: cat-ceo; added \d{4}-\d{2}-\d{2} by cat-ceo; task t1/);
    expect(digest).toContain('reviews since 1; cited 1; same anomaly again 1');
    expect(digest).toContain('task t9, concerns, score 60');
  });
});
