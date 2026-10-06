/**
 * Litter life for agent cats: what happens around a box visit
 * (litterActivities.ts) that the idle FSM cannot know.
 *
 * - An overflowing box (flies) turns a visit into a refusal: the cat sniffs,
 *   grimaces and goes on to another box, or has an accident on the floor
 *   when every box is refused.
 * - The pile lands when the cat starts to cover it (the outro), in the box
 *   or on the floor; a visit cut short by work leaves nothing.
 * - After a visit the cat steps proudly off the box, and now and then gets
 *   the zoomies: two or three sprints to far tiles, each ending in a skid.
 * - A cat not at a box for LITTER_DUE_SEC goes at its next idle pick
 *   (startDue), so a visit never depends on the rare roll alone.
 * - Floor poops: every path goes around them where it can (setAvoidTiles),
 *   and a cat passing one may grimace.
 *
 * Pets do the same through petCare/petCareSystem.ts.
 */
import {
  LITTER_DUE_SEC,
  LITTER_ZOOMIES_CHANCE,
  POOP_GRIMACE_CHANCE,
  POOP_GRIMACE_COOLDOWN_SEC,
  POOP_GRIMACE_SEC,
  ZOOMIES_DASHES_MAX,
  ZOOMIES_DASHES_MIN,
} from '../../constants.js';
import { isWalkable, setAvoidTiles } from '../layout/tileMap.js';
import { isLitterBoxType } from '../petCare/litterStages.js';
import { floorSpotNear, zoomiesTarget } from '../petCare/petCareNav.js';
import type { PetCareSystem } from '../petCare/petCareSystem.js';
import type {
  ActivitySpot,
  Character,
  IdleActivityRun,
  Pet,
  PlacedFurniture,
  TileType as TileTypeVal,
} from '../types.js';
import { CharacterState, Direction, PetState } from '../types.js';
import { startAnim } from './activityAnim.js';
import type { ActivitySpotSet } from './idleActivities.js';
import { getIdleActivity } from './idleActivities.js';
import { LITTER_USE_IDS } from './litterActivities.js';

/** The slice of OfficeState litter life reads and drives. */
export interface LitterWorld {
  characters: Map<number, Character>;
  pets: Pet[];
  tileMap: TileTypeVal[][];
  blockedTiles: Set<string>;
  activitySpots: Map<string, ActivitySpotSet>;
  petCare: PetCareSystem;
  placedFurniture(): PlacedFurniture[];
  /** Spot keys this cat must not pick (held by others). */
  takenBy(ch: Character): Set<string>;
  /** Reserve `spot` and start activity `id` there. False: taken, or the cat is busy. */
  startActivityAt(ch: Character, id: string, spot: ActivitySpot): boolean;
}

const isUse = (id: string | undefined) => (LITTER_USE_IDS as readonly string[]).includes(id ?? '');

export class LitterLife {
  /** Boxes each cat turned down since its last pile. */
  private refused = new Map<number, Set<string>>();
  /** Zoomies dashes left per cat. */
  private dashes = new Map<number, number>();
  /** Per walker ("c:<id>" / "p:<id>"): the tile it last rolled a grimace on, and its cooldown. */
  private passing = new Map<string, { tile: string; cooldown: number }>();
  /** Seconds since each cat's last pile (starts at a random point of LITTER_DUE_SEC). */
  private sinceVisit = new Map<number, number>();

  private readonly w: LitterWorld;
  private readonly rand: () => number;

  constructor(w: LitterWorld, rand: () => number = Math.random) {
    this.w = w;
    this.rand = rand;
  }

  /** Once per frame, after the character FSM. */
  update(dt: number): void {
    const world = this.w.petCare.world;
    for (const ch of this.w.characters.values()) {
      if (ch.grimaceSec) ch.grimaceSec = Math.max(0, ch.grimaceSec - dt);
      const since = this.sinceVisit.get(ch.id) ?? this.rand() * LITTER_DUE_SEC;
      this.sinceVisit.set(ch.id, since + dt);
      const run = ch.activity;
      if (run?.spot) this.watchRun(run);
    }
    const poops = new Set(world.floorPoops.map((p) => `${p.col},${p.row}`));
    setAvoidTiles(poops);
    this.grimaceAtPoops(dt, poops);
  }

