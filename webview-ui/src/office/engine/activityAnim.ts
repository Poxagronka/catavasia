/**
 * Activity animation: an intro played once on arrival, a loop that repeats
 * while the activity lasts, and an outro played once before the cat leaves.
 * Each step names a pose (scripts/cats/poses.mjs POSE_NAMES) and how long it
 * holds, so timing eases by holding key poses longer. A step can also move
 * the pose, turn the cat, nudge the toy in use, change the furniture frame
 * (a coffee machine brewing, a shelf with a book out) or show an effect.
 *
 * Pure module: no DOM.
 */

import { POSE_NAMES } from '../../../../scripts/cats/poses.mjs';
import type { Direction, IdleActivityRun } from '../types.js';
import type { FxKind } from './activityFx.js';

export interface AnimStep {
  /** Idle frame index (sheet frame - 7). */
  f: number;
  sec: number;
  /** Px the pose is drawn off the spot (a climb, a hop). */
  dx?: number;
  dy?: number;
  /** Face this way for the step (a turn in place, a spin). */
  dir?: Direction;
  /** Px the toy in use is drawn off its place (yarn rolls, a mouse darts). */
  px?: number;
  py?: number;
  /** Effect shown while the step plays, starting at frame px fxAt (default: above the head). */
  fx?: FxKind;
  fxAt?: FxAt;
  /** Animation frame of the furniture in use (0 = its idle look). */
  item?: number;
  /** Draw the walk cycle instead of a pose (a carried mug, a dash). */
  walk?: boolean;
}

/** Frame px of an effect: one point, or one per facing (front, back, side). */
export type FxAt =
  | readonly [number, number]
  | {
      readonly down: readonly [number, number];
      readonly up: readonly [number, number];
      readonly side: readonly [number, number];
    };

export interface AnimParts {
  intro?: readonly AnimStep[];
  loop: readonly AnimStep[];
  outro?: readonly AnimStep[];
}

const INDEX = new Map(POSE_NAMES.map((n, i) => [n, i]));

/** Idle frame index of a pose name (throws on a typo: caught by the tests at load). */
export function pose(name: string): number {
  const i = INDEX.get(name);
  if (i === undefined) throw new Error(`unknown cat pose "${name}"`);
  return i;
}

/** One step: pose `name` held `sec` seconds. */
export function st(name: string, sec: number, extra: Omit<AnimStep, 'f' | 'sec'> = {}): AnimStep {
  return { f: pose(name), sec, ...extra };
}

/** The step playing now, or undefined before the activity starts. */
export function currentStep(run: IdleActivityRun, anim: AnimParts): AnimStep | undefined {
  const part = run.part ?? 'loop';
  const steps = part === 'intro' ? anim.intro : part === 'outro' ? anim.outro : anim.loop;
  return steps?.[Math.min(run.step ?? 0, steps.length - 1)];
}

/** Start at the intro (or the loop when there is none). */
export function startAnim(run: IdleActivityRun, anim: AnimParts): void {
  run.part = anim.intro?.length ? 'intro' : 'loop';
  run.step = 0;
  run.stepT = 0;
  run.elapsed = 0;
}

/**
 * Advance by dt. The loop ends only at its last step once `run.timer` ran
 * out, so a motion is never cut halfway. Returns true when the outro (or the
 * loop, without an outro) is over.
 */
export function advanceAnim(run: IdleActivityRun, anim: AnimParts, dt: number): boolean {
  run.elapsed = (run.elapsed ?? 0) + dt;
  run.stepT = (run.stepT ?? 0) + dt;
  for (let guard = 0; guard < 64; guard++) {
    const step = currentStep(run, anim);
    if (!step) return true;
    if (run.stepT < step.sec) return false;
    run.stepT -= step.sec;
    run.step = (run.step ?? 0) + 1;
    const part = run.part ?? 'loop';
    if (part === 'intro' && run.step >= (anim.intro?.length ?? 0)) {
      run.part = 'loop';
      run.step = 0;
      // An empty loop is driven elsewhere (the tunnel run): stop here.
      if (anim.loop.length === 0) return false;
    } else if (part === 'loop' && run.step >= anim.loop.length) {
      run.step = 0;
      if (run.timer <= 0) {
        if (!anim.outro?.length) return true;
        run.part = 'outro';
      }
    } else if (part === 'outro' && run.step >= (anim.outro?.length ?? 0)) {
      return true;
    }
  }
  return false;
}

/** Total seconds of a list of steps. */
export function stepsSec(steps: readonly AnimStep[] = []): number {
  return steps.reduce((s, x) => s + x.sec, 0);
}
