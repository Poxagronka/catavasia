/**
 * Pet care — a tamagotchi layer for cat pets (manifest `"species": "cat"`).
 *
 * Each cat has five needs (petNeeds.ts) that decay while the office runs.
 * Low needs raise a request bubble and a meow. Cats walk to the food & water
 * bowl (PET_BOWL) by themselves, poop into the litter box (LITTER_BOX) or on
 * the floor, and react to the radial menu (Feed, Water, Scratch, Play,
 * Clean, Info). The data lives in PetCareWorld and persists to
 * ~/.pixel-agents/pets-state.json; this class is the runtime around it.
 *
 * Integration seam (for the idle-activity and cat-social systems):
 * `registerActivityProvider(provider)` lets another system offer a content,
 * idle cat something to do — a playroom toy, a nap on a sofa or in a bed.
 * The cat walks to the claim's tile, plays the claim's pose (`anim`) for
 * `durationSec` there, then gets `gains`. Needs always win: a cat with a low
 * need ignores providers, and a claim never reaches a pet while it eats,
 * drinks, poops or has the menu open. Pets never drink coffee: a claim
 * naming a COFFEE item is refused. engine/petActivities.ts registers the
 * office's provider (toys, beds, houses, sofa naps).
 *
 * Energy: it decays while the cat is awake. A cat under PET_TIRED_THRESHOLD
 * asks the provider for a nap spot (`claimSleep`) and sleeps there; energy
 * refills during the nap and the cat wakes once it is full.
 *
 * Spot reservations: with a `broker` set (OfficeState sets it), every walk
 * to a bowl side, a litter box or a claim reserves its tile at walk start
 * through the shared service (engine/spotReservations.ts). `heldSpot(petId)`
 * reports what the pet should keep holding; the office releases the rest.
 */
import {
  PET_ANIM_FRAME_SEC,
  PET_BOWEL_MAX,
  PET_CARE_DECIDE_INTERVAL_SEC,
  PET_CARE_SAVE_INTERVAL_SEC,
  PET_HEART_COUNT,
  PET_HEART_STAGGER_SEC,
  PET_MEOW_GLOBAL_COOLDOWN_SEC,
  PET_MEOW_INTERVAL_SEC,
  PET_NEED_MAX,
  PET_SEEK_THRESHOLD,
  PET_SLEEP_ENERGY_PER_SEC,
  PET_TIRED_THRESHOLD,
  PET_TOY_FUN_GAIN,
} from '../../constants.js';
import type { Pet, PlacedFurniture } from '../types.js';
import { Direction, PetState, TILE_SIZE } from '../types.js';
import type { CareTarget, PetCareEnv } from './petCareNav.js';
import {
  faceTowards,
  findBowlSpot,
  findLitterBox,
  LITTER_BOX_TYPE,
  pathTo,
  PET_BOWL_TYPE,
} from './petCareNav.js';
import type {
  Anim,
  Effect,
  Goal,
  PetActivityClaim,
  PetActivityProvider,
  PetMenuAction,
  PetRuntime,
  PetSpotBroker,
  Seek,
} from './petCareTypes.js';
import { ANIM_SEC, EFFECT_MAX_AGE_SEC, FORBIDDEN_CLAIM_TYPES } from './petCareTypes.js';
import { PetCareWorld } from './petCareWorld.js';
import type { Needs, RequestKind } from './petNeeds.js';
import { NEED_KEYS, pickRequest, raiseNeed } from './petNeeds.js';

export class PetCareSystem {
  world = new PetCareWorld();
  /** Office-time multiplier for need decay (debug: speeds up the clock). */
  speed = 1;
  menuPetId: string | null = null;
  infoOpen = false;
  effects: Effect[] = [];
  onSave: ((snapshot: unknown) => void) | null = null;
  onMeow: (() => void) | null = null;
  /** Shared spot reservations (null in unit tests: every spot is free). */
  broker: PetSpotBroker | null = null;
  private runtime = new Map<string, PetRuntime>();
  private providers: PetActivityProvider[] = [];
  private loaded = false;
  private dirty = false;
  private saveTimer = PET_CARE_SAVE_INTERVAL_SEC;
  private clock = 0;
  private lastMeowAt = -Infinity;

