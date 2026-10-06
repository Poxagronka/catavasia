/**
 * Cat life: the integration layer that ties idle activities, pet care and
 * cat social scenes to ONE spot reservation service. OfficeState owns one
 * CatLife and calls it from update():
 *
 *   beforeSocial(dt)  pets inside a social scene move with their actor
 *   afterPets(dt)     actors mirror free pets; activity talks / joint play
 *   reconcile()       release unwanted spots, sync seats, drop lost spots
 *
 * It also implements the hosts the pieces need: the idle FSM's claim, the
 * pet-care broker and activity provider, the claim host (who is who, and
 * how a fight winner walks back to its prize) and the activity-social host.
 */
import { IDLE_ACTIVITY_PAUSE_MAX_SEC, IDLE_ACTIVITY_PAUSE_MIN_SEC } from '../../constants.js';
import { isWalkable } from '../layout/tileMap.js';
import type { PetCareEnv } from '../petCare/petCareNav.js';
import type { PetCareSystem } from '../petCare/petCareSystem.js';
import type { PetSpotBroker } from '../petCare/petCareTypes.js';
import { isCatPet } from '../sprites/petSpriteData.js';
import type {
  ActivitySpot,
  Character,
  IdleActivityRun,
  Pet,
  PlacedFurniture,
  Seat,
  TileType as TileTypeVal,
} from '../types.js';
import { CharacterState } from '../types.js';
import type { ActivitySocialHost, Participant } from './activitySocial.js';
import { ActivitySocial } from './activitySocial.js';
import type { CatSocial } from './catSocial.js';
import { snapToTile, updateCharacter } from './characters.js';
import type { ActivitySpotSet, IdleChoice } from './idleActivities.js';
import { getIdleActivity } from './idleActivities.js';
import { PetActivities, petAnimFor } from './petActivities.js';
import { PetActors } from './petActors.js';
import { stopAfterStep } from './socialMoves.js';
import { mulberry32 } from './socialMoves.js';
import type { ClaimOutcome, SpotWant } from './spotClaims.js';
import { SpotClaims, spotKeys } from './spotClaims.js';

/** The slice of OfficeState cat life reads and drives. */
export interface CatLifeWorld {
  characters: Map<number, Character>;
  pets: Pet[];
  seats: Map<string, Seat>;
  tileMap: TileTypeVal[][];
  blockedTiles: Set<string>;
  walkableTiles: Array<{ col: number; row: number }>;
  activitySpots: Map<string, ActivitySpotSet>;
  social: CatSocial;
  petCare: PetCareSystem;
  placedFurniture(): PlacedFurniture[];
  petCareEnv(): PetCareEnv;
  /** Meeting chairs ([tile key, cat id]): reserved like assigned seats. */
  meetingSeats(): Array<[string, number]>;
  /** Start an idle activity for an agent (own seat unblocked for the path). */
  beginActivity(ch: Character, choice: IdleChoice): void;
}

export class CatLife {
  readonly actors = new PetActors();
  readonly claims: SpotClaims;
  readonly activitySocial = new ActivitySocial();
  readonly petActivities: PetActivities;
  readonly broker: PetSpotBroker;
  /** RNG for pet activity picks (seeded with the rest by `seed`). */
  rng: () => number = Math.random;
  private readonly w: CatLifeWorld;

  constructor(world: CatLifeWorld) {
    this.w = world;
    this.claims = new SpotClaims(world.social, {
      actor: (id) => this.actorOf(id),
      resumeOf: (id) => this.resumeOf(id),
    });
    this.broker = {
      canTarget: (pet, key) => this.claims.canTarget(this.actors.actorFor(pet).id, key),
      claim: (pet, keys, resume) => this.claims.claim(this.actors.actorFor(pet).id, keys, resume),
    };
    this.petActivities = new PetActivities({
      spotSets: () => world.activitySpots,
      furniture: () => world.placedFurniture(),
      canTarget: (pet, key) => this.broker.canTarget(pet, key),
      claim: (pet, keys, resume) => this.broker.claim(pet, keys, resume),
      start: (pet, claim) => world.petCare.startClaim(pet, claim, world.petCareEnv()),
      rng: () => this.rng(),
    });
  }