  /** Refuse an overflowing box on arrival; drop the pile as covering starts. */
  private watchRun(run: IdleActivityRun): void {
    const uid = run.spot?.itemUid;
    const world = this.w.petCare.world;
    if (isUse(run.id) && uid) {
      // At arrival: a box cleaned while the cat walked there is fine again.
      const arriving = run.phase === 'doing' && run.part === 'intro' && (run.step ?? 0) === 0;
      if (arriving && world.isBoxRefused(uid)) {
        run.id = 'litterRefuse';
        const def = getIdleActivity(run.id);
        if (def) startAnim(run, def);
        return;
      }
    }
    if (run.phase !== 'doing' || run.part !== 'outro' || run.deposited) return;
    if (isUse(run.id) && uid) {
      run.deposited = true;
      this.w.petCare.catUsedBox(uid);
    } else if (run.id === 'litterFloor' && run.spot) {
      run.deposited = true;
      this.w.petCare.catFloorPoop(run.spot.col, run.spot.row);
    }
  }

  /**
   * An activity played to its end (characters.ts IdleWorld.finished). True
   * when the cat now does something new (another box, the floor, a dash).
   */
  finished(ch: Character, run: IdleActivityRun): boolean {
    if (isUse(run.id) || run.id === 'litterFloor') this.sinceVisit.set(ch.id, 0);
    if (isUse(run.id)) {
      this.refused.delete(ch.id);
      if (this.rand() < LITTER_ZOOMIES_CHANCE) {
        const n =
          ZOOMIES_DASHES_MIN +
          Math.floor(this.rand() * (ZOOMIES_DASHES_MAX - ZOOMIES_DASHES_MIN + 1));
        this.dashes.set(ch.id, n);
        if (this.dash(ch)) return true;
      }
      return this.stepOff(ch);
    }
    switch (run.id) {
      case 'litterRefuse': {
        const refused = this.refused.get(ch.id) ?? new Set<string>();
        if (run.spot?.itemUid) refused.add(run.spot.itemUid);
        this.refused.set(ch.id, refused);
        return this.nextBox(ch, refused) || this.floor(ch);
      }
      case 'litterFloor':
        // Off it sheepishly: the pile shows once the cat steps away.
        this.refused.delete(ch.id);
        return this.stepOff(ch);
      case 'zoomies':
        return this.dash(ch);
      default:
        return false;
    }
  }

  /** An idle pick: a cat due for a box walks to the nearest free one. False: not due, or none. */
  startDue(ch: Character): boolean {
    if ((this.sinceVisit.get(ch.id) ?? 0) < LITTER_DUE_SEC) return false;
    return this.nextBox(ch, new Set());
  }

  /** The nearest box this cat has not refused yet, free for it. */
  private nextBox(ch: Character, refused: Set<string>): boolean {
    const taken = this.w.takenBy(ch);
    const options: Array<{ id: string; spot: ActivitySpot }> = [];
    for (const id of LITTER_USE_IDS) {
      for (const spot of this.w.activitySpots.get(id)?.spots ?? []) {
        const uid = spot.itemUid;
        // A refused box counts again once someone cleaned it.
        const stillRefused = !!uid && refused.has(uid) && this.w.petCare.world.isBoxRefused(uid);
        if (uid && !stillRefused && !taken.has(spot.key)) {
          options.push({ id, spot });
        }
      }
    }
    const dist = (s: ActivitySpot) => Math.abs(s.col - ch.tileCol) + Math.abs(s.row - ch.tileRow);
    options.sort((a, b) => dist(a.spot) - dist(b.spot));
    return options.some((o) => this.w.startActivityAt(ch, o.id, o.spot));
  }

