import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { Locator, Page } from '@playwright/test';

import { expect, test } from '../../fixtures/standalone';
import { fakeClaude } from '../../helpers/fake-claude';
import { launchStandalone } from '../../helpers/standalone';
import { openSettingsModal } from '../../helpers/webview';

/**
 * The first-run onboarding (webview-ui/src/onboarding/): language → plain explanation → create cats together →
 * done, and Skip → six ready role teams or "start without cats". The host runs with a fake `claude` CLI first on
 * PATH and consent already granted, so nothing here starts a real Claude session or asks about hooks.
 * The hooks consent step has its own specs (claude/hooks-on/consent.spec.ts, standalone/hooks.spec.ts).
 */

const EXPLAIN_TITLES = [
  'What is a cat?',
  'The CEO',
  'The boss and the workers',
  'How a task flows',
  'Where to type what',
  'Claude Code and Codex',
];

const dialogOf = (page: Page): Locator => page.getByRole('dialog');

function readJson(tmpHome: string, name: string): any {
  try {
    return JSON.parse(fs.readFileSync(path.join(tmpHome, '.pixel-agents', name), 'utf8'));
  } catch {
    return undefined;
  }
}

/** Click a button and wait until the dialog shows another title. */
async function click(dialog: Locator, name: string): Promise<void> {
  const before = (await dialog.getAttribute('aria-label')) ?? '';
  await dialog.getByRole('button', { name, exact: true }).click();
  await expect(dialog).not.toHaveAttribute('aria-label', before, { timeout: 5_000 });
}

/** The four field steps of one cat, from the name step to the saved screen. */
async function makeCat(dialog: Locator, name: string): Promise<void> {
  const next = dialog.getByRole('button', { name: 'Next', exact: true });
  await dialog.getByRole('textbox').first().fill(name);
  await next.click();
  await expect(dialog).toContainText('Choose the look');
  await next.click();
  await expect(dialog).toContainText('Give it a role');
  await next.click();
  await expect(dialog).toContainText('Write the instructions');
  await next.click();
  await expect(dialog).toContainText(`${name} joined your team!`);
}