  /** Apply the persisted snapshot (with offline catch-up) and start saving. */
  load(raw: unknown, now: number): void {
    this.world = PetCareWorld.fromSnapshot(raw, now);
    this.loaded = true;
  }

  registerActivityProvider(p: PetActivityProvider): void {
    this.providers.push(p);
  }

  private rt(petId: string): PetRuntime {
    let r = this.runtime.get(petId);
    if (!r) {
      r = {
        seek: null,
        anim: null,
        decideTimer: 0,
        request: null,
        nextMeowAt: 0,
        dish: false,
        keys: [],
        claim: null,
      };
      this.runtime.set(petId, r);
    }
    return r;
  }

  /** True while a care pose or the menu owns the pet (skip its wander FSM). */
  isBusy(petId: string): boolean {
    return this.menuPetId === petId || this.runtime.get(petId)?.anim != null;
  }

  requestOf(petId: string): RequestKind | null {
    return this.runtime.get(petId)?.request ?? null;
  }

  hasDish(petId: string): boolean {
    return this.runtime.get(petId)?.dish ?? false;
  }

  /** Spot keys the pet should keep reserved, and whether it reached them. */
  heldSpot(petId: string): { keys: string[]; arrived: boolean } | null {
    const r = this.runtime.get(petId);
    if (!r) return null;
    if (r.seek) return { keys: r.seek.keys, arrived: false };
    if (r.anim && r.keys.length > 0) return { keys: r.keys, arrived: true };
    return null;
  }

  /** The claim the pet walks to or plays (a won fight resumes it). */
  currentClaim(petId: string): PetActivityClaim | null {
    const r = this.runtime.get(petId);
    return r?.seek?.claim ?? (r?.anim ? r.claim : null);
  }

  /**
   * Stop whatever the pet walks to or does, with no gains: its spot was lost
   * (a contest, a seat taken) or a joint play / scene takes it over.
   */
  interrupt(pet: Pet): void {
    const r = this.runtime.get(pet.id);
    if (!r) return;
    const walking = r.seek !== null;
    r.seek = null;
    r.anim = null;
    r.keys = [];
    r.claim = null;
    r.dish = false;
    pet.careAnim = null;
    pet.rest = null;
    if (walking) {
      pet.path = pet.path.slice(0, pet.moveProgress > 0 ? 1 : 0);
    }
  }

  update(dt: number, env: PetCareEnv): void {
    this.clock += dt;
    const cats = env.pets.filter((p) => env.isCat(p));
    for (const pet of cats) this.world.entry(pet.id);
    const fullBoxes = env.furniture.filter(
      (f) => f.type === LITTER_BOX_TYPE && this.world.isBoxFull(f.uid),
    ).length;
    this.world.tick((dt * this.speed) / 3600, fullBoxes);
    this.dirty = this.dirty || cats.length > 0;
    for (const pet of cats) this.updatePet(pet, dt, env);
    for (const e of this.effects) e.age += dt;
    this.effects = this.effects.filter((e) => e.age < EFFECT_MAX_AGE_SEC);
    if (this.menuPetId && !cats.some((p) => p.id === this.menuPetId)) this.closeMenu();
    this.saveTimer -= dt;
    if (this.saveTimer <= 0) this.flush();
  }

  /** Mark changed; `soon` saves within a second (after user actions). */
  private touch(soon = false): void {
    this.dirty = true;
    if (soon) this.saveTimer = Math.min(this.saveTimer, 1);
  }

  /** Persist if anything changed since the last save (no-op before load). */
  flush(): void {
    this.saveTimer = PET_CARE_SAVE_INTERVAL_SEC;
    if (!this.loaded || !this.dirty || !this.onSave) return;
    this.dirty = false;
    this.onSave(this.world.toSnapshot(Date.now()));
  }

