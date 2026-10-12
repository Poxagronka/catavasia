import type { Locator } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Drivers for the hooks consent ask inside the onboarding (webview-ui/src/onboarding/Onboarding.tsx).
 * The specs that use them seed `onboardingDone: true`, so the onboarding opens in its consent-only
 * mode: the consent step first, then the last step ("You're all set!" or the failure title).
 * Locator-based so the same helpers drive both surfaces: the VS Code webview frame and the
 * standalone browser page. The full first-run flow has its own spec (standalone/onboarding.spec.ts).
 */

const CLOSING_TITLES = ["You're all set!", "Hooks couldn't be installed"];

/** The consent step is the first screen of the consent-only onboarding. */
export async function advanceIntroToConsentStep(dialog: Locator): Promise<void> {
  await expect(dialog.getByRole('button', { name: 'Install Hooks' })).toBeVisible();
}

/**
 * Wait out a held install (its verdict moves the onboarding on) until the last step is up.
 * A no-op on the last step itself.
 */
export async function advanceIntroToClosingStep(dialog: Locator): Promise<void> {
  await expect(dialog.getByRole('button', { name: "Let's go" })).toBeVisible({ timeout: 15_000 });
  expect(CLOSING_TITLES).toContain((await dialog.getAttribute('aria-label')) ?? '');
}

/** Back from the last step to the consent step, to revise the answer. */
export async function backIntroToConsentStep(dialog: Locator): Promise<void> {
  await dialog.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Install Hooks' })).toBeVisible();
}

/** Page to the last step and close the onboarding. */
export async function finishIntro(dialog: Locator): Promise<void> {
  await advanceIntroToClosingStep(dialog);
  await dialog.getByRole('button', { name: "Let's go" }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}
