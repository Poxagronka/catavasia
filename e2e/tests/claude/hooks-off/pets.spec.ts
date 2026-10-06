import type { Frame } from '@playwright/test';
import fs from 'fs';
import path from 'path';

import { expect, test } from '../../../fixtures/pixel-agents';
import { closeBottomPanel, getPixelAgentsFrame, reopenBottomPanel } from '../../../helpers/webview';

/**
 * e2e coverage for the animated pet system.
 *
 * Pets render only on the canvas (no DOM nodes) and the heart bubble is pure
 * runtime state that is never persisted, so the live assertions read pet state
 * through `window.__pixelAgentsTestHooks.getPets()` / `.petClick()` — the same
 * state-driving approach `selectAgent` uses for characters (see
 * webview-ui/src/testHooks.ts and the comment on closeAgent in
 * e2e/helpers/office.ts). Pets spawn at a random walkable tile, so tests never
 * compute screen coordinates; they read pet ids/state back instead.
 *
 * Placement itself goes through the REAL UI path: Cats → Pets tab →
 * "+ Pet dog" / "+ Pet cat" → addPet → commitPets (saves the layout). Only the
 * canvas-only interactions (hit-test geometry of getPetAt) are bypassed.
 * Counts are relative to the pets the default layout already places.
 *
 * These tests have no hook dependency; they live under hooks-off purely
 * because that is the lighter fixture path (no hook-server wait).
 */

interface PetSnapshot {
  id: string;
  name: string;
  petType: number;
  state: 'idle' | 'walk' | 'follow';
  x: number;
  y: number;
  bubbleType: 'heart' | null;
}

interface PetTestHooks {
  getPets?: () => PetSnapshot[];
  petClick?: (petId: string) => void;
  messageLog?: Array<{ type: string }>;
}

type PetWindow = Window & { __pixelAgentsTestHooks?: PetTestHooks };

/**
 * Dismiss the first-run "Instant Detection Active" tooltip
 * that overlays the top toolbar and would otherwise intercept the Layout click.
 * Mirrors the layout-editor smoke test in hooks-on/lifecycle.spec.ts.
 */
async function dismissFirstRunTooltips(frame: Frame): Promise<void> {
  for (const tooltipText of ['Instant Detection Active']) {
    const tooltip = frame.locator('div', { hasText: tooltipText }).first();
    if (await tooltip.isVisible().catch(() => false)) {
      const closeBtn = tooltip.locator('button', { hasText: 'x' }).first();
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click().catch(() => {});
      }
    }
  }
}

/** Open the Cats menu → Pets tab, the only pet editor. */
async function openPetsTab(frame: Frame): Promise<void> {
  await dismissFirstRunTooltips(frame);
  await frame.locator('button[title="Agent cats and pets"]').click();
  await frame.locator('button', { hasText: /^Pets \(\d+\)$/ }).click();
  await expect(addButton(frame, 'dog')).toBeVisible({ timeout: 15_000 });
}

function addButton(frame: Frame, species: 'cat' | 'dog') {
  return frame.locator('button', { hasText: `+ Pet ${species}` });
}

/** Wait until the canvas holds exactly `count` pets. */
async function waitForPetCount(frame: Frame, count: number): Promise<void> {
  await frame.waitForFunction(
    (n) => ((window as PetWindow).__pixelAgentsTestHooks?.getPets?.() ?? []).length === n,
    count,
  );
}

/** Point-in-time snapshot of every live pet, read from the test hook. */
async function readPets(frame: Frame): Promise<PetSnapshot[]> {
  return frame.evaluate(() => {
    const w = window as PetWindow;
    return w.__pixelAgentsTestHooks?.getPets?.() ?? [];
  });
}

/** Toggle a pet's heart bubble exactly as a canvas click would. */
async function petClick(frame: Frame, petId: string): Promise<void> {
  await frame.evaluate((id) => {
    (window as PetWindow).__pixelAgentsTestHooks?.petClick?.(id);
  }, petId);
}

