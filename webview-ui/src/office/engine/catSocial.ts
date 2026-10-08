/**
 * Cat social layer: idle cats meet, talk in pictogram bubbles, play chase,
 * and, rarely, square off side-on: the standoff ends in a dust-cloud fight
 * or one cat backs down.
 *
 * ── Integration API (for an idle-activity registry) ─────────────────────
 *
 *   const social = officeState.social;              // one CatSocial per office
 *
 *   social.canSocialize(ch): boolean
 *     Not working, not a sub-agent, not (de)spawning, standing or walking.
 *
 *   social.isInScene(id): boolean
 *     Skip activity picks for a cat while this is true.
 *
 *   social.leave(id)
 *     Call before sending a cat somewhere on purpose (user walk / seat
 *     commands, an activity that must start now). The cat leaves its scene
 *     with its new path; the partner resumes idling.
 *
 *   social.trySocialEncounter(a, b, { activity?, location?, kind?, radius?, loser? }): SocialKind | null
 *     Call when two cats share an activity spot (both at coffee, both in the
 *     lounge / playroom). With `activity` set the cats keep their spots (no
 *     walking up, no chase) and may be mid-activity (ACTIVITY state). A
 *     fight still walks both cats to its head-to-tail standoff spots.
 *     `location` anchors the dust cloud. `kind` forces talk / play / fight;
 *     otherwise fight is ~1/15 and play is SOCIAL_PLAY_CHANCE. `radius`
 *     overrides the distance limit (a spot contest). `loser`: the cat that
 *     backs down when a fight's standoff ends without a fight. Returns null when
 *     cooldowns, distance or eligibility say no.
 *
 *   social.startJointPlay(a, b, play, radius?): boolean
 *     Joint play. { kind: 'chase' } works today. { kind: 'toy', toyId,
 *     spots, turnSec?, onTurn? } walks both cats to `spots`, then alternates
 *     turns and calls onTurn(catId, toyId) at each turn start; the registry
 *     animates the toy.
 *
 *   new CatSocial({ rng?, onSceneEnd? })
 *     onSceneEnd(catId, kind, reason) fires once per cat when its scene ends
 *     ('done' or 'interrupted'); resume the cat's own activity there.
 *
 *   findEncounterPair(cats, radius?) / SOCIAL_* constants
 *     The "both idle and within N tiles" scan the built-in wander hook uses.
 *
 * The built-in hook: `update()` runs every frame from OfficeState.update and,
 * every SOCIAL_CHECK_INTERVAL_SEC, may start an encounter for the closest
 * eligible pair. A cat whose agent gets work (isActive), or that despawns,
 * leaves at once: the character FSM walks it to its desk and the partner
 * resumes idling. Social bubbles yield to permission / waiting bubbles
 * (`socialBubbleVisible`).
 */
import {
  SOCIAL_ACTIVITY_RADIUS_TILES,
  SOCIAL_CAT_COOLDOWN_SEC,
  SOCIAL_CHECK_INTERVAL_SEC,
  SOCIAL_ENCOUNTER_CHANCE,
  SOCIAL_FIGHT_AVOID_SEC,
  SOCIAL_FIGHT_CHANCE,
  SOCIAL_PAIR_COOLDOWN_SEC,
  SOCIAL_PLAY_CHANCE,
  SOCIAL_RADIUS_TILES,
  SOCIAL_RESUME_PAUSE_MAX_SEC,
  SOCIAL_RESUME_PAUSE_MIN_SEC,
  SOCIAL_TALK_EXCHANGES_MAX,
  SOCIAL_TALK_EXCHANGES_MIN,
} from '../../constants.js';
import type { Character } from '../types.js';
import { CharacterState } from '../types.js';
import { pairMul } from './personality.js';
import type { SocialWorld, Tile } from './socialMoves.js';
import { stopAfterStep, tileDistance, tileOf } from './socialMoves.js';
import { type Scene, type SceneCast, type SocialKind, stepScene } from './socialScenes.js';

