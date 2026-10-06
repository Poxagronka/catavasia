import {
  CHARACTER_SITTING_OFFSET_PX,
  DEFAULT_MAX_CONTEXT_TOKENS,
  IDLE_ACTIVITY_PAUSE_MAX_SEC,
  IDLE_ACTIVITY_PAUSE_MIN_SEC,
  SEAT_REST_MAX_SEC,
  SEAT_REST_MIN_SEC,
  SPOT_CLAIM_RETRIES,
  TYPE_FRAME_DURATION_SEC,
  WALK_FRAME_DURATION_SEC,
  WALK_SPEED_PX_PER_SEC,
  WANDER_MOVES_BEFORE_REST_MAX,
  WANDER_MOVES_BEFORE_REST_MIN,
  WANDER_PAUSE_MAX_SEC,
  WANDER_PAUSE_MIN_SEC,
  ZOOMIES_SPEED_MUL,
} from '../../constants.js';
import { mirrorDirection } from '../layout/itemFrame.js';
import { findPath } from '../layout/tileMap.js';
import type { CharacterSprites } from '../sprites/spriteData.js';
import { isReadingToolName } from '../toolUtils.js';
import type {
  Character,
  HousePeek,
  IdleActivityRun,
  Seat,
  SpriteData,
  TileType as TileTypeVal,
} from '../types.js';
import { CharacterState, Direction, TILE_SIZE } from '../types.js';
import type { AnimParts, AnimStep } from './activityAnim.js';
import { advanceAnim, currentStep, pose, startAnim } from './activityAnim.js';
import type { ActivitySpotSet, IdleChoice } from './idleActivities.js';
import { chooseIdleActivity, getIdleActivity } from './idleActivities.js';
import { advanceRunThrough } from './runThrough.js';

/** What the idle-activity FSM needs from the office. */
export interface IdleWorld {
  spotSets: Map<string, ActivitySpotSet>;
  /** Spot keys this character must not pick (held by others, see spotReservations.ts). */
  takenBy: (ch: Character) => Set<string>;
  /**
   * Reserve the chosen spot as the walk starts. 'repick': another cat holds
   * it, choose again. 'fight': a contest fight started, the scene owns the cat.
   * Omitted: every spot is free (unit tests).
   */
  claim?: (ch: Character, choice: IdleChoice) => 'ok' | 'repick' | 'fight';
  /** Start the activity chained after one that just ended. True: the cat walks there. */
  startNext?: (ch: Character, id: string, from?: string) => boolean;
  /** An activity played to its end (not cut by work). True: something new started. */
  finished?: (ch: Character, run: IdleActivityRun) => boolean;
  /** Start a due activity before the weighted pick (a litter visit). True: it started. */
  due?: (ch: Character) => boolean;
}

/** Whether a tool should show the reading animation (vs typing). Taxonomy comes
 *  from the active HookProvider via the `providerCapabilities` message. */
export function isReadingTool(tool: string | null): boolean {
  if (!tool) return false;
  return isReadingToolName(tool);
}

/** Pixel center of a tile */
function tileCenter(col: number, row: number): { x: number; y: number } {
  return {
    x: col * TILE_SIZE + TILE_SIZE / 2,
    y: row * TILE_SIZE + TILE_SIZE / 2,
  };
}

/** Direction from one tile to an adjacent tile */
function directionBetween(
  fromCol: number,
  fromRow: number,
  toCol: number,
  toRow: number,
): Direction {
  const dc = toCol - fromCol;
  const dr = toRow - fromRow;
  if (dc > 0) return Direction.RIGHT;
  if (dc < 0) return Direction.LEFT;
  if (dr > 0) return Direction.DOWN;
  return Direction.UP;
}

