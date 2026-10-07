/**
 * Scene steps for the cat social layer (see catSocial.ts for the API).
 * One function per phase; each writes the cats' render view and paths and
 * returns 'done' when the scene is over. All randomness comes from the cast's rng.
 */
import {
  SOCIAL_ANGER_FRAME_SEC,
  SOCIAL_APPROACH_TIMEOUT_SEC,
  SOCIAL_BACKDOWN_MAX_TILES,
  SOCIAL_BACKDOWN_MIN_TILES,
  SOCIAL_BACKDOWN_SPEED_MUL,
  SOCIAL_CHASE_DURATION_SEC,
  SOCIAL_CHASE_RANGE_MAX_TILES,
  SOCIAL_CHASE_RANGE_MIN_TILES,
  SOCIAL_CHASE_REPATH_SEC,
  SOCIAL_CHASE_ROAM_TILES,
  SOCIAL_CHASE_SPEED_MUL,
  SOCIAL_CLOUD_FOOT_OFFSET_PX,
  SOCIAL_CLOUD_FRAME_SEC,
  SOCIAL_FIGHT_ANGER_SEC,
  SOCIAL_FIGHT_CLOUD_SEC,
  SOCIAL_FIGHT_FLEE_SEC,
  SOCIAL_FLEE_MIN_TILES,
  SOCIAL_FLEE_SPEED_MUL,
  SOCIAL_FLICK_FRAME_SEC,
  SOCIAL_GREET_BOOP_SEC,
  SOCIAL_GREET_RUB_CHANCE,
  SOCIAL_GREET_RUB_SEC,
  SOCIAL_STANDOFF_CRAB_EVERY_LOOPS,
  SOCIAL_STANDOFF_CRAB_PX,
  SOCIAL_STANDOFF_FIGHT_CHANCE,
  SOCIAL_STANDOFF_FIGHT_MAX,
  SOCIAL_STANDOFF_FIGHT_MIN,
  SOCIAL_STANDOFF_IN_FRAME_SEC,
  SOCIAL_STANDOFF_MAX_SEC,
  SOCIAL_STANDOFF_MIN_SEC,
  SOCIAL_STANDOFF_PEAK_HOLD_SEC,
  SOCIAL_STANDOFF_SEARCH_TILES,
  SOCIAL_STANDOFF_SWAY_FRAME_SEC,
  SOCIAL_STANDOFF_WINNER_HOLD_SEC,
  SOCIAL_TAG_BUBBLE_SEC,
  SOCIAL_TAG_COOLDOWN_SEC,
  SOCIAL_TALK_BUBBLE_SEC,
  SOCIAL_TALK_GAP_SEC,
  SOCIAL_TALK_MOUTH_SEC,
  SOCIAL_TOY_DURATION_SEC,
  SOCIAL_TOY_TURN_SEC,
} from '../../constants.js';
import type { Character, CharacterSocialView, SocialIcon } from '../types.js';
import { CharacterState, Direction, TILE_SIZE } from '../types.js';
import type { JointPlay } from './catSocial.js';
import { pairMul, personalityMul } from './personality.js';
import type { SocialWorld, Tile } from './socialMoves.js';
import {
  faceEachOther,
  fleeTile,
  meetTile,
  standoffTiles,
  stopAfterStep,
  tileAwayFrom,
  tileDistance,
  tileOf,
  walkTo,
} from './socialMoves.js';

export type SocialKind = 'talk' | 'play' | 'fight';
export type ScenePhase =
  | 'approach'
  | 'greet'
  | 'talk'
  | 'chase'
  | 'toy'
  | 'standoff'
  | 'unpuff'
  | 'backDown'
  | 'cloud'
  | 'flee';

