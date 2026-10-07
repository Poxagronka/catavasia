/**
 * Unit tests for the cat social layer (engine/catSocial.ts).
 *
 * Covers encounter selection (proximity, both idle, cooldowns, pair
 * avoidance after a fight), the fight roll under a seeded RNG, interrupt on
 * work, bubble priority, full talk / chase / fight scenes on an open map, and
 * how a fight's standoff ends (fight or back down) by personality.
 */
import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
  SOCIAL_CAT_COOLDOWN_SEC,
  SOCIAL_FIGHT_AVOID_SEC,
  SOCIAL_FIGHT_CHANCE,
  SOCIAL_PAIR_COOLDOWN_SEC,
  SOCIAL_STANDOFF_FIGHT_CHANCE,
} from '../src/constants.js';
import {
  canSocialize,
  CatSocial,
  rollKind,
  socialBubbleVisible,
} from '../src/office/engine/catSocial.js';
import { createCharacter } from '../src/office/engine/characters.js';
import { meetTile, mulberry32, type SocialWorld } from '../src/office/engine/socialMoves.js';
import { standoffFightChance } from '../src/office/engine/socialScenes.js';
import type { Character, TileType as TileTypeVal } from '../src/office/types.js';
import { CharacterState, Direction, TILE_SIZE, TileType } from '../src/office/types.js';

const COLS = 16;
const ROWS = 10;
const DT = 1 / 30;

function openWorld(): SocialWorld {
  const tileMap: TileTypeVal[][] = [];
  const walkableTiles: Array<{ col: number; row: number }> = [];
  for (let r = 0; r < ROWS; r++) {
    const row: TileTypeVal[] = [];
    for (let c = 0; c < COLS; c++) {
      row.push(TileType.FLOOR_1 as TileTypeVal);
      walkableTiles.push({ col: c, row: r });
    }
    tileMap.push(row);
  }
  return { tileMap, walkableTiles, blockedTiles: new Set() };
}

function idleCat(id: number, col: number, row: number): Character {
  const ch = createCharacter(id, id % 13, null, null);
  ch.isActive = false;
  ch.state = CharacterState.IDLE;
  ch.tileCol = col;
  ch.tileRow = row;
  ch.x = col * TILE_SIZE + TILE_SIZE / 2;
  ch.y = row * TILE_SIZE + TILE_SIZE / 2;
  ch.wanderTimer = 999; // no random wandering inside the tests
  return ch;
}

function office(...cats: Character[]): Map<number, Character> {
  return new Map(cats.map((c) => [c.id, c]));
}

/** Run `seconds` of game time; the social layer only (the FSM is not needed). */
function run(
  social: CatSocial,
  chars: Map<number, Character>,
  world: SocialWorld,
  seconds: number,
) {
  for (let t = 0; t < seconds; t += DT) social.update(DT, chars, world);
}

/** An rng that never starts random encounters (the scan roll fails). */
const quietRng = () => 0.99;

test('canSocialize: only idle / walking cats that are not working, sub-agents or spawning', () => {
  const ch = idleCat(1, 2, 2);
  assert.equal(canSocialize(ch), true);
  assert.equal(canSocialize({ ...ch, isActive: true }), false);
  assert.equal(canSocialize({ ...ch, isSubagent: true }), false);
  assert.equal(canSocialize({ ...ch, matrixEffect: 'despawn' }), false);
  assert.equal(canSocialize({ ...ch, state: CharacterState.TYPE }), false);
  assert.equal(canSocialize({ ...ch, state: CharacterState.WALK }), true);
});

test('findEncounterPair: closest idle pair within the radius', () => {
  const social = new CatSocial({ rng: quietRng });
  const a = idleCat(1, 2, 2);
  const b = idleCat(2, 4, 2); // 2 tiles from a
  const c = idleCat(3, 3, 3); // 1 tile from a and b
  const far = idleCat(4, 12, 8);
  assert.deepEqual(
    social.findEncounterPair([a, b, far])?.map((x) => x.id),
    [1, 2],
  );
  const pair = social.findEncounterPair([a, b, c, far])!.map((x) => x.id);
  assert.ok(pair.includes(3), 'closest pair wins');
  assert.equal(social.findEncounterPair([a, far]), null, 'too far apart');
  b.isActive = true;
  assert.equal(social.findEncounterPair([a, b, far]), null, 'a working cat never meets');
});