export function createCharacter(
  id: number,
  palette: number,
  seatId: string | null,
  seat: Seat | null,
  hueShift = 0,
): Character {
  const col = seat ? seat.seatCol : 1;
  const row = seat ? seat.seatRow : 1;
  const center = tileCenter(col, row);
  return {
    id,
    state: CharacterState.TYPE,
    dir: seat ? seat.facingDir : Direction.DOWN,
    x: center.x,
    y: center.y,
    tileCol: col,
    tileRow: row,
    path: [],
    moveProgress: 0,
    currentTool: null,
    palette,
    hueShift,
    frame: 0,
    frameTimer: 0,
    wanderTimer: 0,
    wanderCount: 0,
    wanderLimit: randomInt(WANDER_MOVES_BEFORE_REST_MIN, WANDER_MOVES_BEFORE_REST_MAX),
    isActive: true,
    seatId,
    bubbleType: null,
    bubbleTimer: 0,
    seatTimer: 0,
    isSubagent: false,
    parentAgentId: null,
    matrixEffect: null,
    matrixEffectTimer: 0,
    matrixEffectSeeds: [],
    activity: null,
    lastActivityId: null,
    contextTokens: 0,
    maxContextTokens: DEFAULT_MAX_CONTEXT_TOKENS,
  };
}

