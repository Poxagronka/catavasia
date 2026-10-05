/**
 * Stand-in characters ("actors") that let pet cats take part in social
 * scenes, spot contests and joint play. CatSocial speaks Character, so each
 * pet gets one actor with a stable id (PET_ACTOR_ID_BASE + n), never in
 * OfficeState.characters.
 *
 * Outside a scene the actor mirrors the pet (mirrorPet). Inside one the
 * scene moves the actor through the character FSM and the pet mirrors it
 * (mirrorActor): position, path, facing, walk frame and the social view the
 * renderer draws (bubbles, anger marks, the fight cloud).
 */
import { PET_ACTOR_ID_BASE } from '../../constants.js';
import type { Character, Pet } from '../types.js';
import { CharacterState, PetState } from '../types.js';
import { createCharacter } from './characters.js';

export function isPetActorId(id: number): boolean {
  return id >= PET_ACTOR_ID_BASE;
}

export class PetActors {
  private readonly byPet = new Map<string, Character>();
  private readonly petIdOf = new Map<number, string>();
  private next = PET_ACTOR_ID_BASE;

  /** The pet's actor, created on first use. */
  actorFor(pet: Pet): Character {
    let a = this.byPet.get(pet.id);
    if (!a) {
      a = createCharacter(this.next++, 0, null, null);
      a.isActive = false;
      a.state = CharacterState.IDLE;
      this.byPet.set(pet.id, a);
      this.petIdOf.set(a.id, pet.id);
      this.mirrorPet(pet, a, false);
      pet.actorId = a.id;
    }
    return a;
  }

  /** Pet id behind an actor id, or undefined. */
  petId(actorId: number): string | undefined {
    return this.petIdOf.get(actorId);
  }

  actors(): Character[] {
    return [...this.byPet.values()];
  }

  /** Forget actors of pets that left the office. */
  prune(pets: readonly Pet[]): void {
    const live = new Set(pets.map((p) => p.id));
    for (const [petId, a] of [...this.byPet]) {
      if (live.has(petId)) continue;
      this.byPet.delete(petId);
      this.petIdOf.delete(a.id);
    }
  }

  /**
   * Pet → actor, outside scenes. `busy`: a care pose or the menu owns the pet,
   * so the actor reads as working (no scene may start with it).
   */
  mirrorPet(pet: Pet, a: Character, busy: boolean): void {
    a.x = pet.x;
    a.y = pet.y;
    a.tileCol = pet.tileCol;
    a.tileRow = pet.tileRow;
    a.dir = pet.dir;
    a.path = pet.path.slice();
    a.moveProgress = pet.moveProgress;
    a.state = pet.state === PetState.IDLE ? CharacterState.IDLE : CharacterState.WALK;
    a.isActive = busy;
    a.social = undefined;
    a.speedMul = undefined;
    pet.social = undefined;
  }

  /** Actor → pet, inside a scene: the scene moves the actor, the pet follows. */
  mirrorActor(a: Character, pet: Pet): void {
    pet.x = a.x;
    pet.y = a.y;
    pet.tileCol = a.tileCol;
    pet.tileRow = a.tileRow;
    pet.dir = a.dir;
    pet.path = a.path.slice();
    pet.moveProgress = a.moveProgress;
    pet.state = a.state === CharacterState.WALK ? PetState.WALK : PetState.IDLE;
    if (pet.state === PetState.WALK) pet.frame = a.frame;
    pet.followTargetId = null;
    pet.social = a.social;
  }
}