test('trySocialEncounter refuses far, busy or working cats', () => {
  const social = new CatSocial({ rng: quietRng });
  const a = idleCat(1, 2, 2);
  const b = idleCat(2, 9, 2);
  assert.equal(social.trySocialEncounter(a, b, { kind: 'talk' }), null, 'too far');
  b.tileCol = 3;
  assert.equal(social.trySocialEncounter(a, b, { kind: 'talk' }), 'talk');
  const c = idleCat(3, 2, 3);
  assert.equal(social.trySocialEncounter(a, c, { kind: 'talk' }), null, 'a is busy');
  // An activity encounter reaches further and never becomes play.
  const d = idleCat(4, 10, 6);
  const e = idleCat(5, 13, 6);
  assert.equal(social.trySocialEncounter(d, e, { activity: 'coffee', kind: 'play' }), 'talk');
});

test('cooldowns: per cat and per pair after a scene', () => {
  const world = openWorld();
  const social = new CatSocial({ rng: quietRng });
  const a = idleCat(1, 2, 2);
  const b = idleCat(2, 3, 2);
  const c = idleCat(3, 2, 3);
  const chars = office(a, b, c);
  assert.equal(social.trySocialEncounter(a, b, { kind: 'talk' }), 'talk');
  run(social, chars, world, 20);
  assert.equal(social.isInScene(1), false, 'talk finished');
  assert.equal(social.isPairReady(1, 3), false, 'a rests after a scene');
  run(social, chars, world, SOCIAL_CAT_COOLDOWN_SEC);
  assert.equal(social.isPairReady(1, 3), true, 'a can meet someone new');
  assert.equal(social.isPairReady(1, 2), false, 'but not the same cat yet');
  run(social, chars, world, SOCIAL_PAIR_COOLDOWN_SEC);
  assert.equal(social.isPairReady(1, 2), true);
});

test('a pair that fought avoids each other for SOCIAL_FIGHT_AVOID_SEC', () => {
  const world = openWorld();
  // Low rolls while the fight runs (its standoff ends in the cloud), then no new encounters.
  let fighting = true;
  const social = new CatSocial({ rng: () => (fighting ? 0.01 : 0.99) });
  // Already head to tail: no walk needed (this test runs no character FSM).
  const a = idleCat(1, 6, 4);
  const b = idleCat(2, 6, 5);
  const chars = office(a, b);
  assert.equal(social.trySocialEncounter(a, b, { kind: 'fight' }), 'fight');
  run(social, chars, world, 12);
  assert.equal(social.isInScene(1), false, 'fight finished');
  fighting = false;
  run(social, chars, world, SOCIAL_PAIR_COOLDOWN_SEC + 1);
  assert.equal(social.isPairReady(1, 2), false, 'still avoiding after a normal pair cooldown');
  assert.equal(social.isPairReady(1, 3), true, 'other cats are fine');
  run(social, chars, world, SOCIAL_FIGHT_AVOID_SEC - SOCIAL_PAIR_COOLDOWN_SEC);
  assert.equal(social.isPairReady(1, 2), true);
});

test('rollKind: fight is about 1 in 15 under a seeded RNG, and reproducible', () => {
  const rng = mulberry32(42);
  const n = 30000;
  let fights = 0;
  for (let i = 0; i < n; i++) if (rollKind(rng, false) === 'fight') fights++;
  assert.ok(Math.abs(fights / n - SOCIAL_FIGHT_CHANCE) < 0.006, `fight rate ${fights / n}`);
  const seq = (seed: number) => {
    const r = mulberry32(seed);
    return Array.from({ length: 20 }, () => rollKind(r, false)).join(',');
  };
  assert.equal(seq(5), seq(5));
  assert.equal(
    rollKind(() => 0, false),
    'fight',
  );
  assert.equal(
    rollKind(() => 0.99, false),
    'talk',
  );
  assert.notEqual(
    rollKind(() => SOCIAL_FIGHT_CHANCE + 0.001, true),
    'play',
    'no play at a spot',
  );
});