export function updateCharacter(
  ch: Character,
  dt: number,
  walkableTiles: Array<{ col: number; row: number }>,
  seats: Map<string, Seat>,
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
  idle?: IdleWorld,
): void {
  ch.frameTimer += dt;

  switch (ch.state) {
    case CharacterState.TYPE: {
      if (ch.frameTimer >= TYPE_FRAME_DURATION_SEC) {
        ch.frameTimer -= TYPE_FRAME_DURATION_SEC;
        ch.frame = (ch.frame + 1) % 2;
      }
      // If no longer active, stand up and start wandering (after seatTimer expires)
      if (!ch.isActive) {
        if (ch.seatTimer > 0) {
          ch.seatTimer -= dt;
          break;
        }
        ch.seatTimer = 0; // clear sentinel
        // The rest at the desk ends the "wander" activity: pick a new one next.
        if (ch.activity?.id === 'wander') finishActivity(ch);
        ch.state = CharacterState.IDLE;
        ch.frame = 0;
        ch.frameTimer = 0;
        ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC);
        ch.wanderCount = 0;
        ch.wanderLimit = randomInt(WANDER_MOVES_BEFORE_REST_MIN, WANDER_MOVES_BEFORE_REST_MAX);
      }
      break;
    }

    case CharacterState.IDLE: {
      // No idle animation — static pose
      ch.frame = 0;
      if (ch.seatTimer < 0) ch.seatTimer = 0; // clear turn-end sentinel
      // If became active, pathfind to seat
      if (ch.isActive) {
        if (!ch.seatId) {
          // No seat assigned — type in place
          ch.state = CharacterState.TYPE;
          ch.frame = 0;
          ch.frameTimer = 0;
          break;
        }
        const seat = seats.get(ch.seatId);
        if (seat) {
          const path = findPath(
            ch.tileCol,
            ch.tileRow,
            seat.seatCol,
            seat.seatRow,
            tileMap,
            blockedTiles,
          );
          if (path.length > 0) {
            ch.path = path;
            ch.moveProgress = 0;
            ch.state = CharacterState.WALK;
            ch.frame = 0;
            ch.frameTimer = 0;
          } else {
            // Already at seat or no path — sit down
            ch.state = CharacterState.TYPE;
            ch.dir = seat.facingDir;
            ch.frame = 0;
            ch.frameTimer = 0;
          }
        }
        break;
      }
      // Countdown wander timer
      ch.wanderTimer -= dt;
      if (ch.wanderTimer <= 0 && idle && !ch.activity) {
        if (startIdleActivity(ch, idle, tileMap, blockedTiles)) break;
      }
      if (ch.wanderTimer <= 0) {
        // Check if we've wandered enough — return to seat for a rest
        if (ch.wanderCount >= ch.wanderLimit && idle && !ch.seatId) {
          // Nowhere to rest: the wander is over, pick something else.
          finishActivity(ch);
          ch.wanderTimer = randomRange(IDLE_ACTIVITY_PAUSE_MIN_SEC, IDLE_ACTIVITY_PAUSE_MAX_SEC);
          break;
        }
        if (ch.wanderCount >= ch.wanderLimit && ch.seatId) {
          const seat = seats.get(ch.seatId);
          if (seat) {
            const path = findPath(
              ch.tileCol,
              ch.tileRow,
              seat.seatCol,
              seat.seatRow,
              tileMap,
              blockedTiles,
            );
            if (path.length > 0) {
              ch.path = path;
              ch.moveProgress = 0;
              ch.state = CharacterState.WALK;
              ch.frame = 0;
              ch.frameTimer = 0;
              break;
            }
          }
        }
        if (walkableTiles.length > 0) {
          const target = walkableTiles[Math.floor(Math.random() * walkableTiles.length)];
          const path = findPath(
            ch.tileCol,
            ch.tileRow,
            target.col,
            target.row,
            tileMap,
            blockedTiles,
          );
          if (path.length > 0) {
            ch.path = path;
            ch.moveProgress = 0;
            ch.state = CharacterState.WALK;
            ch.frame = 0;
            ch.frameTimer = 0;
            ch.wanderCount++;
          }
        }
        ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC);
      }
      break;
    }

    case CharacterState.ACTIVITY: {
      const def = getIdleActivity(ch.activity?.id);
      // Work comes first: leave at once, the IDLE branch walks to the desk.
      // A work activity (reading a skill) plays to its end.
      if ((ch.isActive && !def?.work) || !ch.activity || !def) {
        snapToTile(ch); // out of a tunnel run, back on a real tile
        ch.activity = null;
        ch.state = CharacterState.IDLE;
        ch.frame = 0;
        ch.frameTimer = 0;
        break;
      }
      ch.activity.timer -= dt;
      const done =
        def.walkAnim && ch.activity.part === 'loop'
          ? runThroughDone(ch, ch.activity, def, dt)
          : advanceAnim(ch.activity, def, dt);
      if (done) {
        const run = ch.activity;
        // The cup a coffee chain carries comes from this machine.
        const from = ch.activity.cupFrom ?? ch.activity.spot?.itemUid;
        // A run-through cut short by the timer snaps back to a real tile.
        const center = tileCenter(ch.tileCol, ch.tileRow);
        ch.x = center.x;
        finishActivity(ch);
        ch.state = CharacterState.IDLE;
        ch.frame = 0;
        ch.frameTimer = 0;
        ch.wanderTimer = randomRange(IDLE_ACTIVITY_PAUSE_MIN_SEC, IDLE_ACTIVITY_PAUSE_MAX_SEC);
        // A follow-up (a litter visit: zoomies, another box) may start right away.
        if (idle?.finished?.(ch, run)) break;
        // A chained activity (coffee: brew, then sip, then bring the cup back) starts at once.
        if (def.next && idle?.startNext?.(ch, def.next, from)) break;
      }
      break;
    }

    case CharacterState.WALK: {
      // Walk animation
      const frameSec = WALK_FRAME_DURATION_SEC / walkSpeedMul(ch);
      if (ch.frameTimer >= frameSec) {
        ch.frameTimer -= frameSec;
        ch.frame = (ch.frame + 1) % 4;
      }

      if (ch.path.length === 0) {
        // Path complete — snap to tile center and transition
        const center = tileCenter(ch.tileCol, ch.tileRow);
        ch.x = center.x;
        ch.y = center.y;

        if (ch.activity?.phase === 'going' && isWorkRun(ch)) {
          arriveAtActivity(ch);
          break;
        } else if (ch.isActive) {
          if (!ch.seatId) {
            // No seat — type in place
            ch.state = CharacterState.TYPE;
          } else {
            const seat = seats.get(ch.seatId);
            if (seat && ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) {
              ch.state = CharacterState.TYPE;
              ch.dir = seat.facingDir;
            } else {
              ch.state = CharacterState.IDLE;
            }
          }
        } else if (ch.activity?.phase === 'going') {
          arriveAtActivity(ch);
          break;
        } else {
          // Check if arrived at assigned seat — sit down for a rest before wandering again
          if (ch.seatId) {
            const seat = seats.get(ch.seatId);
            if (seat && ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) {
              ch.state = CharacterState.TYPE;
              ch.dir = seat.facingDir;
              // seatTimer < 0 is a sentinel from setAgentActive(false) meaning
              // "turn just ended" — skip the long rest so idle transition is immediate
              if (ch.seatTimer < 0) {
                ch.seatTimer = 0;
              } else {
                ch.seatTimer = randomRange(SEAT_REST_MIN_SEC, SEAT_REST_MAX_SEC);
              }
              ch.wanderCount = 0;
              ch.wanderLimit = randomInt(
                WANDER_MOVES_BEFORE_REST_MIN,
                WANDER_MOVES_BEFORE_REST_MAX,
              );
              ch.frame = 0;
              ch.frameTimer = 0;
              break;
            }
          }
          ch.state = CharacterState.IDLE;
          ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC);
        }
        ch.frame = 0;
        ch.frameTimer = 0;
        break;
      }

      stepAlongPath(ch, dt);

      // If became active while wandering, repath to seat
      if (ch.isActive && ch.seatId && !isWorkRun(ch)) {
        const seat = seats.get(ch.seatId);
        if (seat) {
          const lastStep = ch.path[ch.path.length - 1];
          if (!lastStep || lastStep.col !== seat.seatCol || lastStep.row !== seat.seatRow) {
            const newPath = findPath(
              ch.tileCol,
              ch.tileRow,
              seat.seatCol,
              seat.seatRow,
              tileMap,
              blockedTiles,
            );
            if (newPath.length > 0) {
              ch.path = newPath;
              ch.moveProgress = 0;
            }
          }
        }
      }
      break;
    }
  }
}

