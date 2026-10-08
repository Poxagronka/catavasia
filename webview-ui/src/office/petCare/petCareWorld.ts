import {
  PET_BOWEL_MAX,
  PET_BOWEL_PER_HOUR,
  PET_BOWEL_PER_MEAL,
  PET_BOWL_FOOD_PER_MEAL,
  PET_BOWL_MAX,
  PET_BOWL_WATER_PER_DRINK,
  PET_GAIN_CHANGE_LITTER,
  PET_GAIN_CLEAN_BOX,
  PET_GAIN_CLEAN_FLOOR_POOP,
  PET_GAIN_DRINK,
  PET_GAIN_MEAL,
  PET_GAIN_PLAY,
  PET_GAIN_SCRATCH,
  PET_GAIN_TREAT,
  PET_LITTER_CAPACITY,
  PET_LITTER_DIRTY_AFTER,
  PET_LITTER_FULL,
  PET_POOP_HYGIENE_COST_BOX,
  PET_POOP_HYGIENE_COST_FLOOR,
} from '../../constants.js';
import type { Needs } from './petNeeds.js';
import {
  decayNeeds,
  freshNeeds,
  offlineCatchUpHours,
  raiseNeed,
  sanitizeNeeds,
} from './petNeeds.js';

/**
 * The pet-care world as data: per-cat needs, bowl contents, litter boxes and
 * floor poops. Pure (no OfficeState, no DOM), so it round-trips through
 * ~/.pixel-agents/pets-state.json and is unit-tested directly.
 */
export interface PetCareEntry {
  needs: Needs;
  /** 0..PET_BOWEL_MAX; at the max the cat goes to poop. */
  bowel: number;
}

export interface BowlState {
  food: number;
  water: number;
}

export interface FloorPoop {
  id: string;
  col: number;
  row: number;
}

export const PET_CARE_SNAPSHOT_VERSION = 1;

export interface PetCareSnapshot {
  version: number;
  /** Epoch ms of the save; drives the offline catch-up on load. */
  savedAt: number;
  pets: Record<string, PetCareEntry>;
  bowls: Record<string, BowlState>;
  /** Litter box uid → poops inside. */
  boxes: Record<string, number>;
  /** Litter box uid → uses since the litter was last changed (optional: added later). */
  litter?: Record<string, number>;
  floorPoops: FloorPoop[];
}

function clamp(v: unknown, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : fallback;
}

export class PetCareWorld {
  pets = new Map<string, PetCareEntry>();
  bowls = new Map<string, BowlState>();
  boxes = new Map<string, number>();
  /** Uses since the litter was changed (the sand look: fresh, used, dirty). */
  litter = new Map<string, number>();
  floorPoops: FloorPoop[] = [];
  private nextPoopId = 1;

  /** The cat's entry, created with fresh needs on first sight. */
  entry(petId: string): PetCareEntry {
    let e = this.pets.get(petId);
    if (!e) {
      e = { needs: freshNeeds(), bowel: 0 };
      this.pets.set(petId, e);
    }
    return e;
  }

  /** A bowl's contents; a bowl never seen before starts full. */
  bowl(uid: string): BowlState {
    let b = this.bowls.get(uid);
    if (!b) {
      b = { food: PET_BOWL_MAX, water: PET_BOWL_MAX };
      this.bowls.set(uid, b);
    }
    return b;
  }

  boxCount(uid: string): number {
    return this.boxes.get(uid) ?? 0;
  }

  litterUses(uid: string): number {
    return this.litter.get(uid) ?? 0;
  }

  /** Full: it stinks (and lowers hygiene), but a cat still uses it once more. */
  isBoxFull(uid: string): boolean {
    return this.boxCount(uid) >= PET_LITTER_FULL;
  }

  /** Overflowing with flies: every cat grimaces and refuses it. */
  isBoxRefused(uid: string): boolean {
    return this.boxCount(uid) >= PET_LITTER_CAPACITY;
  }

  /** One more pile in a box (an agent cat, or a pet via poop()). False when refused. */
  deposit(uid: string): boolean {
    if (this.isBoxRefused(uid)) return false;
    this.boxes.set(uid, this.boxCount(uid) + 1);
    this.litter.set(uid, Math.min(PET_LITTER_DIRTY_AFTER, this.litterUses(uid) + 1));
    return true;
  }

  /** A pile on the floor at (col, row); returns its id. */
  floorPoop(col: number, row: number): string {
    const id = `poop-${Date.now()}-${this.nextPoopId++}`;
    this.floorPoops.push({ id, col, row });
    return id;
  }

  /** Advance `hours` of office time for every known cat. `bowelMul`: its personality's bowel fill. */
  tick(hours: number, fullBoxes: number, bowelMul: (petId: string) => number = () => 1): void {
    const env = { floorPoops: this.floorPoops.length, fullBoxes };
    for (const [petId, e] of this.pets) {
      decayNeeds(e.needs, hours, env);
      e.bowel = Math.min(PET_BOWEL_MAX, e.bowel + PET_BOWEL_PER_HOUR * hours * bowelMul(petId));
    }
  }

  /** Eat one meal from a bowl. Gain scales with what is left; false if empty. */
  eat(petId: string, bowlUid: string, bowelMul = 1): boolean {
    const b = this.bowl(bowlUid);
    const portion = Math.min(b.food, PET_BOWL_FOOD_PER_MEAL);
    if (portion <= 0) return false;
    b.food -= portion;
    const e = this.entry(petId);
    raiseNeed(e.needs, 'hunger', (PET_GAIN_MEAL * portion) / PET_BOWL_FOOD_PER_MEAL);
    e.bowel = Math.min(PET_BOWEL_MAX, e.bowel + PET_BOWEL_PER_MEAL * bowelMul);
    return true;
  }