export type { SocialKind } from './socialScenes.js';

export interface SocialContext {
  /** Activity both cats share (e.g. 'coffee'): cats stay on their spots. */
  activity?: string;
  /** Where the scene happens (dust cloud anchor). Defaults to the midpoint. */
  location?: Tile;
  /** Force the scene kind instead of rolling it. */
  kind?: SocialKind;
  /** Max distance in tiles, instead of the default for the scene type. */
  radius?: number;
  /** Fight: the cat that backs down if the standoff ends without a fight (a lost spot contest). */
  loser?: number;
}

export type JointPlay =
  | { kind: 'chase' }
  | {
      kind: 'toy';
      toyId: string;
      /** Where each cat stands: [spot for a, spot for b]. */
      spots: [Tile, Tile];
      turnSec?: number;
      onTurn?: (catId: number, toyId: string) => void;
    };

export type SceneEndReason = 'done' | 'interrupted';

export interface CatSocialOptions {
  rng?: () => number;
  onSceneEnd?: (catId: number, kind: SocialKind, reason: SceneEndReason) => void;
  /** A cat another system moves on purpose (office scenes): never in a scene. */
  isHeld?: (catId: number) => boolean;
}

/**
 * A cat that may join a social scene right now. `inActivity`: a cat doing
 * an idle activity counts too (a talk at the coffee spot keeps its pose).
 */
export function canSocialize(ch: Character, inActivity = false): boolean {
  return (
    !ch.isActive &&
    !ch.isSubagent &&
    !ch.matrixEffect &&
    (ch.state === CharacterState.IDLE ||
      ch.state === CharacterState.WALK ||
      (inActivity && ch.state === CharacterState.ACTIVITY))
  );
}

/** Permission / waiting bubbles outrank social pictograms and the anger mark. */
export function socialBubbleVisible(ch: { bubbleType: unknown }): boolean {
  return ch.bubbleType === null;
}

/**
 * Roll the scene kind: fight first (rare), then play (only when free to move).
 * The multipliers come from the pair's personalities (personality.ts pairMul).
 */
export function rollKind(
  rng: () => number,
  stationary: boolean,
  fightMul = 1,
  playMul = 1,
): SocialKind {
  if (rng() < SOCIAL_FIGHT_CHANCE * fightMul) return 'fight';
  if (!stationary && rng() < SOCIAL_PLAY_CHANCE * playMul) return 'play';
  return 'talk';
}

/** Wander pause a cat gets when its scene starts (stepScene keeps it up). */
const SCENE_HOLD_SEC = 1;

const pairKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

export class CatSocial {
  rng: () => number;
  private readonly onSceneEnd?: CatSocialOptions['onSceneEnd'];
  private readonly isHeld?: CatSocialOptions['isHeld'];
  private readonly scenes = new Set<Scene>();
  private readonly sceneOf = new Map<number, Scene>();
  private readonly catCooldownUntil = new Map<number, number>();
  private readonly pairCooldownUntil = new Map<string, number>();
  private readonly leaving = new Set<number>();
  private now = 0;
  private checkTimer = SOCIAL_CHECK_INTERVAL_SEC;

  constructor(opts: CatSocialOptions = {}) {
    this.rng = opts.rng ?? Math.random;
    this.onSceneEnd = opts.onSceneEnd;
    this.isHeld = opts.isHeld;
  }

  canSocialize(ch: Character, inActivity = false): boolean {
    return canSocialize(ch, inActivity) && !this.sceneOf.has(ch.id) && !this.isHeld?.(ch.id);
  }

  isInScene(id: number): boolean {
    return this.sceneOf.has(id);
  }

  /** Kind and phase of a cat's scene (for tests and debugging). */
  sceneInfo(id: number): { kind: SocialKind; phase: string; partnerId: number } | null {
    const s = this.sceneOf.get(id);
    if (!s) return null;
    return { kind: s.kind, phase: s.phase, partnerId: s.a === id ? s.b : s.a };
  }