  private updatePet(pet: Pet, dt: number, env: PetCareEnv): void {
    const r = this.rt(pet.id);
    if (r.anim) {
      this.advanceAnim(pet, r, dt);
      return;
    }
    // A social scene moves the cat: no arrivals, no decisions until it ends.
    if (env.inScene?.(pet)) return;
    if (r.seek && pet.state !== PetState.WALK) {
      const s = r.seek;
      r.seek = null;
      if (pet.tileCol === s.col && pet.tileRow === s.row) this.arrive(pet, s, env);
      if (this.rt(pet.id).anim) return;
    }

    const needs = this.world.entry(pet.id).needs;
    const request = this.menuPetId === pet.id ? null : pickRequest(needs);
    if (request && request !== r.request) r.nextMeowAt = this.clock;
    r.request = request;
    const globalReady = this.clock - this.lastMeowAt >= PET_MEOW_GLOBAL_COOLDOWN_SEC;
    if (request && this.clock >= r.nextMeowAt && globalReady) {
      this.lastMeowAt = this.clock;
      r.nextMeowAt = this.clock + PET_MEOW_INTERVAL_SEC;
      this.onMeow?.();
    }

    r.decideTimer -= dt;
    // Decide only while standing: re-pathing mid-step would snap the cat back a tile.
    if (r.decideTimer > 0 || r.seek || this.menuPetId === pet.id) return;
    if (pet.state !== PetState.IDLE) return;
    r.decideTimer = PET_CARE_DECIDE_INTERVAL_SEC;
    this.decide(pet, needs, env);
  }

  private advanceAnim(pet: Pet, r: PetRuntime, dt: number): void {
    const anim = r.anim!;
    anim.t += dt;
    const frame = Math.floor(anim.t / PET_ANIM_FRAME_SEC);
    pet.careAnim = anim.kind === 'wait' ? null : { kind: anim.kind, frame };
    if (anim.kind === 'sleep') {
      const needs = this.world.entry(pet.id).needs;
      raiseNeed(needs, 'energy', PET_SLEEP_ENERGY_PER_SEC * dt);
      // Wake early once rested (but nap at least a few seconds).
      if (needs.energy >= PET_NEED_MAX && anim.t >= ANIM_SEC.sleep / 4) anim.t = anim.dur;
    }
    if (anim.t < anim.dur) return;
    r.anim = null;
    r.dish = false;
    r.keys = [];
    r.claim = null;
    pet.careAnim = null;
    pet.rest = null;
    pet.frame = 0;
    pet.frameTimer = 0;
    anim.done();
  }

  /** Autonomous choice: poop > drink > eat > sleep when tired > a provider's idle activity. */
  private decide(pet: Pet, needs: Needs, env: PetCareEnv): void {
    if (this.world.entry(pet.id).bowel >= PET_BOWEL_MAX) {
      const box = findLitterBox(pet, env, this.world, this.canTarget(pet));
      if (box && this.reserve(pet, box, env, 'poop')) return;
      if (!box) this.startPoop(pet, null);
      return;
    }
    if (needs.thirst < PET_SEEK_THRESHOLD && this.seekBowl(pet, 'drink', env)) return;
    if (env.inScene?.(pet)) return; // lost a contest roll: the fight runs now
    if (needs.hunger < PET_SEEK_THRESHOLD && this.seekBowl(pet, 'eat', env)) return;
    if (env.inScene?.(pet)) return;
    if (needs.energy < PET_TIRED_THRESHOLD) {
      for (const p of this.providers) {
        const claim = p.claimSleep?.(pet);
        if (claim && this.startClaim(pet, claim, env)) return;
        if (env.inScene?.(pet)) return; // a contest fight started instead
      }
    }
    if (pickRequest(needs)) return;
    for (const p of this.providers) {
      const claim = p.claimIdle(pet, needs);
      if (claim && this.startClaim(pet, claim, env)) return;
      if (env.inScene?.(pet)) return;
    }
  }

  /**
   * Walk the pet to a provider's claim (the provider reserved its keys).
   * False when it is forbidden (coffee) or unreachable.
   */
  startClaim(pet: Pet, claim: PetActivityClaim, env: PetCareEnv): boolean {
    if (FORBIDDEN_CLAIM_TYPES.some((t) => claim.furnitureType?.includes(t))) return false;
    const path = pathTo(pet, claim.col, claim.row, env, claim.spot?.onFurniture ?? false);
    if (!path) return false;
    this.walk(pet, { uid: '', col: claim.col, row: claim.row, path }, 'claim', claim);
    return true;
  }