  drink(petId: string, bowlUid: string): boolean {
    const b = this.bowl(bowlUid);
    const portion = Math.min(b.water, PET_BOWL_WATER_PER_DRINK);
    if (portion <= 0) return false;
    b.water -= portion;
    raiseNeed(
      this.entry(petId).needs,
      'thirst',
      (PET_GAIN_DRINK * portion) / PET_BOWL_WATER_PER_DRINK,
    );
    return true;
  }

  /** Hand-fed treat or water (no bowl reachable). */
  treat(petId: string, need: 'hunger' | 'thirst'): void {
    raiseNeed(this.entry(petId).needs, need, PET_GAIN_TREAT);
  }

  scratch(petId: string): void {
    raiseNeed(this.entry(petId).needs, 'affection', PET_GAIN_SCRATCH);
  }

  play(petId: string): void {
    raiseNeed(this.entry(petId).needs, 'fun', PET_GAIN_PLAY);
  }

  refillBowl(uid: string): void {
    this.bowls.set(uid, { food: PET_BOWL_MAX, water: PET_BOWL_MAX });
  }

  /** Poop into a box with room, else onto the floor at (col, row). */
  poop(petId: string, boxUid: string | null, col: number, row: number): 'box' | 'floor' {
    const e = this.entry(petId);
    e.bowel = 0;
    if (boxUid !== null && this.deposit(boxUid)) {
      raiseNeed(e.needs, 'hygiene', -PET_POOP_HYGIENE_COST_BOX);
      return 'box';
    }
    this.floorPoop(col, row);
    raiseNeed(e.needs, 'hygiene', -PET_POOP_HYGIENE_COST_FLOOR);
    return 'floor';
  }

  /** Empty a box. Returns the poops removed (0 = nothing to clean). */
  cleanBox(uid: string): number {
    const n = this.boxCount(uid);
    if (n === 0) return 0;
    this.boxes.set(uid, 0);
    this.raiseAll('hygiene', PET_GAIN_CLEAN_BOX);
    return n;
  }

  /** New litter: no piles, fresh sand. False when there is nothing to change. */
  changeLitter(uid: string): boolean {
    if (this.boxCount(uid) === 0 && this.litterUses(uid) === 0) return false;
    this.boxes.set(uid, 0);
    this.litter.set(uid, 0);
    this.raiseAll('hygiene', PET_GAIN_CHANGE_LITTER);
    return true;
  }

  cleanFloorPoop(id: string): boolean {
    const before = this.floorPoops.length;
    this.floorPoops = this.floorPoops.filter((p) => p.id !== id);
    if (this.floorPoops.length === before) return false;
    this.raiseAll('hygiene', PET_GAIN_CLEAN_FLOOR_POOP);
    return true;
  }

  /** Empty every box and pick up every floor poop. Returns the poops removed. */
  cleanAll(): number {
    let n = 0;
    for (const uid of this.boxes.keys()) n += this.cleanBox(uid);
    for (const p of [...this.floorPoops]) if (this.cleanFloorPoop(p.id)) n++;
    return n;
  }

  private raiseAll(key: 'hygiene', amount: number): void {
    for (const e of this.pets.values()) raiseNeed(e.needs, key, amount);
  }

  toSnapshot(now: number): PetCareSnapshot {
    return {
      version: PET_CARE_SNAPSHOT_VERSION,
      savedAt: now,
      pets: Object.fromEntries(
        [...this.pets].map(([id, e]) => [id, { needs: { ...e.needs }, bowel: e.bowel }]),
      ),
      bowls: Object.fromEntries([...this.bowls].map(([uid, b]) => [uid, { ...b }])),
      boxes: Object.fromEntries(this.boxes),
      litter: Object.fromEntries(this.litter),
      floorPoops: this.floorPoops.map((p) => ({ ...p })),
    };
  }

  /**
   * Rebuild from an untrusted snapshot, then catch up the time the office was
   * closed (slowed and capped — see offlineCatchUpHours).
   */
  static fromSnapshot(raw: unknown, now: number): PetCareWorld {
    const w = new PetCareWorld();
    if (!raw || typeof raw !== 'object') return w;
    const s = raw as Partial<PetCareSnapshot>;
    for (const [id, e] of Object.entries(s.pets ?? {})) {
      w.pets.set(id, { needs: sanitizeNeeds(e?.needs), bowel: clamp(e?.bowel, PET_BOWEL_MAX, 0) });
    }
    for (const [uid, b] of Object.entries(s.bowls ?? {})) {
      w.bowls.set(uid, {
        food: clamp(b?.food, PET_BOWL_MAX, PET_BOWL_MAX),
        water: clamp(b?.water, PET_BOWL_MAX, PET_BOWL_MAX),
      });
    }
    for (const [uid, n] of Object.entries(s.boxes ?? {})) {
      w.boxes.set(uid, Math.round(clamp(n, PET_LITTER_CAPACITY, 0)));
    }
    for (const [uid, n] of Object.entries(s.litter ?? {})) {
      w.litter.set(uid, Math.round(clamp(n, PET_LITTER_DIRTY_AFTER, 0)));
    }
    if (Array.isArray(s.floorPoops)) {
      w.floorPoops = s.floorPoops
        .filter(
          (p) =>
            p && typeof p.id === 'string' && Number.isInteger(p.col) && Number.isInteger(p.row),
        )
        .map((p) => ({ id: p.id, col: p.col, row: p.row }));
    }
    const fullBoxes = [...w.boxes.keys()].filter((uid) => w.isBoxFull(uid)).length;
    const savedAt = typeof s.savedAt === 'number' ? s.savedAt : now;
    w.tick(offlineCatchUpHours(now - savedAt), fullBoxes);
    return w;
  }
}