  /** Cooldown gate: both cats rested, and the pair is not avoiding each other. */
  isPairReady(a: number, b: number): boolean {
    const t = this.now;
    return (
      (this.catCooldownUntil.get(a) ?? 0) <= t &&
      (this.catCooldownUntil.get(b) ?? 0) <= t &&
      (this.pairCooldownUntil.get(pairKey(a, b)) ?? 0) <= t
    );
  }

  /** The closest pair of free, rested cats within `radius` tiles, or null. */
  findEncounterPair(
    cats: Iterable<Character>,
    radius = SOCIAL_RADIUS_TILES,
  ): [Character, Character] | null {
    const free = [...cats].filter((c) => this.canSocialize(c));
    let best: [Character, Character] | null = null;
    let bestD = Infinity;
    for (let i = 0; i < free.length; i++)
      for (let j = i + 1; j < free.length; j++) {
        const d = tileDistance(tileOf(free[i]), tileOf(free[j]));
        if (d > radius || d >= bestD || !this.isPairReady(free[i].id, free[j].id)) continue;
        best = [free[i], free[j]];
        bestD = d;
      }
    return best;
  }

  trySocialEncounter(a: Character, b: Character, ctx: SocialContext = {}): SocialKind | null {
    const stationary = ctx.activity !== undefined;
    const radius = ctx.radius ?? (stationary ? SOCIAL_ACTIVITY_RADIUS_TILES : SOCIAL_RADIUS_TILES);
    if (!this.admits(a, b, radius, stationary)) return null;
    let kind =
      ctx.kind ??
      rollKind(
        this.rng,
        stationary,
        pairMul(a.personality, b.personality, 'fight'),
        pairMul(a.personality, b.personality, 'chasePlay'),
      );
    if (kind === 'play' && stationary) kind = 'talk';
    this.begin(
      a,
      b,
      kind,
      stationary,
      ctx.location,
      kind === 'play' ? { kind: 'chase' } : undefined,
      ctx.loser,
    );
    return kind;
  }

  startJointPlay(a: Character, b: Character, play: JointPlay, radius?: number): boolean {
    const r = radius ?? (play.kind === 'toy' ? SOCIAL_ACTIVITY_RADIUS_TILES : SOCIAL_RADIUS_TILES);
    if (!this.admits(a, b, r)) return false;
    this.begin(a, b, 'play', false, undefined, play);
    return true;
  }

  /**
   * The user sent this cat somewhere (walk / seat commands): it leaves its
   * scene on the next tick, keeping the path it was given.
   */
  leave(id: number): void {
    if (this.sceneOf.has(id)) this.leaving.add(id);
  }

  /** Per-frame tick, after the character FSM. */
  update(dt: number, characters: Map<number, Character>, world: SocialWorld): void {
    this.now += dt;
    for (const scene of [...this.scenes]) {
      const a = characters.get(scene.a);
      const b = characters.get(scene.b);
      // A cat leaves when it gets work, despawns, sat down at its seat, or the
      // user sent it somewhere (leave()). It keeps its own path.
      const leavers = new Set<number>();
      for (const [id, c] of [
        [scene.a, a],
        [scene.b, b],
      ] as const) {
        const gone = !c || c.isActive || c.matrixEffect !== null || c.state === CharacterState.TYPE;
        if (gone || this.leaving.has(id)) leavers.add(id);
      }
      if (leavers.size > 0 || !a || !b) {
        this.finish(scene, characters, 'interrupted', leavers);
        continue;
      }
      const cast: SceneCast = { a, b, world, rng: this.rng, occupied: occupiedTiles(characters) };
      if (stepScene(scene, cast, dt) === 'done') this.finish(scene, characters, 'done');
    }
    this.checkTimer -= dt;
    if (this.checkTimer > 0) return;
    this.checkTimer = SOCIAL_CHECK_INTERVAL_SEC;
    this.pruneCooldowns();
    const pair = this.findEncounterPair(characters.values());
    const chance = pair
      ? SOCIAL_ENCOUNTER_CHANCE * pairMul(pair[0].personality, pair[1].personality, 'encounter')
      : 0;
    if (pair && this.rng() < chance) this.trySocialEncounter(pair[0], pair[1]);
  }