test.describe('Pets', () => {
  test('pet sprites load, broadcast, and expose manifest names in the editor @area:pets', async ({
    pixelAgents,
  }) => {
    const { frame, narrator } = pixelAgents;

    // The petSpritesLoaded broadcast is sent once after webviewReady. Proven
    // delivered via the message log (records every received message type).
    narrator.step('waiting for the pet sprites to broadcast to the webview');
    await frame.waitForFunction(() => {
      const w = window as PetWindow;
      const log = w.__pixelAgentsTestHooks?.messageLog ?? [];
      return log.some((m) => m.type === 'petSpritesLoaded');
    });
    narrator.check('petSpritesLoaded reached the client — pet assets delivered');

    // A new dog's list row shows its manifest `name` ("Claudio") as its kind.
    narrator.step('opening Cats → Pets and adding a dog');
    await openPetsTab(frame);
    await addButton(frame, 'dog').click();
    await expect(frame.locator('button', { hasText: 'Puppy' })).toContainText('Claudio');
    narrator.check('the new dog row reads "Puppy · Claudio" — manifest name surfaced');
  });

  test('adding and deleting a pet persists across a panel reload @area:pets', async ({
    pixelAgents,
  }) => {
    const { frame, window, tmpHome, narrator } = pixelAgents;

    const base = (await readPets(frame)).length;
    narrator.step('opening Cats → Pets');
    await openPetsTab(frame);

    narrator.step('adding a dog');
    await addButton(frame, 'dog').click();
    await waitForPetCount(frame, base + 1);
    narrator.check('one more pet on the canvas');

    // The new pet is selected: Delete asks, then removes it.
    narrator.step('deleting the dog');
    await frame.locator('button', { hasText: /^Delete$/ }).click();
    await frame.locator('button', { hasText: 'Remove Puppy from the office?' }).click();
    await waitForPetCount(frame, base);
    narrator.check('back to the starting pets');

    // Every change saves the layout at once (commitPets); there is no Save step.
    narrator.step('adding a dog and a cat');
    await addButton(frame, 'dog').click();
    await waitForPetCount(frame, base + 1);
    await addButton(frame, 'cat').click();
    await waitForPetCount(frame, base + 2);
    narrator.check('two more pets on the canvas');

    // The save round-trips through layoutPersistence to ~/.pixel-agents/layout.json
    // (under the fixture's isolated HOME). Pets are opaque pass-through server-side.
    const layoutPath = path.join(tmpHome, '.pixel-agents', 'layout.json');
    await expect
      .poll(
        () => {
          if (!fs.existsSync(layoutPath)) return -1;
          try {
            const parsed = JSON.parse(fs.readFileSync(layoutPath, 'utf8')) as {
              pets?: unknown[];
            };
            return Array.isArray(parsed.pets) ? parsed.pets.length : -1;
          } catch {
            return -1;
          }
        },
        { timeout: 10_000 },
      )
      .toBe(base + 2);
    narrator.check('~/.pixel-agents/layout.json holds the two new pets');

    // Reload the panel (webview is disposed + re-resolved since there is no
    // retainContextWhenHidden) and confirm the pets rehydrate from disk.
    // Reopen with the same ⌘J toggle rather than openPixelAgentsPanel: the
    // chord restores the panel as it was, without the palette "Show Panel" /
    // "Toggle Maximized Panel" overlays cluttering the end of the video.
    narrator.step('closing the bottom panel — the webview is disposed');
    await closeBottomPanel(window);
    narrator.step('reopening the panel — pets must rehydrate from disk');
    await reopenBottomPanel(window);
    const freshFrame = await getPixelAgentsFrame(window);
    await freshFrame.waitForFunction(
      (n) => ((window as PetWindow).__pixelAgentsTestHooks?.getPets?.() ?? []).length === n,
      base + 2,
      { timeout: 15_000 },
    );
    narrator.check('fresh webview shows the same pets — persisted across the reload');
  });

  test('clicking a pet shows a heart bubble that auto-dismisses and dismisses on re-click @area:pets', async ({
    pixelAgents,
  }) => {
    // `window` stays un-destructured here so the waitForFunction callbacks'
    // `window` keeps resolving to the DOM global for TypeScript.
    const { frame, narrator } = pixelAgents;

    // Place one pet through the editor, then read its id back (spawn tile is
    // random, so the id is the only stable handle).
    narrator.step('adding one dog via Cats → Pets');
    const before = new Set((await readPets(frame)).map((p) => p.id));
    await openPetsTab(frame);
    await addButton(frame, 'dog').click();
    await waitForPetCount(frame, before.size + 1);
    const petId = (await readPets(frame)).find((p) => !before.has(p.id))!.id;
    narrator.check('dog placed (getPets → one more)');

    // Click → heart bubble appears.
    narrator.step('clicking the pet — heart bubble should appear');
    await petClick(frame, petId);
    await frame.waitForFunction((id) => {
      const p = ((window as PetWindow).__pixelAgentsTestHooks?.getPets?.() ?? []).find(
        (x) => x.id === id,
      );
      return p?.bubbleType === 'heart';
    }, petId);
    narrator.check('heart bubble showing (bubbleType = heart)');

    // It auto-dismisses after WAITING_BUBBLE_DURATION_SEC (2s); the rAF loop
    // nulls bubbleType once the timer elapses. Timeout sits above 2s.
    narrator.step('waiting for the 2s auto-dismiss timer, no clicks');
    await frame.waitForFunction(
      (id) => {
        const p = ((window as PetWindow).__pixelAgentsTestHooks?.getPets?.() ?? []).find(
          (x) => x.id === id,
        );
        return p?.bubbleType === null;
      },
      petId,
      { timeout: 6_000 },
    );
    narrator.check('bubble auto-dismissed on its own (bubbleType = null)');

    // The 1s assertion below completes before the 2s auto-dismiss timer, so
    // a cleared bubble can only be the click-dismiss path.
    narrator.step('clicking again — heart bubble re-appears');
    await petClick(frame, petId);
    await frame.waitForFunction((id) => {
      const p = ((window as PetWindow).__pixelAgentsTestHooks?.getPets?.() ?? []).find(
        (x) => x.id === id,
      );
      return p?.bubbleType === 'heart';
    }, petId);
    narrator.check('heart bubble showing again');

    narrator.step('clicking while showing — must dismiss fast, not wait out the 2s timer');
    await petClick(frame, petId);
    await frame.waitForFunction(
      (id) => {
        const p = ((window as PetWindow).__pixelAgentsTestHooks?.getPets?.() ?? []).find(
          (x) => x.id === id,
        );
        return p?.bubbleType === null;
      },
      petId,
      { timeout: 1_000 },
    );
    narrator.check('bubble cleared within 1s of the click — fast-dismiss path confirmed');
  });
});