  /** Keep the pet `sec` longer in its current pose (it stays for a talk). */
  extend(petId: string, sec: number): void {
    const anim = this.runtime.get(petId)?.anim;
    if (anim) anim.dur += sec;
  }

  /** Joint toy play: the pet's turn — the hop pose for `sec` where it stands. */
  playTurn(pet: Pet, sec: number): void {
    if (this.rt(pet.id).anim) return;
    this.pose(pet, 'play', sec, () => {
      raiseNeed(this.world.entry(pet.id).needs, 'fun', PET_TOY_FUN_GAIN / 2);
      this.touch();
    });
  }

  /** Tiles this pet may target (free or contestable); everything without a broker. */
  private canTarget(pet: Pet): (key: string) => boolean {
    const b = this.broker;
    return b ? (key) => b.canTarget(pet, key) : () => true;
  }

  /** Reserve a care target at walk start, then walk. False when another cat won it. */
  private reserve(pet: Pet, t: CareTarget, env: PetCareEnv, goal: Goal): boolean {
    const keys = [`${t.col},${t.row}`];
    const resume = () => {
      // Won a fight over it: walk there again from wherever the scene left the cat.
      const path = pathTo(pet, t.col, t.row, env);
      if (path) this.walk(pet, { ...t, path }, goal, undefined, keys);
    };
    if (this.broker && this.broker.claim(pet, keys, resume) !== 'ok') return false;
    this.walk(pet, t, goal, undefined, keys);
    return true;
  }

  private seekBowl(pet: Pet, goal: 'eat' | 'drink', env: PetCareEnv): boolean {
    const spot = findBowlSpot(pet, goal, env, this.world, this.canTarget(pet));
    return spot !== null && this.reserve(pet, spot, env, goal);
  }

  private walk(
    pet: Pet,
    t: CareTarget,
    goal: Goal,
    claim?: PetActivityClaim,
    keys: string[] = claim?.keys ?? [],
  ): void {
    const r = this.rt(pet.id);
    r.seek = { goal, uid: t.uid || null, col: t.col, row: t.row, claim, keys };
    r.claim = claim ?? null;
    pet.path = t.path;
    pet.moveProgress = 0;
    pet.followTargetId = null;
    pet.state = t.path.length > 0 ? PetState.WALK : PetState.IDLE;
  }

  private arrive(pet: Pet, s: Seek, env: PetCareEnv): void {
    const r = this.rt(pet.id);
    if (s.goal === 'claim' && s.claim) {
      const claim = s.claim;
      const gains = claim.gains ?? {};
      if (claim.spot) pet.dir = claim.spot.facing;
      this.pose(pet, claim.anim ?? 'wait', claim.durationSec, () => {
        const needs = this.world.entry(pet.id).needs;
        for (const k of NEED_KEYS) raiseNeed(needs, k, gains[k] ?? 0);
        this.touch();
      });
      r.keys = s.keys;
      r.claim = claim;
      const spot = claim.spot;
      pet.rest = {
        offsetX: spot?.offsetX ?? 0,
        offsetY: spot?.offsetY ?? 0,
        zzz: claim.sleep === true,
        peek: spot?.peek,
      };
      return;
    }
    r.keys = [];
    if (s.goal === 'poop') {
      r.keys = s.keys;
      this.startPoop(pet, s.uid);
      return;
    }
    const bowl = env.furniture.find((f) => f.uid === s.uid);
    if (!bowl) return;
    r.keys = s.keys;
    pet.dir = faceTowards(pet, bowl.col, bowl.row);
    const kind = s.goal === 'eat' ? 'eat' : 'drink';
    this.pose(pet, kind, ANIM_SEC[kind], () => {
      const ok =
        kind === 'eat' ? this.world.eat(pet.id, bowl.uid) : this.world.drink(pet.id, bowl.uid);
      if (ok) this.hearts(pet);
      this.touch();
    });
  }

  private startPoop(pet: Pet, boxUid: string | null): void {
    if (pet.dir === Direction.UP || pet.dir === Direction.DOWN) pet.dir = Direction.RIGHT;
    this.pose(pet, 'poop', ANIM_SEC.poop, () => {
      this.world.poop(pet.id, boxUid, pet.tileCol, pet.tileRow);
      this.touch(true);
    });
  }