test.describe('Standalone / onboarding', () => {
  test.skip(process.platform === 'win32', 'the fake claude CLI is a POSIX sh script');
  test.use({ seedOnboardingDone: false, seedCats: false, pathPrepend: fakeClaude(false) });

  test('language, the plain steps, a boss and a worker made together, then done @area:standalone', async ({
    page,
    standalone,
  }) => {
    const dialog = dialogOf(page);
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(dialog).toHaveAttribute('aria-label', 'Choose your language');
    await expect(dialog.getByRole('button', { name: 'Help' })).toBeVisible();

    // Each language shows by its own name; picking one switches the whole panel. RTL flips the page.
    await dialog.getByRole('radio', { name: 'Русский' }).click();
    await expect(dialog).toHaveAttribute('aria-label', 'Выберите язык');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await dialog.getByRole('radio', { name: 'العربية' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await dialog.getByRole('radio', { name: 'English' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(dialog).toHaveAttribute('aria-label', 'Choose your language');

    await click(dialog, 'Next');
    for (const title of EXPLAIN_TITLES) {
      await expect(dialog).toHaveAttribute('aria-label', title);
      await expect(dialog.getByRole('button', { name: 'Help' })).toBeVisible();
      if (title.startsWith('Claude Code')) {
        const claude = dialog.getByTestId('intro-engine-claude');
        await expect(claude).toContainText('not logged in', { timeout: 20_000 });
        // The onboarding shows the engines itself: the top banner waits until it closes.
        await expect(page.getByTestId('engine-banner')).toHaveCount(0);
      }
      await click(dialog, 'Next');
    }

    await expect(dialog).toHaveAttribute('aria-label', 'Make your first cats');
    await dialog.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(dialog).toContainText('Name the boss cat');
    await expect(dialog).toContainText('What is it for?');
    await expect(dialog).toContainText('What to write?');
    await makeCat(dialog, 'Oliver');

    await dialog.getByRole('button', { name: 'Add a worker' }).click();
    await expect(dialog).toContainText('Name the worker cat');
    await makeCat(dialog, 'Luna');

    await dialog.getByRole('button', { name: 'Continue' }).click();
    await expect(dialog).toHaveAttribute('aria-label', "You're all set!");
    await dialog.getByRole('button', { name: "Let's go" }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    await expect
      .poll(() => readJson(standalone.tmpHome, 'cats.json')?.cats?.length, { timeout: 15_000 })
      .toBe(2);
    const cats = readJson(standalone.tmpHome, 'cats.json').cats as Array<{
      id: string;
      name: string;
      parentId: string | null;
      model: string;
    }>;
    const boss = cats.find((c) => c.name === 'Oliver')!;
    expect(boss).toMatchObject({ parentId: null, model: 'opus' });
    expect(cats.find((c) => c.name === 'Luna')).toMatchObject({
      parentId: boss.id,
      model: 'sonnet',
    });
    await expect
      .poll(() => readJson(standalone.tmpHome, 'config.json')?.standalone?.onboardingDone)
      .toBe(true);
    expect(readJson(standalone.tmpHome, 'config.json')?.standalone?.language).toBe('en');
  });

  test('Skip offers six role teams; a team saves one boss and three workers @area:standalone', async ({
    page,
    standalone,
  }) => {
    const dialog = dialogOf(page);
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await click(dialog, 'Skip');
    await expect(dialog).toHaveAttribute('aria-label', 'Pick a ready team');
    for (const id of ['engineer', 'designer', 'product', 'marketer', 'analyst', 'writer']) {
      await expect(dialog.getByTestId(`template-${id}`)).toBeVisible();
    }
    await expect(dialog.getByTestId('template-engineer')).toContainText(
      'Ada, Linus, Grace, Dennis',
    );
    await expect(dialog.getByTestId('template-designer')).toContainText(
      'Dieter, Paula, Saul, Massimo',
    );

    await dialog
      .getByTestId('template-engineer')
      .getByRole('button', { name: 'Use this team' })
      .click();
    await expect(dialog).toHaveAttribute('aria-label', "You're all set!");
    await dialog.getByRole('button', { name: "Let's go" }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    await expect
      .poll(() => readJson(standalone.tmpHome, 'cats.json')?.cats?.length, { timeout: 15_000 })
      .toBe(4);
    const cats = readJson(standalone.tmpHome, 'cats.json').cats as Array<{
      id: string;
      name: string;
      parentId: string | null;
    }>;
    expect(cats.map((c) => c.name).sort()).toEqual(['Ada', 'Dennis', 'Grace', 'Linus']);
    expect(cats.filter((c) => c.parentId === null).map((c) => c.id)).toEqual(['eng-ada']);
  });

  test('"Start without cats" ends the onboarding with an empty team @area:standalone', async ({
    page,
    standalone,
  }) => {
    const dialog = dialogOf(page);
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await click(dialog, 'Skip');
    await click(dialog, 'Start without cats');
    await dialog.getByRole('button', { name: "Let's go" }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    await expect
      .poll(() => readJson(standalone.tmpHome, 'config.json')?.standalone?.onboardingDone, {
        timeout: 15_000,
      })
      .toBe(true);
    expect(fs.existsSync(path.join(standalone.tmpHome, '.pixel-agents', 'cats.json'))).toBe(false);
  });
});

test.describe('Standalone / onboarding, existing users', () => {
  test.use({ seedOnboardingDone: false });

  test('a user with a cats.json is never forced into it; Settings runs it again @area:standalone', async ({
    page,
  }) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-onboarding-home-'));
    fs.mkdirSync(path.join(home, '.pixel-agents'), { recursive: true });
    fs.writeFileSync(
      path.join(home, '.pixel-agents', 'cats.json'),
      JSON.stringify({
        version: 1,
        cats: [
          {
            id: 'boss',
            name: 'Old boss',
            role: 'Team lead',
            systemPrompt: 'Lead.',
            engine: 'claude',
            model: 'sonnet',
            effort: 'medium',
            appearance: {},
            parentId: null,
          },
        ],
      }),
    );
    const session = await launchStandalone(page, {
      homeDir: home,
      seedOnboardingDone: false,
      seedCats: false,
    });
    try {
      // The settings handshake has arrived once the Settings button works; the onboarding never shows.
      await page.waitForTimeout(1_500);
      await expect(dialogOf(page)).toHaveCount(0);
      await expect
        .poll(() => readJson(home, 'config.json')?.standalone?.onboardingDone, { timeout: 15_000 })
        .toBe(true);

      const settings = await openSettingsModal(page);
      await settings.getByText('Run onboarding again').click();
      await expect(dialogOf(page)).toHaveAttribute('aria-label', 'Choose your language');
      // A re-run with cats: Skip just ends it, no team picker over an existing team.
      await dialogOf(page).getByRole('button', { name: 'Skip', exact: true }).click();
      await expect(dialogOf(page)).toHaveCount(0);
    } finally {
      await session.cleanup();
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
