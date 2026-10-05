/**
 * Cat social layer: idle cats meet, talk in pictogram bubbles, play chase,
 * and, rarely, fight in a dust cloud.
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
 *   social.trySocialEncounter(a, b, { activity?, location?, kind? }): SocialKind | null
 *     Call when two cats share an activity spot (both at coffee, both in the
 *     lounge / playroom). With `activity` set the cats keep their spots (no
 *     walking up, no chase). `location` anchors the dust cloud. `kind`
 *     forces talk / play / fight; otherwise fight is ~1/15 and play is
 *     SOCIAL_PLAY_CHANCE. Returns null when cooldowns, distance or
 *     eligibility say no.
 *
 *   social.startJointPlay(a, b, play): boolean
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
}

/** A cat that may join a social scene right now. */
export function canSocialize(ch: Character): boolean {
  return (
    !ch.isActive &&
    !ch.isSubagent &&
    !ch.matrixEffect &&
    (ch.state === CharacterState.IDLE || ch.state === CharacterState.WALK)
  );
}

/** Permission / waiting bubbles outrank social pictograms and the anger mark. */
export function socialBubbleVisible(ch: Character): boolean {
  return ch.bubbleType === null;
}

/** Roll the scene kind: fight first (rare), then play (only when free to move). */
export function rollKind(rng: () => number, stationary: boolean): SocialKind {
  if (rng() < SOCIAL_FIGHT_CHANCE) return 'fight';
  if (!stationary && rng() < SOCIAL_PLAY_CHANCE) return 'play';
  return 'talk';
}

const pairKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

export class CatSocial {
  rng: () => number;
  private readonly onSceneEnd?: CatSocialOptions['onSceneEnd'];
  private readonly scenes = new Set<Scene>();
  private readonly sceneOf = new Map<number, Scene>();
  private readonly catCooldownUntil = new Map<number, number>();
  private readonly pairCooldownUntil = new Map<string, number>();
  private now = 0;
  private checkTimer = SOCIAL_CHECK_INTERVAL_SEC;

  constructor(opts: CatSocialOptions = {}) {
    this.rng = opts.rng ?? Math.random;
    this.onSceneEnd = opts.onSceneEnd;
  }

  canSocialize(ch: Character): boolean {
    return canSocialize(ch) && !this.sceneOf.has(ch.id);
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
    const radius = stationary ? SOCIAL_ACTIVITY_RADIUS_TILES : SOCIAL_RADIUS_TILES;
    if (!this.admits(a, b, radius)) return null;
    let kind = ctx.kind ?? rollKind(this.rng, stationary);
    if (kind === 'play' && stationary) kind = 'talk';
    this.begin(
      a,
      b,
      kind,
      stationary,
      ctx.location,
      kind === 'play' ? { kind: 'chase' } : undefined,
    );
    return kind;
  }

  startJointPlay(a: Character, b: Character, play: JointPlay): boolean {
    const radius = play.kind === 'toy' ? SOCIAL_ACTIVITY_RADIUS_TILES : SOCIAL_RADIUS_TILES;
    if (!this.admits(a, b, radius)) return false;
    this.begin(a, b, 'play', false, undefined, play);
    return true;
  }

  /** Per-frame tick, after the character FSM. */
  update(dt: number, characters: Map<number, Character>, world: SocialWorld): void {
    this.now += dt;
    for (const scene of [...this.scenes]) {
      const a = characters.get(scene.a);
      const b = characters.get(scene.b);
      const gone = (c?: Character) => !c || c.isActive || c.matrixEffect !== null;
      if (!a || !b || gone(a) || gone(b)) {
        this.finish(scene, characters, 'interrupted');
        continue;
      }
      const cast: SceneCast = { a, b, world, rng: this.rng, occupied: occupiedTiles(characters) };
      if (stepScene(scene, cast, dt) === 'done') this.finish(scene, characters, 'done');
    }
    this.checkTimer -= dt;
    if (this.checkTimer > 0) return;
    this.checkTimer = SOCIAL_CHECK_INTERVAL_SEC;
    const pair = this.findEncounterPair(characters.values());
    if (pair && this.rng() < SOCIAL_ENCOUNTER_CHANCE) this.trySocialEncounter(pair[0], pair[1]);
  }

  private admits(a: Character, b: Character, radius: number): boolean {
    return (
      a.id !== b.id &&
      this.canSocialize(a) &&
      this.canSocialize(b) &&
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
    };
    for (const ch of [a, b]) {
      stopAfterStep(ch);
      this.sceneOf.set(ch.id, scene);
    }
    this.scenes.add(scene);
  }

  private finish(scene: Scene, characters: Map<number, Character>, reason: SceneEndReason): void {
    this.scenes.delete(scene);
    const until = this.now + SOCIAL_CAT_COOLDOWN_SEC;
    const pairWait = scene.kind === 'fight' ? SOCIAL_FIGHT_AVOID_SEC : SOCIAL_PAIR_COOLDOWN_SEC;
    this.pairCooldownUntil.set(pairKey(scene.a, scene.b), this.now + pairWait);
    for (const id of [scene.a, scene.b]) {
      this.sceneOf.delete(id);
      this.catCooldownUntil.set(id, until);
      const ch = characters.get(id);
      if (ch) {
        ch.social = undefined;
        ch.speedMul = undefined;
        if (!ch.isActive) {
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
