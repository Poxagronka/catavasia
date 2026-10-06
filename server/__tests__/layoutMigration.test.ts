import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AgentStateStore } from '../src/agentStateStore.js';
import { loadDefaultLayout, loadPreviousDefaultLayouts } from '../src/assetLoader.js';
import { handleClientMessage } from '../src/clientMessageHandler.js';
import {
  isUnmodifiedDefault,
  loadLayout,
  migrateUnmodifiedLayout,
  readLayoutFromFile,
} from '../src/layoutPersistence.js';

/** Bundled assets of this checkout: the real old and new default offices. */
const ASSETS_ROOT = path.join(__dirname, '..', '..', 'webview-ui', 'public');

let tempHome: string;
let originalHome: string | undefined;

function layoutFile(): string {
  return path.join(tempHome, '.pixel-agents', 'layout.json');
}

function saveLayout(layout: unknown): void {
  fs.mkdirSync(path.dirname(layoutFile()), { recursive: true });
  fs.writeFileSync(layoutFile(), JSON.stringify(layout, null, 2));
}

const bundled = (rev: number) =>
  JSON.parse(
    fs.readFileSync(path.join(ASSETS_ROOT, 'assets', `default-layout-${rev}.json`), 'utf-8'),
  ) as Record<string, unknown>;
const oldDefault = () => bundled(1);

beforeEach(() => {
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-layout-'));
  originalHome = process.env.HOME;
  process.env.HOME = tempHome;
});

afterEach(() => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  fs.rmSync(tempHome, { recursive: true, force: true });
});

