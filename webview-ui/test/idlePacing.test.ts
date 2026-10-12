/**
 * Idle pacing: a deterministic headless run of the default office (seeded
 * RNG, fixed dt) with idle agent cats and pet cats. It measures walks per
 * minute, state changes per minute, the share of time walking and the mean
 * dwell per activity kind, and asserts the calm pacing (owner ask 2026-10-12:
 * about 3x calmer). A tuning regression back to the busy pacing fails it.
 *
 * Set IDLE_PACING_REPORT=1 to print the table.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeAll, beforeEach, test } from 'vitest';

import { buildFurnitureCatalog } from '../../core/src/assets/build.ts';
import { DESK_NAP_ID } from '../src/office/engine/deskNapActivities.js';
import { OfficeState } from '../src/office/engine/officeState.js';
import { mulberry32 } from '../src/office/engine/socialMoves.js';
import { buildDynamicCatalog } from '../src/office/layout/furnitureCatalog.js';
import { setPetTemplates } from '../src/office/sprites/petSpriteData.js';
import type { OfficeLayout, SpriteData } from '../src/office/types.js';
import { CharacterState } from '../src/office/types.js';

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');
const DT = 0.05;
const SIM_MIN = 30;
const SEEDS = [11, 23, 37, 41, 59];
const PIXEL: SpriteData = [['']];
const FRAMES = [PIXEL, PIXEL, PIXEL];

const KIND_OF: Record<string, string> = {
  sleep: 'sleep',
  bed: 'sleep',
  house: 'sleep',
  catBed: 'sleep',
  coffeeSip: 'coffee',
  coffee: 'coffee',
  brew: 'brew',
  yarn: 'play',
  mouse: 'play',
  teaser: 'play',
  box: 'play',
  catTree: 'play',
  tunnel: 'play',
  scratch: 'play',
  groom: 'groom',
  loaf: 'groom',
  [DESK_NAP_ID]: 'deskLounge',
  TYPE: 'computer',
};

beforeAll(() => {
  const catalog = buildFurnitureCatalog(ASSETS);
  const sprites: Record<string, SpriteData> = {};
  for (const c of catalog) {
    sprites[c.id] = c.id.includes('BOOKSHELF')
      ? Array.from({ length: c.height }, () => new Array<string>(c.width).fill('book'))
      : PIXEL;
  }
  assert.ok(buildDynamicCatalog({ catalog, sprites } as never));
  const sheet = { walkDown: FRAMES, idleDown: FRAMES, walkUp: FRAMES, idleUp: FRAMES };
  setPetTemplates([{ ...sheet, walkRight: FRAMES }], ['Gitcat'], ['cat']);
});

const realRandom = Math.random;
afterEach(() => {
  Math.random = realRandom;
});
beforeEach(() => {
  Math.random = mulberry32(1);
});

interface Tally {
  walks: number;
  changes: number;
  walkSec: number;
  sec: number;
  dwell: Map<string, { total: number; runs: number }>;
}

const tally = (): Tally => ({ walks: 0, changes: 0, walkSec: 0, sec: 0, dwell: new Map() });

/** One cat's tracker: feed it a label each step. */
class Track {
  readonly t = tally();
  private label = '';
  private run = 0;

  step(label: string): void {
    const t = this.t;
    t.sec += DT;
    if (label === 'walk') t.walkSec += DT;
    if (label !== this.label) {
      this.flush();
      if (this.label !== '') t.changes++;
      if (label === 'walk') t.walks++;
      this.label = label;
    }
    this.run += DT;
  }

  flush(): void {
    const kind = KIND_OF[this.label];
    if (kind && this.run > 0) {
      const d = this.t.dwell.get(kind) ?? { total: 0, runs: 0 };
      d.total += this.run;
      d.runs++;
      this.t.dwell.set(kind, d);
    }
    this.run = 0;
  }
}

function merge(into: Tally, from: Tally): void {
  into.walks += from.walks;
  into.changes += from.changes;
  into.walkSec += from.walkSec;
  into.sec += from.sec;
  for (const [k, v] of from.dwell) {
    const d = into.dwell.get(k) ?? { total: 0, runs: 0 };
    d.total += v.total;
    d.runs += v.runs;
    into.dwell.set(k, d);
  }
}