  /** Seed every random roll of the integration (contests, encounters, picks). */
  seed(seed: number): void {
    this.claims.spots.rng = mulberry32(seed);
    this.activitySocial.rng = mulberry32(seed + 1);
    this.w.social.rng = mulberry32(seed + 2);
    this.rng = mulberry32(seed + 3);
  }

  // ── Idle FSM claim ────────────────────────────────────────────

  /** IdleWorld.claim: reserve an agent's chosen spot as its walk starts. */
  claimIdle(ch: Character, choice: IdleChoice): ClaimOutcome {
    return this.claims.claim(ch.id, spotKeys(choice.spot!), () => this.resumeAgent(ch.id, choice));
  }

  /** Spots an agent must not pick. */
  takenBy(ch: Character): Set<string> {
    return this.claims.blockedFor(ch.id);
  }

  /** A seat a cat holds for an activity (a sofa nap): not for new agents. */
  seatHeldByCat(seat: Seat): boolean {
    return this.claims.spots.get(`${seat.seatCol},${seat.seatRow}`)?.tag === 'spot';
  }

  /**
   * Send a pet to an activity now (tests, screenshot hooks): `spotKey` picks
   * the spot. False when no free spot or the claim was lost.
   */
  forcePetActivity(pet: Pet, activityId: string, spotKey?: string): boolean {
    const set = this.w.activitySpots.get(activityId);
    const spot = [...(set?.spots ?? []), ...(set?.fallback ?? [])].find(
      (s) => (!spotKey || s.key === spotKey) && this.broker.canTarget(pet, s.key),
    );
    if (!spot) return false;
    this.w.petCare.interrupt(pet);
    const claim = this.petActivities.claimAt(pet, activityId, spot, false);
    if (claim === 'fight') return true;
    return claim !== 'repick' && this.w.petCare.startClaim(pet, claim, this.w.petCareEnv());
  }

  private resumeAgent(id: number, choice: IdleChoice, cupFrom?: string): void {
    const ch = this.w.characters.get(id);
    if (!ch || ch.isActive || ch.matrixEffect) return;
    ch.activity = null;
    ch.path = ch.path.slice(0, ch.moveProgress > 0 ? 1 : 0);
    if (ch.path.length === 0) this.w.beginActivity(ch, choice);
    // A coffee chain step keeps the machine its cup came from.
    const run = ch.activity as IdleActivityRun | null; // set again by beginActivity
    if (run && cupFrom) run.cupFrom = cupFrom;
  }

  // ── Who is who ────────────────────────────────────────────────

  /** Pets that are cats: only they join scenes, contests and activities. */
  catPets(): Pet[] {
    return this.w.pets.filter((p) => isCatPet(p.petType));
  }

  petOf(actorId: number): Pet | undefined {
    const petId = this.actors.petId(actorId);
    return petId === undefined ? undefined : this.catPets().find((p) => p.id === petId);
  }

  actorOf(id: number): Character | undefined {
    const ch = this.w.characters.get(id);
    if (ch) return ch;
    const pet = this.petOf(id);
    return pet ? this.actors.actorFor(pet) : undefined;
  }

  inScene(pet: Pet): boolean {
    if (!isCatPet(pet.petType)) return false;
    return this.w.social.isInScene(this.actors.actorFor(pet).id);
  }