export interface Scene {
  kind: SocialKind;
  a: number;
  b: number;
  phase: ScenePhase;
  /** Seconds in the current phase. */
  t: number;
  /** Cats keep their spots (activity encounter): no walking up, no chase. */
  stationary: boolean;
  location?: Tile;
  play?: JointPlay;
  /** Talk: bubbles left. */
  exchanges: number;
  /** Index (0 = a, 1 = b) of the speaker / chaser / toy turn, or of the cat that backs down. */
  turn: number;
  /** Phase-local timer (chase re-path, toy turn). */
  timer: number;
  /** The paths of the current phase were issued (approach, back down). */
  issued: boolean;
  /** Talk: icon in the current bubble, and the previous one (no repeats). */
  icon: SocialIcon | null;
  lastIcon: SocialIcon | null;
  /** Chase: seconds since the last tag. */
  tagT: number;
  /** Chase: tile the play started on; the runner stays near it. */
  home?: Tile;
  /** Greet: index of the cat that rubs its head on the other, or -1 for none. */
  rubber?: number;
  /** Standoff: seconds of swaying before the fight / back-down roll. */
  standoffSec?: number;
  /** Fight: the cat that backs down when the standoff ends without a fight (a lost spot contest). */
  loserId?: number;
}

export interface SceneCast {
  a: Character;
  b: Character;
  world: SocialWorld;
  rng: () => number;
  /** "col,row" of every character, so a cat does not walk onto another. */
  occupied: Set<string>;
}

type StepResult = 'running' | 'done';

const ICONS: SocialIcon[] = ['fish', 'heart', 'question', 'exclaim', 'meow', 'mouse'];
/** Wander pause kept on scene cats so the FSM does not walk them off. */
const HOLD_SEC = 1;
/** Chase: target picks per tick, and the extra path length allowed around obstacles. */
const CHASE_TARGET_TRIES = 6;
const CHASE_DETOUR_TILES = 2;

function view(ch: Character): CharacterSocialView {
  if (!ch.social) ch.social = { pose: null, frame: 0, bubble: null, anger: null, cloud: null };
  return ch.social;
}

function settled(ch: Character): boolean {
  return ch.path.length === 0 && ch.state !== CharacterState.WALK;
}

function enter(s: Scene, phase: ScenePhase): void {
  s.phase = phase;
  s.t = 0;
  s.timer = 0;
}

const pulse = (t: number, frameSec: number, frames: number) => Math.floor(t / frameSec) % frames;

export function stepScene(s: Scene, cast: SceneCast, dt: number): StepResult {
  s.t += dt;
  const { a, b } = cast;
  for (const ch of [a, b]) ch.wanderTimer = Math.max(ch.wanderTimer, HOLD_SEC);
  view(a);
  view(b);
  switch (s.phase) {
    case 'approach':
      return approach(s, cast);
    case 'greet':
      return greet(s, cast);
    case 'talk':
      return talk(s, cast);
    case 'chase':
      return chase(s, cast, dt);
    case 'toy':
      return toy(s, cast, dt);
    case 'standoff':
      return standoff(s, cast);
    case 'unpuff':
      return unpuff(s, cast);
    case 'backDown':
      return backDown(s, cast);
    case 'cloud':
      return cloud(s, cast);
    case 'flee':
      return flee(s, cast);
  }
}

function approach(s: Scene, cast: SceneCast): StepResult {
  const { a, b, world } = cast;
  if (!s.issued) {
    if (s.t > SOCIAL_APPROACH_TIMEOUT_SEC) return 'done';
    if (!settled(a) || !settled(b)) return 'running';
    s.issued = true;
    if (s.play?.kind === 'toy') {
      walkTo(a, s.play.spots[0], world);
      walkTo(b, s.play.spots[1], world);
      return 'running';
    }
    if (s.kind === 'play') return begin(s, cast);
    if (s.kind === 'fight') {
      const spots = standoffTiles(a, b, world, cast.occupied, SOCIAL_STANDOFF_SEARCH_TILES);
      if (spots) {
        walkTo(a, spots[0], world);
        walkTo(b, spots[1], world);
        return 'running';
      }
    }
    const sameTile = a.tileCol === b.tileCol && a.tileRow === b.tileRow;
    if (!s.stationary || sameTile) {
      const spot = meetTile(a, b, world, cast.occupied);
      if (spot) walkTo(a, spot, world);
    }
    return 'running';
  }
  if (settled(a) && settled(b)) return begin(s, cast);
  if (s.t > SOCIAL_APPROACH_TIMEOUT_SEC) {
    stopAfterStep(a);
    stopAfterStep(b);
    return 'done';
  }
  return 'running';
}

