import type { Locator } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Drivers for the Intro — the first-run tour the greeter speaks
 * (webview-ui/src/components/IntroBubble.tsx, steps in introSteps.ts):
 * welcome → engines → consent → CEO → lead → office → all set.
 * Locator-based so the same helpers drive both surfaces: the VS Code webview
 * frame and the standalone browser page.
 *
 * Every click waits for the step to change before the next one: the buttons
 * keep their accessible names across steps, so blind clicks could double-fire
 * on one step and pass over a tour that never advanced.
 */

/** The feature steps between the consent step and the closing step. */
const FEATURE_TITLES = ['The Cat CEO', 'The team lead and the Cats menu', 'Your office'];
const CLOSING_TITLES = ["You're all set!", "Hooks couldn't be installed"];

/**
 * Click a step button and wait until the tour shows another step. The bubble
 * follows the walking greeter and the drifting camera, so a click can land
 * where the button just was: retry, but only while the step has not changed
 * (a second click on the next step would skip it).
 */
async function clickToNextStep(dialog: Locator, name: string): Promise<void> {
  const before = (await dialog.getAttribute('aria-label')) ?? '';
  await expect(async () => {
    if ((await dialog.getAttribute('aria-label')) !== before) return;
    await dialog.getByRole('button', { name, exact: true }).click({ timeout: 2_000 });
    await expect(dialog).not.toHaveAttribute('aria-label', before, { timeout: 1_500 });
  }).toPass({ timeout: 15_000 });
}

/** Walk the Intro from its opening step to the consent step. */
export async function advanceIntroToConsentStep(dialog: Locator): Promise<void> {
  await expect(dialog).toContainText('Welcome to catavasia!');
  await clickToNextStep(dialog, 'Continue');
  await expect(dialog).toContainText('Codex');
  await clickToNextStep(dialog, 'Continue');
  await expect(dialog.getByRole('button', { name: 'Install Hooks' })).toBeVisible();
}

/**
 * Page from the step after the consent answer to the closing step, checking
 * each feature step on the way. Waits out a held install first (its verdict
 * moves the tour on). A no-op on the closing step itself.
 */
export async function advanceIntroToClosingStep(dialog: Locator): Promise<void> {
  await expect(dialog.getByRole('button', { name: /^(Continue|Let's Go)$/ })).toBeVisible({
    timeout: 15_000,
  });
  for (let i = 0; i <= FEATURE_TITLES.length; i++) {
    const title = (await dialog.getAttribute('aria-label')) ?? '';
    if (CLOSING_TITLES.includes(title)) return;
    expect(FEATURE_TITLES).toContain(title);
    await clickToNextStep(dialog, 'Continue');
  }
  throw new Error('the Intro never reached its closing step');
}

/** Walk Back from a step after the ask until the consent step is up again. */
export async function backIntroToConsentStep(dialog: Locator): Promise<void> {
  const install = dialog.getByRole('button', { name: 'Install Hooks' });
  for (let i = 0; i <= FEATURE_TITLES.length; i++) {
    if (await install.isVisible()) return;
    await clickToNextStep(dialog, 'Back');
  }
  await expect(install).toBeVisible();
}

/** Page to the closing step ("You're all set!") and close the Intro. */
export async function finishIntro(dialog: Locator): Promise<void> {
  await advanceIntroToClosingStep(dialog);
  await expect(dialog).toContainText("You're all set!");
  await dialog.getByRole('button', { name: "Let's Go" }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}