  /** How a contest winner walks back to the target it had when the fight began. */
  private resumeOf(id: number): (() => void) | null {
    const ch = this.w.characters.get(id);
    if (ch) {
      const run = ch.activity;
      const def = getIdleActivity(run?.id);
      if (!run?.spot || !def) return null;
      const choice: IdleChoice = { def, spot: run.spot };
      const cupFrom = run.cupFrom;
      return () => this.resumeAgent(id, choice, cupFrom);
    }
    const pet = this.petOf(id);
    const claim = pet ? this.w.petCare.currentClaim(pet.id) : null;
    if (!pet || !claim || claim.joint) return null;
    return () => this.w.petCare.startClaim(pet, claim, this.w.petCareEnv());
  }

  // ── Per-frame phases ──────────────────────────────────────────

  /** Agents plus pet actors: the cast CatSocial sees. */
  cast(): Map<number, Character> {
    const out = new Map(this.w.characters);
    for (const pet of this.catPets()) {
      const a = this.actors.actorFor(pet);
      out.set(a.id, a);
    }
    return out;
  }

  /** Pet actors in a scene at the start of this frame (to sync the one whose scene ends). */
  private inSceneBefore = new Set<number>();

  /** Pets inside a scene: the scene moves the actor, the pet follows it. */
  beforeSocial(dt: number): void {
    const w = this.w;
    this.actors.prune(this.catPets());
    this.inSceneBefore.clear();
    for (const pet of this.catPets()) {
      const a = this.actors.actorFor(pet);
      if (!w.social.isInScene(a.id)) continue;
      this.inSceneBefore.add(a.id);
      a.isActive = w.petCare.menuPetId === pet.id; // the menu pulls it out
      updateCharacter(a, dt, w.walkableTiles, w.seats, w.tileMap, w.blockedTiles);
      this.actors.mirrorActor(a, pet);
    }
  }

  /** After pet care and the pet FSM: actors mirror free pets; activity social. */
  afterPets(dt: number): void {
    const w = this.w;
    for (const pet of this.catPets()) {
      const a = this.actors.actorFor(pet);
      if (w.social.isInScene(a.id)) continue;
      // The scene ended this frame: the pet takes the actor's final path first.
      if (this.inSceneBefore.has(a.id)) this.actors.mirrorActor(a, pet);
      const claim = w.petCare.heldSpot(pet.id)?.arrived ? w.petCare.currentClaim(pet.id) : null;
      const busy = w.petCare.menuPetId === pet.id || (w.petCare.isBusy(pet.id) && !claim);
      this.actors.mirrorPet(pet, a, busy);
      // At a claim (a toy, a nap) the actor reads as mid-activity: only
      // activity talks reach it, never the wander encounters.
      if (claim) a.state = CharacterState.ACTIVITY;
    }
    this.activitySocial.update(dt, this.socialHost());
  }

  /**
   * Start an activity encounter between two cats doing activities now
   * (agent ids or pet actor ids): a talk, or with `joint` a joint play.
   * For tests and the screenshot hooks; update() rolls these by itself.
   */
  encounter(aId: number, bId: number, joint: boolean): string | null {
    const ps = this.participants();
    const a = ps.find((p) => p.actor.id === aId);
    const b = ps.find((p) => p.actor.id === bId);
    return a && b ? this.activitySocial.encounter(a, b, this.socialHost(), joint) : null;
  }

  private socialHost(): ActivitySocialHost {
    const w = this.w;
    return {
      social: w.social,
      claims: this.claims,
      spotSets: w.activitySpots,
      participants: () => this.participants(),
      isWalkable: (c, r) => isWalkable(c, r, w.tileMap, w.blockedTiles),
      stop: (p) => this.stop(p),
      extend: (p, sec) => this.extend(p, sec),
      playTurn: (id, toyId, spot, sec) => this.playTurn(id, toyId, spot, sec),
    };
  }