/** Move one tick toward the next tile of `ch.path` (no-op on an empty path). */
export function stepAlongPath(ch: Character, dt: number): void {
  if (ch.path.length === 0) return;
  const nextTile = ch.path[0];
  ch.dir = directionBetween(ch.tileCol, ch.tileRow, nextTile.col, nextTile.row);

  ch.moveProgress += ((WALK_SPEED_PX_PER_SEC * walkSpeedMul(ch)) / TILE_SIZE) * dt;

  const fromCenter = tileCenter(ch.tileCol, ch.tileRow);
  const toCenter = tileCenter(nextTile.col, nextTile.row);
  const t = Math.min(ch.moveProgress, 1);
  ch.x = fromCenter.x + (toCenter.x - fromCenter.x) * t;
  ch.y = fromCenter.y + (toCenter.y - fromCenter.y) * t;

  if (ch.moveProgress >= 1) {
    // Arrived at next tile
    ch.tileCol = nextTile.col;
    ch.tileRow = nextTile.row;
    ch.x = toCenter.x;
    ch.y = toCenter.y;
    ch.path.shift();
    ch.moveProgress = 0;
  }
}

/** Px the sprite is drawn below ch.y: seated at a desk, or an activity spot on a sofa. */
export function characterDrawOffsetY(ch: Character): number {
  if (ch.state === CharacterState.TYPE) return CHARACTER_SITTING_OFFSET_PX;
  if (ch.state === CharacterState.ACTIVITY) {
    return (ch.activity?.spot?.offsetY ?? 0) + (activityStep(ch)?.dy ?? 0);
  }
  return 0;
}

/** Px the sprite is drawn right of ch.x: an activity pose reaching toward its toy. */
export function characterDrawOffsetX(ch: Character): number {
  if (ch.state !== CharacterState.ACTIVITY) return 0;
  const dx = activityStep(ch)?.dx ?? 0;
  return (ch.activity?.spot?.offsetX ?? 0) + (ch.dir === Direction.LEFT ? -dx : dx);
}

/**
 * The way a step faces: its own `dir` (LEFT and RIGHT swapped at a mirrored
 * item: poses are written for the item's front view), else the cat's.
 */
export function stepDirection(ch: Character, step: AnimStep): Direction {
  if (step.dir === undefined) return ch.dir;
  return ch.activity?.spot?.mirrored ? mirrorDirection(step.dir) : step.dir;
}

/** The animation step a cat at its activity plays now. */
export function activityStep(ch: Character): AnimStep | undefined {
  if (ch.state !== CharacterState.ACTIVITY || !ch.activity) return undefined;
  const def = getIdleActivity(ch.activity.id);
  if (!def || (def.walkAnim && ch.activity.part === 'loop')) return undefined;
  return currentStep(ch.activity, def);
}

/**
 * One tick of a run-through (tunnel). When the passes (or the time) are
 * over the cat is back on a tile and the outro plays; true when there is none.
 */