  private pose(pet: Pet, kind: Anim['kind'], dur: number, done: () => void): void {
    const r = this.rt(pet.id);
    r.seek = null;
    r.anim = { kind, t: 0, dur, done };
    pet.state = PetState.IDLE;
    pet.path = [];
    pet.moveProgress = 0;
  }

  /** Staggered floating hearts above the cat's head. */
  private hearts(pet: Pet): void {
    for (let i = 0; i < PET_HEART_COUNT; i++) {
      const x = pet.x + (i - 1) * 4;
      this.effects.push({
        kind: 'heart',
        x,
        y: pet.y - TILE_SIZE,
        age: -i * PET_HEART_STAGGER_SEC,
        petId: pet.id,
      });
    }
  }

  private sparkle(col: number, row: number): void {
    const half = TILE_SIZE / 2;
    this.effects.push({
      kind: 'sparkle',
      x: col * TILE_SIZE + half,
      y: row * TILE_SIZE + half,
      age: 0,
    });
  }

  // ── User actions ────────────────────────────────────────────

  /** Open the radial menu: the cat stops on its tile and faces the viewer. */
  openMenu(pet: Pet): void {
    this.menuPetId = pet.id;
    this.infoOpen = false;
    const r = this.rt(pet.id);
    if (r.anim) return;
    r.seek = null;
    pet.state = PetState.IDLE;
    pet.path = [];
    pet.moveProgress = 0;
    pet.x = pet.tileCol * TILE_SIZE + TILE_SIZE / 2;
    pet.y = pet.tileRow * TILE_SIZE + TILE_SIZE / 2;
    pet.dir = Direction.DOWN;
  }

  closeMenu(): void {
    this.menuPetId = null;
    this.infoOpen = false;
  }

  /** Radial menu action on a cat. Closes the menu except for Info. */
  act(pet: Pet, action: PetMenuAction, env: PetCareEnv): void {
    if (action === 'info') {
      this.infoOpen = !this.infoOpen;
      return;
    }
    this.closeMenu();
    const r = this.rt(pet.id);
    if (r.anim) return; // the current pose finishes first
    if (action === 'clean') {
      this.cleanAll(env);
      return;
    }
    if (action === 'feed' || action === 'water') {
      const kind = action === 'feed' ? 'eat' : 'drink';
      for (const f of env.furniture) if (f.type === PET_BOWL_TYPE) this.refillBowl(f);
      if (this.seekBowl(pet, kind, env)) return;
      r.dish = true;
      this.pose(pet, kind, ANIM_SEC[kind], () => {
        this.world.treat(pet.id, kind === 'eat' ? 'hunger' : 'thirst');
        this.hearts(pet);
        this.touch(true);
      });
      return;
    }
    pet.dir = Direction.RIGHT;
    this.hearts(pet);
    const kind = action === 'scratch' ? 'petted' : 'play';
    this.pose(pet, kind, ANIM_SEC[kind], () => {
      if (action === 'scratch') this.world.scratch(pet.id);
      else this.world.play(pet.id);
      this.hearts(pet);
      this.touch(true);
    });
  }

  refillBowl(f: PlacedFurniture): void {
    this.world.refillBowl(f.uid);
    this.sparkle(f.col, f.row);
    this.touch(true);
  }

  cleanBox(f: PlacedFurniture): boolean {
    if (this.world.cleanBox(f.uid) === 0) return false;
    this.sparkle(f.col, f.row);
    this.touch(true);
    return true;
  }

  cleanFloorPoop(id: string): boolean {
    const p = this.world.floorPoops.find((x) => x.id === id);
    if (!p || !this.world.cleanFloorPoop(id)) return false;
    this.sparkle(p.col, p.row);
    this.touch(true);
    return true;
  }

  cleanAll(env: PetCareEnv): void {
    for (const f of env.furniture) if (f.type === LITTER_BOX_TYPE) this.cleanBox(f);
    for (const p of [...this.world.floorPoops]) this.cleanFloorPoop(p.id);
  }
}