  /** Release, sync and enforce reservations (see SpotClaims.reconcile). */
  reconcile(): void {
    const w = this.w;
    const wants = new Map<number, SpotWant>();
    const seats: Array<[string, number]> = [];
    for (const ch of w.characters.values()) {
      const spot = ch.matrixEffect === 'despawn' ? undefined : ch.activity?.spot;
      if (spot) wants.set(ch.id, { keys: spotKeys(spot), arrived: ch.activity!.phase === 'doing' });
      const seat = ch.seatId ? w.seats.get(ch.seatId) : undefined;
      if (seat && ch.matrixEffect !== 'despawn') {
        seats.push([`${seat.seatCol},${seat.seatRow}`, ch.id]);
      }
    }
    seats.push(...w.meetingSeats());
    for (const pet of this.catPets()) {
      const held = w.petCare.heldSpot(pet.id);
      if (held) wants.set(this.actors.actorFor(pet).id, held);
    }
    const alive = (id: number) => {
      const ch = w.characters.get(id);
      return ch ? ch.matrixEffect !== 'despawn' : this.petOf(id) !== undefined;
    };
    this.claims.reconcile(wants, seats, alive, (id) => this.onLost(id));
  }

  /** Another cat holds this cat's spot now: drop that activity. */
  private onLost(id: number): void {
    const ch = this.w.characters.get(id);
    if (ch) {
      if (ch.state === CharacterState.ACTIVITY) {
        snapToTile(ch);
        ch.state = CharacterState.IDLE;
        ch.frame = 0;
      } else if (ch.state === CharacterState.WALK) {
        stopAfterStep(ch);
      }
      if (ch.activity) ch.lastActivityId = ch.activity.id;
      ch.activity = null;
      const span = IDLE_ACTIVITY_PAUSE_MAX_SEC - IDLE_ACTIVITY_PAUSE_MIN_SEC;
      ch.wanderTimer = IDLE_ACTIVITY_PAUSE_MIN_SEC + Math.random() * span;
      return;
    }
    const pet = this.petOf(id);
    if (pet) this.w.petCare.interrupt(pet);
  }

  // ── Activity social host ──────────────────────────────────────

  private participants(): Participant[] {
    const w = this.w;
    const out: Participant[] = [];
    for (const ch of w.characters.values()) {
      const run = ch.activity;
      if (ch.isSubagent || ch.isActive || ch.state !== CharacterState.ACTIVITY) continue;
      if (run?.phase !== 'doing' || !run.spot) continue;
      out.push({ actor: ch, activityId: run.id, spot: run.spot });
    }
    for (const pet of this.catPets()) {
      if (!w.petCare.heldSpot(pet.id)?.arrived || w.petCare.menuPetId === pet.id) continue;
      const claim = w.petCare.currentClaim(pet.id);
      if (!claim?.spot) continue;
      out.push({ actor: this.actors.actorFor(pet), activityId: claim.kind, spot: claim.spot });
    }
    return out;
  }

  private stop(p: Participant): void {
    const pet = this.petOf(p.actor.id);
    if (pet) {
      this.w.petCare.interrupt(pet);
      this.actors.mirrorPet(pet, p.actor, false);
      return;
    }
    const ch = p.actor;
    snapToTile(ch);
    if (ch.activity) ch.lastActivityId = ch.activity.id;
    ch.activity = null;
    ch.state = CharacterState.IDLE;
    ch.frame = 0;
    ch.frameTimer = 0;
  }

  private extend(p: Participant, sec: number): void {
    const pet = this.petOf(p.actor.id);
    if (pet) this.w.petCare.extend(pet.id, sec);
    else if (p.actor.activity) p.actor.activity.timer += sec;
  }

  private playTurn(id: number, toyId: string, spot: ActivitySpot, sec: number): void {
    const pet = this.petOf(id);
    if (pet) {
      this.w.petCare.playTurn(pet, sec, petAnimFor(toyId), spot);
      return;
    }
    const ch = this.w.characters.get(id);
    if (!ch || ch.tileCol !== spot.col || ch.tileRow !== spot.row) return;
    ch.activity = { id: toyId, spot, phase: 'doing', timer: sec };
    ch.state = CharacterState.ACTIVITY;
    ch.dir = spot.facing;
    ch.frame = 0;
    ch.frameTimer = 0;
  }
}