function runThroughDone(ch: Character, run: IdleActivityRun, def: AnimParts, dt: number): boolean {
  if (!advanceRunThrough(ch, run, dt) && run.timer > 0) return false;
  ch.x = tileCenter(ch.tileCol, ch.tileRow).x;
  if (!def.outro?.length) return true;
  run.part = 'outro';
  run.step = 0;
  run.stepT = 0;
  return false;
}

/** True while the cat dashes to a zoomies spot (a sprint activity's walk). */
export function isSprinting(ch: Character): boolean {
  return (
    ch.state === CharacterState.WALK &&
    ch.activity?.phase === 'going' &&
    !!getIdleActivity(ch.activity.id)?.sprint
  );
}

/** Walk speed multiplier: a social chase sets one, the zoomies sprint, else 1. */
function walkSpeedMul(ch: Character): number {
  return ch.speedMul ?? (isSprinting(ch) ? ZOOMIES_SPEED_MUL : 1);
}

/** True while the cat does (or walks to) an activity that runs during work. */
export function isWorkRun(ch: Character): boolean {
  return !!getIdleActivity(ch.activity?.id)?.work;
}

/** Walk cycle poses with a mug in the paws (sheet order walk1 walk2 walk3 walk2). */
const CARRY_WALK = ['carryWalk1', 'carryWalk2', 'carryWalk3', 'carryWalk2'] as const;

/** Px an activity pose's head sits below a standing head (0 outside activities). */
export function activityHeadDropY(ch: Character): number {
  if (ch.state !== CharacterState.ACTIVITY) return 0;
  return characterDrawOffsetY(ch) + (getIdleActivity(ch.activity?.id)?.lowPosePx ?? 0);
}

/** Get the correct sprite frame for a character's current state and direction */
export function getCharacterSprite(ch: Character, sprites: CharacterSprites): SpriteData {
  switch (ch.state) {
    case CharacterState.TYPE:
      if (isReadingTool(ch.currentTool) || (ch.deskReadSec ?? 0) > 0) {
        return sprites.reading[ch.dir][ch.frame % 2];
      }
      return sprites.typing[ch.dir][ch.frame % 2];
    case CharacterState.WALK: {
      // Walking to an activity that starts with a mug in the paws: carry it.
      const carry =
        ch.activity?.phase === 'going' && getIdleActivity(ch.activity.id)?.carry
          ? sprites.idle[ch.dir][pose(CARRY_WALK[ch.frame % 4])]
          : undefined;
      return carry ?? sprites.walk[ch.dir][ch.frame % 4];
    }
    case CharacterState.ACTIVITY: {
      const def = getIdleActivity(ch.activity?.id);
      if (def?.walkAnim && ch.activity?.part === 'loop') return sprites.walk[ch.dir][ch.frame % 4];
      const step = activityStep(ch);
      if (!step) return sprites.walk[ch.dir][1];
      const dir = stepDirection(ch, step);
      if (step.walk) {
        const n = Math.floor((ch.activity?.elapsed ?? 0) / WALK_FRAME_DURATION_SEC) % 4;
        return sprites.walk[dir][n];
      }
      return sprites.idle[dir][step.f] ?? sprites.walk[ch.dir][1];
    }
    case CharacterState.IDLE:
      return sprites.walk[ch.dir][1];
    default:
      return sprites.walk[ch.dir][1];
  }
}

/** Put the character back on its tile center (a tunnel run moves x between tiles). */
export function snapToTile(ch: Character): void {
  const center = tileCenter(ch.tileCol, ch.tileRow);
  ch.x = center.x;
  ch.y = center.y;
}

/** End the current activity and remember it so the next pick differs. */
function finishActivity(ch: Character): void {
  if (ch.activity) ch.lastActivityId = ch.activity.id;
  ch.activity = null;
}

/**
 * Pick the next idle activity. Returns true when the character is now walking
 * to a spot; false for "wander" (the IDLE branch runs it) or no option.
 */
