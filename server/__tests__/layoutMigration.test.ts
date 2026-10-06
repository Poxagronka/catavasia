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
  it('the newest bundled default has the furnished playroom; revisions 1 and 2 are previous', () => {
    const latest = loadDefaultLayout(ASSETS_ROOT)!;
    expect(latest.layoutRevision).toBe(3);
    const furniture = latest.furniture as Array<{ type: string }>;
    expect(furniture.filter((f) => f.type === 'SCRATCHING_POST')).toHaveLength(1);
    expect(furniture.filter((f) => f.type === 'CAT_TREE')).toHaveLength(1);
    expect(furniture.filter((f) => f.type === 'PET_BOWL')).toHaveLength(1);
    expect(furniture.filter((f) => f.type === 'LITTER_BOX')).toHaveLength(1);
    // Revision 1 with the pet-care items, as it shipped before them, then revision 2.
    const previous = loadPreviousDefaultLayouts(ASSETS_ROOT);
    expect(previous.map((l) => l.layoutRevision)).toEqual([1, 1, 2]);
  });

  it('upgrades an untouched revision 2 default (the empty playroom) to revision 3', () => {
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