/** Three idle agent cats and two pet cats in the newest bundled office, 30 simulated minutes. */
function simulate(seed: number): { agents: Tally; pets: Tally } {
  Math.random = mulberry32(seed);
  const file = path.join(ASSETS, 'default-layout-10.json');
  const os = new OfficeState(JSON.parse(fs.readFileSync(file, 'utf-8')) as OfficeLayout);
  os.life.rng = mulberry32(seed + 1000);
  os.social.rng = mulberry32(seed + 2000);
  os.life.activitySocial.rng = mulberry32(seed + 3000);
  os.life.claims.spots.rng = mulberry32(seed + 4000);
  const agentIds = [1, 2, 3];
  for (const id of agentIds) {
    os.addAgent(id, 0, 0, undefined, true);
    os.setAgentActive(id, false);
    os.characters.get(id)!.state = CharacterState.IDLE;
  }
  os.addPet({ id: 'kit', petType: 0 });
  os.addPet({ id: 'tom', petType: 0 });
  const tracks = new Map<string, Track>();
  const track = (key: string) => tracks.get(key) ?? tracks.set(key, new Track()).get(key)!;
  for (let t = 0; t < SIM_MIN * 60; t += DT) {
    os.update(DT);
    for (const id of agentIds) {
      const ch = os.characters.get(id)!;
      const label =
        ch.state === CharacterState.WALK
          ? 'walk'
          : ch.state === CharacterState.TYPE
            ? 'TYPE'
            : ch.state === CharacterState.ACTIVITY
              ? (ch.activity?.id ?? 'idle')
              : 'idle';
      track(`a${id}`).step(label);
    }
    for (const pet of os.pets) {
      const claim = os.petCare.currentClaim(pet.id);
      const label = pet.careAnim
        ? (claim?.kind ?? pet.careAnim.kind)
        : pet.state === 'walk' || pet.state === 'follow'
          ? 'walk'
          : 'idle';
      track(`p${pet.id}`).step(label);
    }
  }
  const agents = tally();
  const pets = tally();
  for (const [key, tr] of tracks) {
    tr.flush();
    merge(key.startsWith('a') ? agents : pets, tr.t);
  }
  return { agents, pets };
}

export interface Report {
  walksPerMin: number;
  changesPerMin: number;
  walkShare: number;
  dwell: Record<string, number>;
}

function report(t: Tally, cats: number): Report {
  const mins = t.sec / 60;
  const dwell: Record<string, number> = {};
  for (const [k, v] of t.dwell) dwell[k] = v.total / v.runs;
  return {
    walksPerMin: t.walks / mins,
    changesPerMin: t.changes / mins,
    walkShare: t.walkSec / t.sec,
    dwell: { ...dwell, cats },
  };
}

function run(): { agents: Report; pets: Report } {
  const agents = tally();
  const pets = tally();
  for (const seed of SEEDS) {
    const r = simulate(seed);
    merge(agents, r.agents);
    merge(pets, r.pets);
  }
  return { agents: report(agents, 3 * SEEDS.length), pets: report(pets, 2 * SEEDS.length) };
}

const fmt = (n: number | undefined) => (n === undefined ? '-' : n.toFixed(2));

test('idle cats are calm: few walks, few state changes, long stays', { timeout: 120_000 }, () => {
  const { agents, pets } = run();
  if (process.env.IDLE_PACING_REPORT) {
    for (const [name, r] of [
      ['agents', agents],
      ['pets', pets],
    ] as const) {
      const kinds = Object.keys(r.dwell).filter((k) => k !== 'cats');
      console.log(
        `${name}: walks/min ${fmt(r.walksPerMin)} changes/min ${fmt(r.changesPerMin)} ` +
          `walk share ${fmt(r.walkShare)} dwell ` +
          kinds.map((k) => `${k}=${fmt(r.dwell[k])}`).join(' '),
      );
    }
  }
  // Busy pacing measured on 2026-10-12: agents 2.21 walks and 5.41 changes per min, walk
  // share 0.16; pets 3.46 walks, 12.40 changes, share 0.36. Limits are one third of that.
  assert.ok(agents.walksPerMin <= 0.74, `agent walks/min ${fmt(agents.walksPerMin)}`);
  assert.ok(agents.changesPerMin <= 1.8, `agent changes/min ${fmt(agents.changesPerMin)}`);
  assert.ok(agents.walkShare <= 0.07, `agent walk share ${fmt(agents.walkShare)}`);
  assert.ok(pets.walksPerMin <= 1.16, `pet walks/min ${fmt(pets.walksPerMin)}`);
  assert.ok(pets.changesPerMin <= 4.1, `pet changes/min ${fmt(pets.changesPerMin)}`);
  assert.ok(pets.walkShare <= 0.14, `pet walk share ${fmt(pets.walkShare)}`);
  // Mean dwell: about 3x the busy pacing (sleep 46 s, coffee 17 s, desk 167 s; pets nap 5-6 s).
  for (const [kind, min] of Object.entries(AGENT_MIN_DWELL)) {
    assert.ok((agents.dwell[kind] ?? 0) >= min, `agent ${kind} dwell ${fmt(agents.dwell[kind])}s`);
  }
  for (const [kind, min] of Object.entries(PET_MIN_DWELL)) {
    assert.ok((pets.dwell[kind] ?? 0) >= min, `pet ${kind} dwell ${fmt(pets.dwell[kind])}s`);
  }
});

const AGENT_MIN_DWELL: Record<string, number> = {
  computer: 380,
  sleep: 100,
  coffee: 35,
  groom: 25,
  play: 14,
};
const PET_MIN_DWELL: Record<string, number> = { sleep: 15, deskLounge: 15, play: 14 };