function startIdleActivity(
  ch: Character,
  idle: IdleWorld,
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
): boolean {
  if (idle.due?.(ch)) return true;
  const taken = idle.takenBy(ch);
  for (let i = 0; i < SPOT_CLAIM_RETRIES; i++) {
    const choice = chooseIdleActivity(ch.lastActivityId, idle.spotSets, taken);
    if (!choice) return false;
    const outcome = choice.spot && idle.claim ? idle.claim(ch, choice) : 'ok';
    if (outcome === 'ok') return beginIdleActivity(ch, choice, tileMap, blockedTiles);
    if (outcome === 'fight') return true;
    taken.add(choice.spot!.key); // lost the spot: pick another one
  }
  ch.wanderTimer = randomRange(IDLE_ACTIVITY_PAUSE_MIN_SEC, IDLE_ACTIVITY_PAUSE_MAX_SEC);
  return true;
}

/** Start a chosen activity: walk to its spot, or set up the wander. */
export function beginIdleActivity(
  ch: Character,
  choice: IdleChoice,
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
): boolean {
  if (!choice.spot && choice.def.inPlace) {
    // Right here, facing the viewer or to a random side.
    const facing =
      choice.def.inPlace === 'front'
        ? Direction.DOWN
        : Math.random() < 0.5
          ? Direction.LEFT
          : Direction.RIGHT;
    const key = `${ch.tileCol},${ch.tileRow}`;
    const here = { key, col: ch.tileCol, row: ch.tileRow, facing, onFurniture: false };
    ch.activity = {
      id: choice.def.id,
      spot: { ...here, offsetX: 0, offsetY: 0 },
      phase: 'going',
      timer: 0,
    };
    ch.path = [];
    arriveAtActivity(ch);
    return true;
  }
  if (!choice.spot) {
    ch.activity = { id: choice.def.id, spot: null, phase: 'doing', timer: 0 };
    ch.wanderCount = 0;
    ch.wanderLimit = randomInt(WANDER_MOVES_BEFORE_REST_MIN, WANDER_MOVES_BEFORE_REST_MAX);
    return false;
  }
  const spot = choice.spot;
  ch.activity = { id: choice.def.id, spot, phase: 'going', timer: 0 };
  if (ch.tileCol === spot.col && ch.tileRow === spot.row) {
    arriveAtActivity(ch);
    return true;
  }
  let blocked = blockedTiles;
  if (spot.onFurniture) {
    blocked = new Set(blockedTiles);
    blocked.delete(spot.key);
  }
  const path = findPath(ch.tileCol, ch.tileRow, spot.col, spot.row, tileMap, blocked);
  if (path.length === 0) {
    // Unreachable: count it as done so the next pick tries something else.
    finishActivity(ch);
    ch.wanderTimer = randomRange(IDLE_ACTIVITY_PAUSE_MIN_SEC, IDLE_ACTIVITY_PAUSE_MAX_SEC);
    return false;
  }
  ch.path = path;
  ch.moveProgress = 0;
  ch.state = CharacterState.WALK;
  ch.frame = 0;
  ch.frameTimer = 0;
  return true;
}

/** Walk ended: start the activity if the character stands on its spot. */
function arriveAtActivity(ch: Character): void {
  const run = ch.activity;
  const def = getIdleActivity(run?.id);
  ch.frame = 0;
  ch.frameTimer = 0;
  if (!run?.spot || !def || ch.tileCol !== run.spot.col || ch.tileRow !== run.spot.row) {
    finishActivity(ch);
    ch.state = CharacterState.IDLE;
    ch.wanderTimer = randomRange(IDLE_ACTIVITY_PAUSE_MIN_SEC, IDLE_ACTIVITY_PAUSE_MAX_SEC);
    return;
  }
  run.phase = 'doing';
  startAnim(run, def);
  run.timer = randomRange(def.durationSec[0], def.durationSec[1]);
  ch.dir = run.spot.facing;
  ch.state = CharacterState.ACTIVITY;
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * The peek to draw instead of the cat now, if any: always inside a house; in
 * a hooded litter box (`peekOnHide`) only on the steps it is inside (`hide`).
 */
export function peekNow(ch: Character): HousePeek | undefined {
  if (ch.state !== CharacterState.ACTIVITY || !ch.activity?.spot?.peek) return undefined;
  if (getIdleActivity(ch.activity.id)?.peekOnHide && !activityStep(ch)?.hide) return undefined;
  return ch.activity.spot.peek;
}