test('talk: cats face each other and alternate pictogram bubbles', () => {
  const world = openWorld();
  const social = new CatSocial({ rng: mulberry32(3) });
  const a = idleCat(1, 4, 4);
  const b = idleCat(2, 5, 4);
  const chars = office(a, b);
  social.trySocialEncounter(a, b, { kind: 'talk' });
  const speakers = new Set<number>();
  for (let t = 0; t < 4; t += DT) {
    social.update(DT, chars, world);
    for (const ch of [a, b]) if (ch.social?.bubble) speakers.add(ch.id);
  }
  assert.equal(a.dir, Direction.RIGHT);
  assert.equal(b.dir, Direction.LEFT);
  assert.deepEqual([...speakers].sort(), [1, 2], 'both cats spoke');
});

test('interrupt: a cat that gets work leaves at once and the partner resumes idle', () => {
  const world = openWorld();
  const ended: Array<[number, string]> = [];
  const social = new CatSocial({
    rng: () => 0.01, // the shortest standoff, and it ends in a fight
    onSceneEnd: (id, _k, r) => ended.push([id, r]),
  });
  const a = idleCat(1, 4, 4);
  const b = idleCat(2, 4, 5);
  const chars = office(a, b);
  social.trySocialEncounter(a, b, { kind: 'fight' });
  for (let t = 0; t < 10 && a.social?.pose !== 'hidden'; t += DT) social.update(DT, chars, world);
  assert.equal(a.social?.pose, 'hidden', 'past the standoff: both hidden in the cloud');
  a.isActive = true;
  social.update(DT, chars, world);
  assert.equal(social.isInScene(1), false);
  assert.equal(social.isInScene(2), false);
  assert.equal(a.social, undefined);
  assert.equal(b.social, undefined, 'partner is visible again');
  assert.ok(b.wanderTimer < 5, 'partner gets a short pause, then wanders');
  assert.deepEqual(ended, [
    [1, 'interrupted'],
    [2, 'interrupted'],
  ]);
  // A cat that despawns counts as leaving too.
  const c = idleCat(3, 8, 8);
  const d = idleCat(4, 9, 8);
  chars.set(3, c).set(4, d);
  social.trySocialEncounter(c, d, { kind: 'talk' });
  chars.delete(4);
  social.update(DT, chars, world);
  assert.equal(social.isInScene(3), false);
});

test('bubble priority: permission / waiting bubbles hide social pictograms', () => {
  const ch = idleCat(1, 1, 1);
  assert.equal(socialBubbleVisible(ch), true);
  ch.bubbleType = 'permission';
  assert.equal(socialBubbleVisible(ch), false);
  ch.bubbleType = 'waiting';
  ch.waitingAwaitingInput = true;
  assert.equal(socialBubbleVisible(ch), false);
});

test('chase play: both run faster and tag swaps the chaser', () => {
  const world = openWorld();
  const social = new CatSocial({ rng: mulberry32(11) });
  const a = idleCat(1, 6, 5);
  const b = idleCat(2, 7, 5);
  const chars = office(a, b);
  assert.equal(social.startJointPlay(a, b, { kind: 'chase' }), true);
  social.update(DT, chars, world);
  assert.equal(social.sceneInfo(1)?.phase, 'chase');
  assert.ok((a.speedMul ?? 1) > 1 && (b.speedMul ?? 1) > 1);
  assert.equal(social.sceneInfo(1)?.kind, 'play');
  run(social, chars, world, 10);
  assert.equal(social.isInScene(1), false, 'chase ends');
  assert.equal(a.speedMul, undefined);
});

test('toy joint play: cats walk to their spots and take turns', () => {
  const world = openWorld();
  const social = new CatSocial({ rng: quietRng });
  const a = idleCat(1, 3, 3);
  const b = idleCat(2, 5, 3);
  const chars = office(a, b);
  const turns: number[] = [];
  const ok = social.startJointPlay(a, b, {
    kind: 'toy',
    toyId: 'yarn',
    spots: [
      { col: 3, row: 3 },
      { col: 5, row: 3 },
    ],
    turnSec: 1,
    onTurn: (id) => turns.push(id),
  });
  assert.equal(ok, true);
  run(social, chars, world, 3.5);
  assert.deepEqual(turns.slice(0, 3), [1, 2, 1]);
});

test('a cat that sits down at its seat mid-scene leaves it, facing its desk', () => {
  const world = openWorld();
  const social = new CatSocial({ rng: quietRng });
  const a = idleCat(1, 4, 4);
  const b = idleCat(2, 5, 4);
  const chars = office(a, b);
  social.trySocialEncounter(a, b, { kind: 'talk' });
  run(social, chars, world, 1);
  // The FSM sat a down (arrived at its seat): state TYPE, facing the desk.
  a.state = CharacterState.TYPE;
  a.dir = Direction.UP;
  social.update(DT, chars, world);
  assert.equal(social.isInScene(1), false);
  assert.equal(social.isInScene(2), false);
  assert.equal(a.dir, Direction.UP, 'the scene no longer turns it');
});