/** Approach is over: start the main phase of the scene. */
function begin(s: Scene, cast: SceneCast): StepResult {
  const { a, b, rng } = cast;
  if (s.kind === 'fight') {
    faceSideways(a, b);
    enter(s, 'standoff');
    s.standoffSec =
      SOCIAL_STANDOFF_MIN_SEC + rng() * (SOCIAL_STANDOFF_MAX_SEC - SOCIAL_STANDOFF_MIN_SEC);
    return 'running';
  }
  faceEachOther(a, b);
  if (s.kind === 'talk') {
    enter(s, 'greet');
    s.turn = rng() < 0.5 ? 0 : 1;
    const rub = SOCIAL_GREET_RUB_CHANCE * pairMul(a.personality, b.personality, 'greetRub');
    s.rubber = rng() < rub ? (rng() < 0.5 ? 0 : 1) : -1;
  } else if (s.play?.kind === 'toy') {
    enter(s, 'toy');
    s.play.onTurn?.(a.id, s.play.toyId);
  } else {
    enter(s, 'chase');
    s.home = tileOf(a);
    s.turn = rng() < 0.5 ? 0 : 1;
    s.tagT = SOCIAL_TAG_COOLDOWN_SEC;
    a.speedMul = SOCIAL_CHASE_SPEED_MUL;
    b.speedMul = SOCIAL_CHASE_SPEED_MUL;
  }
  return 'running';
}

/** Hello: both cats boop noses, then one may rub its head on the other. */
function greet(s: Scene, cast: SceneCast): StepResult {
  const { a, b } = cast;
  faceEachOther(a, b);
  const rubber = s.rubber ?? -1;
  if (s.t < SOCIAL_GREET_BOOP_SEC) {
    for (const ch of [a, b]) Object.assign(view(ch), { pose: 'boop', frame: 0 });
    return 'running';
  }
  if (rubber >= 0 && s.t < SOCIAL_GREET_BOOP_SEC + SOCIAL_GREET_RUB_SEC) {
    const [rub, other] = rubber === 0 ? [a, b] : [b, a];
    Object.assign(view(rub), { pose: 'rub', frame: 0 });
    Object.assign(view(other), { pose: 'flick', frame: pulse(s.t, SOCIAL_FLICK_FRAME_SEC, 2) });
    return 'running';
  }
  view(a).pose = null;
  view(b).pose = null;
  enter(s, 'talk');
  return 'running';
}

function talk(s: Scene, cast: SceneCast): StepResult {
  const { a, b, rng } = cast;
  faceEachOther(a, b);
  const speaker = s.turn === 0 ? a : b;
  // The listener's tail flicks happily while the other one talks.
  const listener = view(speaker === a ? b : a);
  listener.pose = 'flick';
  listener.frame = pulse(s.t, SOCIAL_FLICK_FRAME_SEC, 2);
  const v = view(speaker);
  if (s.t < SOCIAL_TALK_BUBBLE_SEC) {
    if (!s.icon) {
      const pool = ICONS.filter((i) => i !== s.lastIcon);
      s.icon = pool[Math.floor(rng() * pool.length)];
    }
    v.bubble = s.icon;
    v.pose = pulse(s.t, SOCIAL_TALK_MOUTH_SEC, 2) === 0 ? 'talk' : null;
    return 'running';
  }
  v.bubble = null;
  v.pose = null;
  if (s.t < SOCIAL_TALK_BUBBLE_SEC + SOCIAL_TALK_GAP_SEC) return 'running';
  s.exchanges--;
  if (s.exchanges <= 0) return 'done';
  s.lastIcon = s.icon;
  s.icon = null;
  s.turn = 1 - s.turn;
  s.t = 0;
  return 'running';
}