  /** Every box refused: an accident on a floor tile next to here. */
  private floor(ch: Character): boolean {
    const taken = this.w.takenBy(ch);
    const env = {
      furniture: this.w.placedFurniture(),
      tileMap: this.w.tileMap,
      blockedTiles: this.w.blockedTiles,
    };
    const at = floorSpotNear(
      ch.tileCol,
      ch.tileRow,
      env,
      this.w.petCare.world,
      (k) => !taken.has(k),
    );
    if (!at) {
      this.refused.delete(ch.id);
      return false;
    }
    return this.w.startActivityAt(ch, 'litterFloor', plainSpot(at.col, at.row, Direction.RIGHT));
  }

  /** One zoomies sprint to a far tile (the skid plays there). False when none are left. */
  private dash(ch: Character): boolean {
    const left = this.dashes.get(ch.id) ?? 0;
    if (left <= 0 || ch.isActive) {
      this.dashes.delete(ch.id);
      return false;
    }
    this.dashes.set(ch.id, left - 1);
    const taken = this.w.takenBy(ch);
    const env = {
      furniture: this.w.placedFurniture(),
      tileMap: this.w.tileMap,
      blockedTiles: this.w.blockedTiles,
    };
    const to = zoomiesTarget(ch.tileCol, ch.tileRow, env, this.rand, (k) => !taken.has(k));
    if (!to) return false;
    const facing = to.col >= ch.tileCol ? Direction.RIGHT : Direction.LEFT;
    return this.w.startActivityAt(ch, 'zoomies', plainSpot(to.col, to.row, facing));
  }

  /** One step off the box (a proud exit) or off the accident, onto a free floor tile. */
  private stepOff(ch: Character): boolean {
    const taken = this.w.takenBy(ch);
    const boxes = this.boxTiles();
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const col = ch.tileCol + dc;
      const row = ch.tileRow + dr;
      const key = `${col},${row}`;
      if (taken.has(key) || boxes.has(key)) continue;
      if (!isWalkable(col, row, this.w.tileMap, this.w.blockedTiles)) continue;
      ch.path = [{ col, row }];
      ch.moveProgress = 0;
      ch.state = CharacterState.WALK;
      ch.frame = 0;
      ch.frameTimer = 0;
      return true;
    }
    return false;
  }

  private boxTiles(): Set<string> {
    return new Set(
      this.w
        .placedFurniture()
        .filter((f) => isLitterBoxType(f.type))
        .map((f) => `${f.col},${f.row}`),
    );
  }

  /** A walking cat next to a floor poop may pull a face (once per tile, with a cooldown). */
  private grimaceAtPoops(dt: number, poops: Set<string>): void {
    for (const p of this.passing.values()) p.cooldown = Math.max(0, p.cooldown - dt);
    if (poops.size === 0) return;
    const near = (col: number, row: number) => {
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) if (poops.has(`${col + dc},${row + dr}`)) return true;
      return false;
    };
    const roll = (who: string, col: number, row: number): boolean => {
      const tile = `${col},${row}`;
      const p = this.passing.get(who) ?? { tile: '', cooldown: 0 };
      this.passing.set(who, p);
      if (p.tile === tile) return false;
      p.tile = tile;
      if (p.cooldown > 0 || !near(col, row) || this.rand() >= POOP_GRIMACE_CHANCE) return false;
      p.cooldown = POOP_GRIMACE_COOLDOWN_SEC;
      return true;
    };
    for (const ch of this.w.characters.values()) {
      if (ch.state !== CharacterState.WALK) continue;
      if (roll(`c:${ch.id}`, ch.tileCol, ch.tileRow)) ch.grimaceSec = POOP_GRIMACE_SEC;
    }
    for (const pet of this.w.pets) {
      if (pet.state !== PetState.WALK) continue;
      if (roll(`p:${pet.id}`, pet.tileCol, pet.tileRow)) pet.grimaceSec = POOP_GRIMACE_SEC;
    }
  }
}

function plainSpot(col: number, row: number, facing: Direction): ActivitySpot {
  return { key: `${col},${row}`, col, row, facing, onFurniture: false, offsetX: 0, offsetY: 0 };
}