  /**
   * Drop expired cooldowns. An expired entry means the same as no entry, so
   * this also frees the entries of cats that left the office (no leak).
   */
  private pruneCooldowns(): void {
    for (const map of [this.catCooldownUntil, this.pairCooldownUntil] as Map<unknown, number>[]) {
      for (const [k, until] of [...map]) if (until <= this.now) map.delete(k);
    }
  }

  /** Cooldown entries held (tests: the maps do not grow without bound). */
  get cooldownCount(): number {
    return this.catCooldownUntil.size + this.pairCooldownUntil.size;
  }

  private admits(a: Character, b: Character, radius: number, inActivity = false): boolean {
    return (
      a.id !== b.id &&
      this.canSocialize(a, inActivity) &&
      this.canSocialize(b, inActivity) &&
      this.isPairReady(a.id, b.id) &&
      tileDistance(tileOf(a), tileOf(b)) <= radius
    );
  }

  private begin(
    a: Character,
    b: Character,
    kind: SocialKind,
    stationary: boolean,
    location: Tile | undefined,
    play: JointPlay | undefined,
    loserId?: number,
  ): void {
    const span = SOCIAL_TALK_EXCHANGES_MAX - SOCIAL_TALK_EXCHANGES_MIN + 1;
    const scene: Scene = {
      kind,
      a: a.id,
      b: b.id,
      phase: 'approach',
      t: 0,
      stationary,
      location,
      play,
      exchanges: SOCIAL_TALK_EXCHANGES_MIN + Math.floor(this.rng() * span),
      turn: 0,
      timer: 0,
      issued: false,
      icon: null,
      lastIcon: null,
      tagT: 0,
      loserId,
    };
    for (const ch of [a, b]) {
      stopAfterStep(ch);
      // The FSM may tick before the first scene step: no wander walk-off.
      ch.wanderTimer = Math.max(ch.wanderTimer, SCENE_HOLD_SEC);
      this.sceneOf.set(ch.id, scene);
    }
    this.scenes.add(scene);
  }

  private finish(
    scene: Scene,
    characters: Map<number, Character>,
    reason: SceneEndReason,
    leavers: ReadonlySet<number> = new Set(),
  ): void {
    this.scenes.delete(scene);
    const until = this.now + SOCIAL_CAT_COOLDOWN_SEC;
    const pairWait = scene.kind === 'fight' ? SOCIAL_FIGHT_AVOID_SEC : SOCIAL_PAIR_COOLDOWN_SEC;
    this.pairCooldownUntil.set(pairKey(scene.a, scene.b), this.now + pairWait);
    for (const id of [scene.a, scene.b]) {
      this.sceneOf.delete(id);
      this.leaving.delete(id);
      this.catCooldownUntil.set(id, until);
      const ch = characters.get(id);
      if (ch) {
        ch.social = undefined;
        ch.speedMul = undefined;
        if (!ch.isActive && !leavers.has(id)) {
          // The partner of a cat that left stops chasing / approaching; a
          // finished flee keeps running to its tile.
          if (reason === 'interrupted') stopAfterStep(ch);
          const span = SOCIAL_RESUME_PAUSE_MAX_SEC - SOCIAL_RESUME_PAUSE_MIN_SEC;
          ch.wanderTimer = SOCIAL_RESUME_PAUSE_MIN_SEC + this.rng() * span;
        }
      }
      this.onSceneEnd?.(id, scene.kind, reason);
    }
  }
}

function occupiedTiles(characters: Map<number, Character>): Set<string> {
  const out = new Set<string>();
  for (const c of characters.values()) out.add(`${c.tileCol},${c.tileRow}`);
  return out;
}