function chase(s: Scene, cast: SceneCast, dt: number): StepResult {
  const { a, b, world, rng } = cast;
  if (s.t >= SOCIAL_CHASE_DURATION_SEC) return 'done';
  s.tagT += dt;
  s.timer -= dt;
  let chaser = s.turn === 0 ? a : b;
  let runner = s.turn === 0 ? b : a;
  if (tileDistance(tileOf(chaser), tileOf(runner)) <= 1 && s.tagT >= SOCIAL_TAG_COOLDOWN_SEC) {
    // Tag! Roles swap; the tagged cat yelps and turns chaser.
    s.turn = 1 - s.turn;
    s.tagT = 0;
    s.timer = 0;
    [chaser, runner] = [runner, chaser];
    runner.path = runner.path.slice(0, 1);
  }
  view(a).bubble = null;
  view(b).bubble = null;
  if (s.tagT < SOCIAL_TAG_BUBBLE_SEC) view(chaser).bubble = 'exclaim';
  if (runner.path.length === 0) {
    // Stay near where the play started: reject targets whose path runs far
    // around a wall (e.g. through a door into the next room).
    for (let i = 0; i < CHASE_TARGET_TRIES; i++) {
      const to = tileAwayFrom(
        tileOf(runner),
        tileOf(chaser),
        SOCIAL_CHASE_RANGE_MIN_TILES,
        SOCIAL_CHASE_RANGE_MAX_TILES,
        s.home ?? tileOf(runner),
        SOCIAL_CHASE_ROAM_TILES,
        world,
        rng,
      );
      if (!to || !walkTo(runner, to, world)) continue;
      if (runner.path.length <= SOCIAL_CHASE_RANGE_MAX_TILES + CHASE_DETOUR_TILES) break;
      runner.path = runner.path.slice(0, runner.moveProgress > 0 ? 1 : 0);
    }
  }
  if (s.timer <= 0) {
    s.timer = SOCIAL_CHASE_REPATH_SEC;
    walkTo(chaser, tileOf(runner), world);
  }
  return 'running';
}

function toy(s: Scene, cast: SceneCast, dt: number): StepResult {
  const { a, b } = cast;
  if (s.play?.kind !== 'toy' || s.t >= SOCIAL_TOY_DURATION_SEC) return 'done';
  faceEachOther(a, b);
  s.timer += dt;
  if (s.timer >= (s.play.turnSec ?? SOCIAL_TOY_TURN_SEC)) {
    s.timer = 0;
    s.turn = 1 - s.turn;
    s.play.onTurn?.((s.turn === 0 ? a : b).id, s.play.toyId);
  }
  return 'running';
}

/**
 * Side views only. Head to tail on adjacent rows (top faces left, bottom
 * faces right), otherwise the two cats face each other left / right.
 */
function faceSideways(a: Character, b: Character): void {
  const valet = Math.abs(a.tileRow - b.tileRow) === 1 && Math.abs(a.tileCol - b.tileCol) <= 1;
  if (valet) {
    const aTop = a.tileRow < b.tileRow;
    a.dir = aTop ? Direction.LEFT : Direction.RIGHT;
    b.dir = aTop ? Direction.RIGHT : Direction.LEFT;
    return;
  }
  const right = b.x >= a.x;
  a.dir = right ? Direction.RIGHT : Direction.LEFT;
  b.dir = right ? Direction.LEFT : Direction.RIGHT;
}