describe('default layout upgrade', () => {
  it('the newest bundled default has the lead desk; revisions 1 to 8 are previous', () => {
    const latest = loadDefaultLayout(ASSETS_ROOT)!;
    expect(latest.layoutRevision).toBe(9);
    const count = (type: string) =>
      (latest.furniture as Array<{ type: string }>).filter((f) => f.type === type).length;
    // The calm playroom of revision 4 stays.
    expect(count('SCRATCHING_POST')).toBe(1);
    expect(count('YARN_BALL')).toBe(1);
    expect(count('HOUSE_WOODEN')).toBe(1);
    expect(count('CAT_TREE')).toBe(0);
    expect(count('PET_BOWL')).toBe(1);
    // Revision 7: a hooded box in the lounge (where the open tray stood) and a smart box in the playroom.
    expect(count('LITTER_BOX')).toBe(0);
    expect(count('LITTER_BOX_HOODED')).toBe(1);
    expect(count('LITTER_BOX_SMART')).toBe(1);
    // The coffee station: espresso + pour-over on the main-room counter, a drip maker in the lounge.
    expect(count('ESPRESSO_MACHINE')).toBe(1);
    expect(count('POUR_OVER')).toBe(1);
    expect(count('DRIP_COFFEE_MAKER')).toBe(1);
    // The Cat CEO office: one executive desk and its reserved chair.
    expect(count('EXECUTIVE_DESK')).toBe(1);
    expect(count('EXECUTIVE_CHAIR_FRONT')).toBe(1);
    expect(count('CEO_PLAQUE')).toBe(1);
    // Revision 8: a laptop on the executive desk where the PC stood.
    expect(count('LAPTOP_BACK_OFF')).toBe(1);
    expect(count('PC_BACK')).toBe(0);
    // Revision 9: the team lead's desk and chair, the Tasks whiteboard, the clock kept.
    expect(count('LEAD_DESK_FRONT')).toBe(1);
    expect(count('LEAD_CHAIR_FRONT')).toBe(1);
    expect(count('WHITEBOARD')).toBe(1);
    expect(count('CLOCK')).toBe(1);
    // Revision 1 with the pet-care items, as it shipped before them, then revisions 2 to 8.
    const previous = loadPreviousDefaultLayouts(ASSETS_ROOT);
    expect(previous.map((l) => l.layoutRevision)).toEqual([1, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('revision 9 only rearranges the main work room around the lead desk', () => {
    type Item = { uid: string; type: string; col: number; row: number };
    const [rev8, rev9] = [bundled(8), bundled(9)];
    const items = (l: Record<string, unknown>) => l.furniture as Item[];
    const strip = (l: Record<string, unknown>) => {
      const { layoutRevision: _rev, furniture: _f, ...rest } = l;
      return rest;
    };
    expect(strip(rev9)).toEqual(strip(rev8));
    // Everything outside the main work room (cols 0 to 9) stays put.
    const outside = (l: Record<string, unknown>) => items(l).filter((f) => f.col > 9);
    expect(outside(rev9)).toEqual(outside(rev8));
    // Same uids in the room, plus the three new items.
    const uids = (l: Record<string, unknown>) => items(l).map((f) => f.uid);
    expect(
      uids(rev9)
        .filter((u) => !uids(rev8).includes(u))
        .sort(),
    ).toEqual(['f-lead-chair', 'f-lead-desk', 'f-tasks-whiteboard']);
    expect(uids(rev8).every((u) => uids(rev9).includes(u))).toBe(true);
    // The whiteboard hangs where the clock was; the clock moves one tile left.
    const find = (l: Record<string, unknown>, type: string) =>
      items(l).find((f) => f.type === type)!;
    const clock8 = find(rev8, 'CLOCK');
    expect(find(rev9, 'WHITEBOARD')).toMatchObject({ col: clock8.col, row: clock8.row });
    expect(find(rev9, 'CLOCK')).toMatchObject({ col: clock8.col - 1, row: clock8.row });
    // The lead sits at the head of the room, under the whiteboard, facing the workers.
    expect(find(rev9, 'LEAD_CHAIR_FRONT')).toMatchObject({ col: 5, row: 11 });
    expect(find(rev9, 'LEAD_DESK_FRONT')).toMatchObject({ col: 4, row: 12 });
  });

  it('upgrades an untouched revision 8 default to the lead desk one', () => {
    saveLayout(bundled(8));
    const latest = loadDefaultLayout(ASSETS_ROOT)!;

    const result = loadLayout(latest, loadPreviousDefaultLayouts(ASSETS_ROOT));

    expect(result).toEqual({ layout: latest, wasReset: true });
    expect(readLayoutFromFile()).toEqual(latest);
  });

  it('keeps an edited revision 8 office (no lead desk)', () => {
    const custom = bundled(8);
    (custom.furniture as unknown[]).pop();
    saveLayout(custom);

    const result = loadLayout(
      loadDefaultLayout(ASSETS_ROOT),
      loadPreviousDefaultLayouts(ASSETS_ROOT),
    );

    expect(result).toEqual({ layout: custom, wasReset: false });
    expect(readLayoutFromFile()).toEqual(custom);
  });

  it('revision 8 only swaps the PC on the executive desk for the laptop', () => {
    const strip = (l: Record<string, unknown>) => {
      const { layoutRevision: _rev, furniture, ...rest } = l;
      const items = furniture as Array<{ uid: string }>;
      return {
        rest,
        furniture: items.filter((f) => f.uid !== 'f-ceo-pc' && f.uid !== 'f-ceo-laptop'),
      };
    };
    const [rev7, rev8] = [bundled(7), bundled(8)];
    expect(strip(rev8)).toEqual(strip(rev7));
    const find = (l: Record<string, unknown>, uid: string) =>
      (l.furniture as Array<{ uid: string }>).find((f) => f.uid === uid);
    expect(find(rev7, 'f-ceo-pc')).toEqual({ uid: 'f-ceo-pc', type: 'PC_BACK', col: 34, row: 13 });
    expect(find(rev8, 'f-ceo-laptop')).toEqual({
      uid: 'f-ceo-laptop',
      type: 'LAPTOP_BACK_OFF',
      col: 34,
      row: 13,
    });
  });

  it("upgrades an untouched revision 7 default (the user's office) to revision 9", () => {
    saveLayout(bundled(7));
    const latest = loadDefaultLayout(ASSETS_ROOT)!;

    const result = loadLayout(latest, loadPreviousDefaultLayouts(ASSETS_ROOT));

    expect(result).toEqual({ layout: latest, wasReset: true });
    expect(readLayoutFromFile()).toEqual(latest);
    expect(latest.layoutRevision).toBe(9);
    // A second start finds the newest default and keeps it.
    expect(loadLayout(latest, loadPreviousDefaultLayouts(ASSETS_ROOT))).toEqual({
      layout: latest,
      wasReset: false,
    });
  });

  it('keeps an edited revision 7 office (its PC stays)', () => {
    const custom = bundled(7);
    (custom.furniture as unknown[]).pop();
    saveLayout(custom);

    const result = loadLayout(
      loadDefaultLayout(ASSETS_ROOT),
      loadPreviousDefaultLayouts(ASSETS_ROOT),
    );

    expect(result).toEqual({ layout: custom, wasReset: false });
    expect(readLayoutFromFile()).toEqual(custom);
  });

  it("upgrades an untouched revision 6 default (the user's office) to the newest", () => {
    saveLayout(bundled(6));
    const latest = loadDefaultLayout(ASSETS_ROOT)!;

    const result = loadLayout(latest, loadPreviousDefaultLayouts(ASSETS_ROOT));

    expect(result).toEqual({ layout: latest, wasReset: true });
    expect(readLayoutFromFile()).toEqual(latest);
    // The lounge box keeps its uid: its persisted piles stay with it.
    const uids = (l: Record<string, unknown>) =>
      (l.furniture as Array<{ uid: string; type: string }>).filter((f) =>
        f.type.startsWith('LITTER_BOX'),
      );
    expect(uids(bundled(6)).map((f) => f.uid)).toEqual(['f-litter-box']);
    expect(uids(latest).map((f) => [f.uid, f.type])).toEqual([
      ['f-litter-box', 'LITTER_BOX_HOODED'],
      ['f-litter-box-2', 'LITTER_BOX_SMART'],
    ]);
  });

  it('keeps an edited revision 6 office (its one open litter box stays)', () => {
    const custom = bundled(6);
    (custom.furniture as unknown[]).pop();
    saveLayout(custom);

    const result = loadLayout(
      loadDefaultLayout(ASSETS_ROOT),
      loadPreviousDefaultLayouts(ASSETS_ROOT),
    );

    expect(result).toEqual({ layout: custom, wasReset: false });
  });

  it('upgrades an untouched revision 5 default straight to revision 9', () => {
    saveLayout(bundled(5));
    const latest = loadDefaultLayout(ASSETS_ROOT)!;

    const result = loadLayout(latest, loadPreviousDefaultLayouts(ASSETS_ROOT));

    expect(result).toEqual({ layout: latest, wasReset: true });
    expect(latest.layoutRevision).toBe(9);
  });

  it("upgrades an untouched revision 5 default (the user's office) to the Cat CEO one", () => {
    saveLayout(bundled(5));
    const latest = loadDefaultLayout(ASSETS_ROOT)!;

    const result = loadLayout(latest, loadPreviousDefaultLayouts(ASSETS_ROOT));

    expect(result).toEqual({ layout: latest, wasReset: true });
    expect(readLayoutFromFile()).toEqual(latest);
  });

  it('keeps an edited revision 5 office', () => {
    const custom = bundled(5);
    (custom.furniture as unknown[]).pop();
    saveLayout(custom);

    const result = loadLayout(
      loadDefaultLayout(ASSETS_ROOT),
      loadPreviousDefaultLayouts(ASSETS_ROOT),
    );

    expect(result).toEqual({ layout: custom, wasReset: false });
  });

  it('upgrades an untouched revision 4 default to the newest', () => {
    saveLayout(bundled(4));
    const latest = loadDefaultLayout(ASSETS_ROOT)!;

    const result = loadLayout(latest, loadPreviousDefaultLayouts(ASSETS_ROOT));

    expect(result).toEqual({ layout: latest, wasReset: true });
    expect(readLayoutFromFile()).toEqual(latest);
  });

  it('keeps an edited revision 4 office', () => {
    const custom = bundled(4);
    (custom.furniture as unknown[]).pop();
    saveLayout(custom);

    const result = loadLayout(
      loadDefaultLayout(ASSETS_ROOT),
      loadPreviousDefaultLayouts(ASSETS_ROOT),
    );

    expect(result).toEqual({ layout: custom, wasReset: false });
  });

  it('upgrades an untouched revision 3 default (the full playroom) to the newest', () => {
    saveLayout(bundled(3));
    const latest = loadDefaultLayout(ASSETS_ROOT)!;

    const result = loadLayout(latest, loadPreviousDefaultLayouts(ASSETS_ROOT));

    expect(result).toEqual({ layout: latest, wasReset: true });
    expect(readLayoutFromFile()).toEqual(latest);
  });

  it('keeps an edited revision 3 office', () => {
    const custom = bundled(3);
    (custom.furniture as unknown[]).pop();
    saveLayout(custom);

    const result = loadLayout(
      loadDefaultLayout(ASSETS_ROOT),
      loadPreviousDefaultLayouts(ASSETS_ROOT),
    );

    expect(result).toEqual({ layout: custom, wasReset: false });
  });

  it('upgrades an untouched revision 2 default (the empty playroom) to the newest', () => {
    saveLayout(bundled(2));
    const latest = loadDefaultLayout(ASSETS_ROOT)!;

    const result = loadLayout(latest, loadPreviousDefaultLayouts(ASSETS_ROOT));

    expect(result).toEqual({ layout: latest, wasReset: true });
    expect(readLayoutFromFile()).toEqual(latest);
  });

  it('keeps an edited revision 2 office', () => {
    const custom = bundled(2);
    (custom.furniture as unknown[]).pop();
    saveLayout(custom);

    const result = loadLayout(
      loadDefaultLayout(ASSETS_ROOT),
      loadPreviousDefaultLayouts(ASSETS_ROOT),
    );

    expect(result).toEqual({ layout: custom, wasReset: false });
  });

  it('upgrades an untouched revision 1 default saved before the pet-care items', () => {
    const old = oldDefault();
    const furniture = old.furniture as Array<{ type: string }>;
    old.furniture = furniture.filter((f) => f.type !== 'PET_BOWL' && f.type !== 'LITTER_BOX');
    expect((old.furniture as unknown[]).length).toBe(furniture.length - 2);
    saveLayout(old);
    const latest = loadDefaultLayout(ASSETS_ROOT)!;

    const migrated = migrateUnmodifiedLayout(
      readLayoutFromFile(),
      latest,
      loadPreviousDefaultLayouts(ASSETS_ROOT),
    );

    expect(migrated).toBe(true);
    expect(readLayoutFromFile()).toEqual(latest);
  });

  it('upgrades an untouched old default to the new default', () => {
    saveLayout(oldDefault());
    const latest = loadDefaultLayout(ASSETS_ROOT)!;

    const migrated = migrateUnmodifiedLayout(
      readLayoutFromFile(),
      latest,
      loadPreviousDefaultLayouts(ASSETS_ROOT),
    );

    expect(migrated).toBe(true);
    expect(readLayoutFromFile()).toEqual(latest);
  });

  it('treats a re-saved but unchanged old default as untouched', () => {
    // A webview save adds empty optional fields and may reorder keys.
    const { furniture, ...rest } = oldDefault();
    const resaved = { pets: [], furniture: [...(furniture as unknown[])].reverse(), ...rest };
    expect(isUnmodifiedDefault(resaved, loadPreviousDefaultLayouts(ASSETS_ROOT))).toBe(true);
  });

  it('keeps a customized office and leaves the file alone', () => {
    const custom = oldDefault();
    (custom.furniture as Array<{ col: number }>)[0].col += 1;
    saveLayout(custom);
    const before = fs.readFileSync(layoutFile(), 'utf-8');

    const result = loadLayout(
      loadDefaultLayout(ASSETS_ROOT),
      loadPreviousDefaultLayouts(ASSETS_ROOT),
    );

    expect(result?.wasReset).toBe(false);
    expect(result?.layout).toEqual(custom);
    expect(fs.readFileSync(layoutFile(), 'utf-8')).toBe(before);
  });

  it('VS Code load: an untouched old default comes back as the new default, flagged as reset', () => {
    saveLayout(oldDefault());
    const latest = loadDefaultLayout(ASSETS_ROOT)!;
    const result = loadLayout(latest, loadPreviousDefaultLayouts(ASSETS_ROOT));
    expect(result).toEqual({ layout: latest, wasReset: true });
  });

  it('writes the new default when there is no saved layout', () => {
    const latest = loadDefaultLayout(ASSETS_ROOT)!;
    const result = loadLayout(latest, loadPreviousDefaultLayouts(ASSETS_ROOT));
    expect(result).toEqual({ layout: latest, wasReset: false });
    expect(readLayoutFromFile()).toEqual(latest);
  });

  it('the editor "Default" button writes the default office and sends it back', () => {
    const custom = oldDefault();
    saveLayout(custom);
    const latest = loadDefaultLayout(ASSETS_ROOT)!;
    const sent: Array<Record<string, unknown>> = [];

    handleClientMessage({ type: 'resetLayoutToDefault' }, (m) => sent.push(m), {
      store: new AgentStateStore(),
      cache: { defaultLayout: latest } as never,
    });

    expect(readLayoutFromFile()).toEqual(latest);
    expect(sent).toEqual([{ type: 'layoutLoaded', layout: latest }]);
  });
});