test('leave(): a user walk command wins over the scene, the partner stops', () => {
  const world = openWorld();
  const ended: Array<[number, string]> = [];
  const social = new CatSocial({
    rng: mulberry32(11),
    onSceneEnd: (id, _k, r) => ended.push([id, r]),
  });
  const a = idleCat(1, 6, 5);
  const b = idleCat(2, 7, 5);
  const chars = office(a, b);
  social.startJointPlay(a, b, { kind: 'chase' });
  run(social, chars, world, 1);
  const userPath = [
    { col: 6, row: 6 },
    { col: 6, row: 7 },
  ];
  a.path = userPath;
  social.leave(1);
  social.update(DT, chars, world);
  assert.equal(social.isInScene(1), false);
  assert.deepEqual(a.path, userPath, 'the user path is kept');
  assert.equal(a.speedMul, undefined);
  assert.ok(b.path.length <= 1, 'the partner stops chasing');
  assert.deepEqual(ended, [
    [1, 'interrupted'],
    [2, 'interrupted'],
  ]);
});

test('meetTile: a cat directly above its partner moves beside it (sprites would overlap)', () => {
  const world = openWorld();
  const host = idleCat(1, 6, 5);
  const above = idleCat(2, 6, 4);
  const spot = meetTile(above, host, world, new Set(['6,5', '6,4']));
  assert.ok(spot && spot.row === 5 && Math.abs(spot.col - 6) === 1, JSON.stringify(spot));
  const beside = idleCat(3, 7, 5);
  assert.equal(meetTile(beside, host, world, new Set()), null, 'already side by side');
});

/** How a fight's standoff ends for a head-to-tail pair: 'unpuff' (fight) or 'backDown'. */
function standoffOutcome(
  rng: () => number,
  pa?: Character['personality'],
  pb?: Character['personality'],
): string {
  const social = new CatSocial({ rng });
  const a = idleCat(1, 6, 4);
  const b = idleCat(2, 6, 5);
  a.personality = pa;
  b.personality = pb;
  const chars = office(a, b);
  social.trySocialEncounter(a, b, { kind: 'fight' });
  for (let t = 0; t < 15; t += DT) {
    social.update(DT, chars, world0);
    const phase = social.sceneInfo(1)?.phase;
    if (phase === 'unpuff' || phase === 'backDown') return phase;
  }
  return 'none';
}
const world0 = openWorld();

test('standoff: the fight share follows the personalities (scrappy > default > social)', () => {
  const rate = (pa?: Character['personality'], pb?: Character['personality']) => {
    const rng = mulberry32(17);
    const n = 150;
    let fights = 0;
    for (let i = 0; i < n; i++) if (standoffOutcome(rng, pa, pb) === 'unpuff') fights++;
    return fights / n;
  };
  const scrappy = rate('scrappy', 'scrappy');
  const plain = rate();
  const social = rate('social', 'social');
  assert.ok(scrappy > plain && plain > social, `${scrappy} > ${plain} > ${social}`);
  assert.ok(scrappy > 0.85 && social < 0.25, `scrappy ${scrappy}, social ${social}`);
  assert.equal(
    standoffFightChance(idleCat(1, 0, 0), idleCat(2, 0, 0)),
    SOCIAL_STANDOFF_FIGHT_CHANCE,
  );
});

test('standoff back down: the less scrappy cat backs down', () => {
  const social = new CatSocial({ rng: () => 0.99 }); // no fight
  const a = idleCat(1, 6, 4);
  const b = idleCat(2, 6, 5);
  a.personality = 'scrappy';
  const chars = office(a, b);
  social.trySocialEncounter(a, b, { kind: 'fight' });
  for (let t = 0; t < 15 && social.sceneInfo(1)?.phase !== 'backDown'; t += DT)
    social.update(DT, chars, world0);
  run(social, chars, world0, 0.5);
  assert.ok(b.path.length >= 2, 'the default cat walks off');
  assert.equal(a.path.length, 0, 'the scrappy cat holds its ground');
  assert.equal(a.social?.pose, 'standoff', 'the winner still holds its puff');
});