/** Standoff pose frames (socialRender.ts SOCIAL_FRAMES.standoff): intro 0..2, sway 3..4. */
const PEAK_FRAME = SOCIAL_STANDOFF_IN_FRAME_SEC.length - 1;
const SWAY_FRAME = PEAK_FRAME + 1;
const INTRO_SEC = SOCIAL_STANDOFF_IN_FRAME_SEC.reduce((sum, sec) => sum + sec, 0);

/** Intro frame at `t` (0 = first); `reverse`: the exit, from the peak back to the first. */
function introFrame(t: number, reverse = false): number {
  let left = t;
  for (let i = 0; i < SOCIAL_STANDOFF_IN_FRAME_SEC.length; i++) {
    const f = reverse ? PEAK_FRAME - i : i;
    left -= SOCIAL_STANDOFF_IN_FRAME_SEC[f];
    if (left < 0) return f;
  }
  return reverse ? 0 : PEAK_FRAME;
}

/** Show a standoff frame with the anger mark; `dx`: the crab-step offset in px. */
function puffed(ch: Character, frame: number, t: number, dx = 0): void {
  const anger = pulse(t, SOCIAL_ANGER_FRAME_SEC, 2);
  Object.assign(view(ch), { pose: 'standoff', frame, dx, anger });
}

/** Fight chance after a standoff: the base times the pair's `fight` multiplier, clamped. */
export function standoffFightChance(a: Character, b: Character): number {
  const p = SOCIAL_STANDOFF_FIGHT_CHANCE * pairMul(a.personality, b.personality, 'fight');
  return Math.min(SOCIAL_STANDOFF_FIGHT_MAX, Math.max(SOCIAL_STANDOFF_FIGHT_MIN, p));
}

/**
 * Side-on standoff: both cats puff up (intro), hold the peak, then sway in
 * anti-phase with a crab step now and then. Then a roll: fight, or one backs down.
 */
function standoff(s: Scene, cast: SceneCast): StepResult {
  const { a, b, rng } = cast;
  const swayStart = INTRO_SEC + SOCIAL_STANDOFF_PEAK_HOLD_SEC;
  if (s.t < INTRO_SEC) {
    for (const ch of [a, b]) puffed(ch, introFrame(s.t), s.t);
  } else if (s.t < swayStart) {
    for (const ch of [a, b]) puffed(ch, PEAK_FRAME, s.t);
  } else {
    const beat = Math.floor((s.t - swayStart) / SOCIAL_STANDOFF_SWAY_FRAME_SEC);
    const loop = Math.floor(beat / 2);
    const half = Math.ceil(SOCIAL_STANDOFF_CRAB_EVERY_LOOPS / 2);
    [a, b].forEach((ch, k) => {
      // Every few loops a cat slides 1 px sideways and back; b is offset from a.
      const step = Math.floor((loop + k * half) / SOCIAL_STANDOFF_CRAB_EVERY_LOOPS) % 2;
      const dx = step * SOCIAL_STANDOFF_CRAB_PX * (ch.dir === Direction.LEFT ? -1 : 1);
      puffed(ch, SWAY_FRAME + ((beat + k) % 2), s.t, dx);
    });
  }
  if (s.t < swayStart + (s.standoffSec ?? SOCIAL_STANDOFF_MIN_SEC)) return 'running';
  if (rng() < standoffFightChance(a, b)) {
    enter(s, 'unpuff');
    return 'running';
  }
  // No fight: the forced loser (a lost spot contest), else the less scrappy cat.
  const ma = personalityMul(a.personality, 'fight');
  const mb = personalityMul(b.personality, 'fight');
  if (s.loserId !== undefined) s.turn = s.loserId === a.id ? 0 : 1;
  else s.turn = ma === mb ? (rng() < 0.5 ? 0 : 1) : ma < mb ? 0 : 1;
  s.issued = false;
  enter(s, 'backDown');
  return 'running';
}

