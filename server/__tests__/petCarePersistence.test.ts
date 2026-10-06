import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AgentStateStore } from '../src/agentStateStore.js';
import { handleClientMessage } from '../src/clientMessageHandler.js';
import { PETS_STATE_MAX_BYTES } from '../src/constants.js';
import { FileStateAdapter } from '../src/fileStateAdapter.js';
import { readPetCareState, writePetCareState } from '../src/petCarePersistence.js';

describe('pet-care persistence (~/.pixel-agents/pets-state.json)', () => {
  let tempHome: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-petcare-test-'));
    originalHome = process.env.HOME;
    process.env.HOME = tempHome;
  });

  afterEach(() => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  const snapshot = {
    version: 1,
    savedAt: 1_700_000_000_000,
    pets: { cat: { needs: { hunger: 40 }, bowel: 10 } },
    bowls: { bowl: { food: 50, water: 75 } },
    boxes: { box: 2 },
    litter: { box: 6 },
    floorPoops: [{ id: 'p1', col: 3, row: 4 }],
  };

  it('round-trips a snapshot', () => {
    expect(readPetCareState()).toBeNull();
    expect(writePetCareState(snapshot)).toBe(true);
    expect(readPetCareState()).toEqual(snapshot);
    expect(fs.existsSync(path.join(tempHome, '.pixel-agents', 'pets-state.json.tmp'))).toBe(false);
  });

  it('refuses non-objects and oversized payloads', () => {
    expect(writePetCareState(null)).toBe(false);
    expect(writePetCareState([1, 2])).toBe(false);
    expect(writePetCareState({ junk: 'x'.repeat(PETS_STATE_MAX_BYTES) })).toBe(false);
    expect(readPetCareState()).toBeNull();
  });

  it('reads a corrupt file as null', () => {
    fs.mkdirSync(path.join(tempHome, '.pixel-agents'), { recursive: true });
    fs.writeFileSync(path.join(tempHome, '.pixel-agents', 'pets-state.json'), '{nope');
    expect(readPetCareState()).toBeNull();
  });

  it('savePetCare writes and webviewReady sends petCareLoaded after layoutLoaded', () => {
    const store = new AgentStateStore();
    store.setAdapter(new FileStateAdapter({ namespace: 'standalone' }));
    const sent: Array<Record<string, unknown>> = [];
    const ctx = { store, cache: null };
    handleClientMessage({ type: 'savePetCare', state: snapshot }, (m) => sent.push(m), ctx);
    handleClientMessage({ type: 'webviewReady' }, (m) => sent.push(m), ctx);
    const types = sent.map((m) => m.type);
    expect(types.indexOf('petCareLoaded')).toBeGreaterThan(types.indexOf('layoutLoaded'));
    expect(sent.find((m) => m.type === 'petCareLoaded')).toEqual({
      type: 'petCareLoaded',
      state: snapshot,
    });
    store.dispose();
  });
});
