/**
 * The Intro's step model and the greeter's walk to what each step shows: the
 * step order (consent stays the third step and the step after it is where a
 * choice lands), the walk next to the real furniture of the default office,
 * and the fallback — an office without the item keeps the greeter in place.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, test } from 'vitest';

import { buildFurnitureCatalog } from '../../core/src/assets/build.ts';
import {
  AFTER_CONSENT_STEP,
  CLOSING_STEP,
  CONSENT_STEP,
  INTRO_STEP_COUNT,
  INTRO_STEPS,
} from '../src/components/introSteps.js';
import { OfficeState } from '../src/office/engine/officeState.js';
import { buildDynamicCatalog, furnitureKind } from '../src/office/layout/furnitureCatalog.js';
import type { OfficeLayout } from '../src/office/types.js';
import { CharacterState } from '../src/office/types.js';

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');

beforeAll(() => {
  const catalog = buildFurnitureCatalog(ASSETS);
  const sprites = Object.fromEntries(catalog.map((c) => [c.id, [['']]]));
  assert.ok(buildDynamicCatalog({ catalog, sprites } as never));
});

function defaultLayout(): OfficeLayout {
  const file = path.join(ASSETS, 'default-layout-10.json');
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as OfficeLayout;
}

/** Spawn the greeter and let its materialization finish. */
function greeterIn(layout: OfficeLayout): OfficeState {
  const os = new OfficeState(layout);
  os.spawnGreeter();
  for (let t = 0; t < 2; t += 0.05) os.update(0.05);
  assert.ok(os.greeter, 'greeter spawned');
  return os;
}

function walkUntilStill(os: OfficeState): void {
  for (let t = 0; t < 60; t += 0.05) {
    if (os.greeter!.state !== CharacterState.WALK) return;
    os.update(0.05);
  }
  assert.fail('the greeter never arrived');
}

const visitOf = (id: string) => INTRO_STEPS.find((s) => s.id === id)!.visit;

test('seven steps; consent is third and a choice lands on the step after it', () => {
  assert.equal(INTRO_STEP_COUNT, 7);
  assert.deepEqual(
    INTRO_STEPS.map((s) => s.id),
    ['welcome', 'engines', 'consent', 'ceo', 'lead', 'office', 'closing'],
  );
  assert.equal(CONSENT_STEP, 2);
  assert.equal(AFTER_CONSENT_STEP, 3);
  assert.equal(CLOSING_STEP, INTRO_STEP_COUNT - 1);
  assert.deepEqual(INTRO_STEPS[CONSENT_STEP].visit, [], 'the consent step does not walk');
});

test('every feature step finds its item in the default office', () => {
  const kinds = new Set(defaultLayout().furniture.map((f) => furnitureKind(f.type)));
  for (const id of ['ceo', 'lead', 'office']) {
    assert.ok(
      visitOf(id).some((k) => kinds.has(k)),
      `${id}: one of ${visitOf(id).join(', ')} is in the office`,
    );
  }
});

test('the greeter walks next to the lead desk and stops there', () => {
  const layout = defaultLayout();
  const desk = layout.furniture.find((f) => furnitureKind(f.type) === 'LEAD_DESK')!;
  const os = greeterIn(layout);
  assert.equal(os.greeterVisit(visitOf('lead')), true);
  assert.equal(os.greeter!.state, CharacterState.WALK);
  walkUntilStill(os);
  const g = os.greeter!;
  assert.equal(g.state, CharacterState.IDLE);
  assert.ok(Math.abs(g.tileCol - desk.col) <= 4 && Math.abs(g.tileRow - desk.row) <= 4);
});

test('an office without the item keeps the greeter in place (same tour, no walk)', () => {
  const layout = defaultLayout();
  layout.furniture = layout.furniture.filter(
    (f) => !visitOf('lead').includes(furnitureKind(f.type)),
  );
  const os = greeterIn(layout);
  const before = { col: os.greeter!.tileCol, row: os.greeter!.tileRow };
  assert.equal(os.greeterVisit(visitOf('lead')), false);
  for (let t = 0; t < 5; t += 0.05) os.update(0.05);
  assert.deepEqual({ col: os.greeter!.tileCol, row: os.greeter!.tileRow }, before);
  assert.equal(os.greeter!.state, CharacterState.IDLE);
});

test('a step with nothing to show does not move the greeter', () => {
  const os = greeterIn(defaultLayout());
  assert.equal(os.greeterVisit(visitOf('consent')), false);
  assert.equal(os.greeter!.state, CharacterState.IDLE);
});

test('a later preference is used when the first kind is missing', () => {
  const layout = defaultLayout();
  layout.furniture = layout.furniture.filter((f) => furnitureKind(f.type) !== 'SCRATCHING_POST');
  const os = greeterIn(layout);
  assert.equal(os.greeterVisit(visitOf('office')), true, 'falls through to the next kind');
  walkUntilStill(os);
});