/** Before the cloud: both cats play the intro in reverse. */
function unpuff(s: Scene, cast: SceneCast): StepResult {
  for (const ch of [cast.a, cast.b]) puffed(ch, introFrame(s.t, true), s.t);
  if (s.t >= INTRO_SEC) enter(s, 'cloud');
  return 'running';
}

/**
 * No fight: the loser deflates, turns away and walks off stiffly; the winner
 * holds its puff a moment longer, deflates, and the scene ends.
 */
function backDown(s: Scene, cast: SceneCast): StepResult {
  const { a, b, world, rng } = cast;
  const [loser, winner] = s.turn === 0 ? [a, b] : [b, a];
  if (s.t < INTRO_SEC) {
    puffed(loser, introFrame(s.t, true), s.t);
  } else if (!s.issued) {
    s.issued = true;
    Object.assign(view(loser), { pose: null, dx: 0, anger: null });
    loser.dir = loser.dir === Direction.LEFT ? Direction.RIGHT : Direction.LEFT;
    // Walk off the way it now faces: away from a point just behind it.
    const from = tileOf(loser);
    const behind = { col: from.col + (loser.dir === Direction.LEFT ? 1 : -1), row: from.row };
    const to = tileAwayFrom(
      from,
      behind,
      SOCIAL_BACKDOWN_MIN_TILES,
      SOCIAL_BACKDOWN_MAX_TILES,
      from,
      SOCIAL_BACKDOWN_MAX_TILES,
      world,
      rng,
    );
    if (to) walkTo(loser, to, world);
    loser.speedMul = SOCIAL_BACKDOWN_SPEED_MUL;
  }
  const hold = SOCIAL_STANDOFF_WINNER_HOLD_SEC;
  if (s.t < hold) puffed(winner, PEAK_FRAME, s.t);
  else if (s.t < hold + INTRO_SEC) puffed(winner, introFrame(s.t - hold, true), s.t);
  else return 'done';
  return 'running';
}

function cloud(s: Scene, cast: SceneCast): StepResult {
  const { a, b, world, rng } = cast;
  const va = view(a);
  const vb = view(b);
  if (s.t < SOCIAL_FIGHT_CLOUD_SEC) {
    for (const v of [va, vb]) {
      v.pose = 'hidden';
      v.dx = 0;
      v.anger = null;
    }
    const at = s.location
      ? {
          x: s.location.col * TILE_SIZE + TILE_SIZE / 2,
          y: s.location.row * TILE_SIZE + TILE_SIZE / 2,
        }
      : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    va.cloud = {
      x: at.x,
      y: at.y + SOCIAL_CLOUD_FOOT_OFFSET_PX,
      frame: pulse(s.t, SOCIAL_CLOUD_FRAME_SEC, 4),
      otherId: b.id,
    };
    return 'running';
  }
  va.cloud = null;
  va.pose = null;
  vb.pose = null;
  const ta = tileOf(a);
  const tb = tileOf(b);
  for (const [ch, self, other] of [
    [a, ta, tb],
    [b, tb, ta],
  ] as const) {
    const to = fleeTile(self, other, SOCIAL_FLEE_MIN_TILES, world, rng);
    if (to) walkTo(ch, to, world);
    ch.speedMul = SOCIAL_FLEE_SPEED_MUL;
  }
  enter(s, 'flee');
  return 'running';
}

function flee(s: Scene, cast: SceneCast): StepResult {
  const { a, b } = cast;
  const angry = s.t < SOCIAL_FIGHT_ANGER_SEC;
  for (const ch of [a, b]) view(ch).anger = angry ? pulse(s.t, SOCIAL_ANGER_FRAME_SEC, 2) : null;
  if (s.t >= SOCIAL_FIGHT_FLEE_SEC) return 'done';
  if (!angry && settled(a) && settled(b)) return 'done';
  return 'running';
}
