import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from '../../fixtures/standalone';

// The board is gone (docs/catavasia/ROADMAP.md, "CEO desk replaces the task
// board", phase 4): the whiteboard is decor, the CEO cat opens the CEO chat,
// and the onboarding has seven steps. Fake `claude` CLIs first on PATH: one
// logged in, one logged out (for the engines step and its banner).
const fakeClaude = (loggedIn: boolean): string => {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-decor-bin-'));
  const auth = loggedIn
    ? `echo '{"loggedIn": true, "authMethod": "claude.ai"}'; exit 0`
    : `echo '{"loggedIn": false}'; exit 1`;
  fs.writeFileSync(
    path.join(bin, 'claude'),
    `#!/bin/sh
case "$1" in
  --version) echo "2.1.291 (Claude Code)"; exit 0 ;;
  --help) printf "  --effort <level>   Effort level (low, medium, high)\\n  --model <model>   Model alias.\\n"; exit 0 ;;
  auth) ${auth} ;;
esac
exit 2
`,
    { mode: 0o755 },
  );
  return bin;
};

/** The office the e2e hooks hand out (only what this spec reads). */
interface HookOffice {
  residents: Map<number, { ceo?: boolean }>;
  characters: Map<number, { x: number; y: number }>;
  getCharacterAt(x: number, y: number): number | null;
  getLayout(): { furniture: Array<{ uid: string; col: number; row: number }> };
}

type HooksWindow = Window & {
  __pixelAgentsTestHooks?: {
    getOffice?: () => HookOffice | null;
    worldToClient?: (x: number, y: number) => { x: number; y: number } | null;
  };
};

/** Client point of a world point (sprite px), from the e2e hook of OfficeCanvas. */
async function clientPoint(page: Page, worldX: number, worldY: number) {
  const point = await page.evaluate(
    ([x, y]) => (window as HooksWindow).__pixelAgentsTestHooks?.worldToClient?.(x, y) ?? null,
    [worldX, worldY] as const,
  );
  expect(point).not.toBeNull();
  return point!;
}

/** A world point on the CEO cat that the office's own hit test accepts. */
async function ceoWorldPoint(page: Page): Promise<{ x: number; y: number } | null> {
  return page.evaluate(() => {
    const office = (window as HooksWindow).__pixelAgentsTestHooks?.getOffice?.();
    if (!office) return null;
    const id = [...office.residents.entries()].find(([, r]) => r.ceo)?.[0];
    const ch = id === undefined ? undefined : office.characters.get(id);
    if (!ch) return null;
    for (let dy = -4; dy >= -24; dy -= 2) {
      if (office.getCharacterAt(ch.x, ch.y + dy) === id) return { x: ch.x, y: ch.y + dy };
    }
    return null;
  });
}

test.describe('Standalone / board removed', () => {
  test.skip(process.platform === 'win32', 'the fake engine CLIs are POSIX sh scripts');

  test.describe('office', () => {
    test.use({ pathPrepend: fakeClaude(true) });

    test('the whiteboard is decor; a click on the CEO cat opens the CEO chat @area:standalone', async ({
      page,
      standalone,
    }) => {
      void standalone;
      await expect(page.getByRole('button', { name: 'Cats' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Tasks' })).toHaveCount(0);
      const dock = page.getByTestId('ceo-dock');
      await expect(dock).toBeVisible();
      await page.getByTestId('dock-collapse').click();
      await expect(dock).toBeHidden();

      // The whiteboard of the default office: no pointer, no tooltip, no panel.
      const board = await page.evaluate(() => {
        const office = (window as HooksWindow).__pixelAgentsTestHooks?.getOffice?.();
        const f = office?.getLayout().furniture.find((i) => i.uid === 'f-tasks-whiteboard');
        return f ? { col: f.col, row: f.row } : null;
      });
      expect(board).not.toBeNull();
      const onBoard = await clientPoint(page, (board!.col + 1.5) * 16, (board!.row + 1) * 16);
      await page.mouse.move(onBoard.x, onBoard.y);
      const canvas = page.locator('canvas').first();
      await expect(canvas).not.toHaveCSS('cursor', 'pointer');
      await expect(page.getByTestId('whiteboard-tooltip')).toHaveCount(0);
      await page.mouse.click(onBoard.x, onBoard.y);
      await page.waitForTimeout(500);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(dock).toBeHidden();

      // The CEO cat opens the CEO chat.
      await expect.poll(() => ceoWorldPoint(page), { timeout: 15_000 }).not.toBeNull();
      const ceo = (await ceoWorldPoint(page))!;
      const onCeo = await clientPoint(page, ceo.x, ceo.y);
      await page.mouse.click(onCeo.x, onCeo.y);
      await expect(dock).toBeVisible();
    });
  });

  test.describe('onboarding', () => {
    test.use({ seedHooksConsent: false, pathPrepend: fakeClaude(false) });

    test('seven steps; the engines step hides the banner and says "not logged in" once; the CEO step opens the chat @area:standalone', async ({
      page,
      standalone,
    }) => {
      void standalone;
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 30_000 });
      await expect(dialog.getByLabel('Step 1 of 7')).toBeVisible();
      const dock = page.getByTestId('ceo-dock');
      await page.getByTestId('dock-collapse').click();
      await expect(dock).toBeHidden();

      const next = async (name: string) => {
        const before = await dialog.getAttribute('aria-label');
        await expect(async () => {
          if ((await dialog.getAttribute('aria-label')) !== before) return;
          await dialog.getByRole('button', { name, exact: true }).click({ timeout: 2_000 });
          await expect(dialog).not.toHaveAttribute('aria-label', before ?? '', { timeout: 1_500 });
        }).toPass({ timeout: 15_000 });
      };

      await next('Continue');
      await expect(dialog).toHaveAttribute('aria-label', 'Claude Code and Codex');
      const claude = dialog.getByTestId('intro-engine-claude');
      await expect(claude).toContainText('not logged in', { timeout: 20_000 });
      // One status line: no second "Claude Code is not logged in." under it.
      await expect(claude).not.toContainText('Claude Code is not logged in');
      await expect(claude.getByTestId('engine-login-claude')).toBeVisible();
      // The tour shows the engines itself: the top banner waits until it closes.
      await expect(page.getByTestId('engine-banner')).toHaveCount(0);

      await next('Continue');
      await next('Not Now');
      await expect(dialog).toHaveAttribute('aria-label', 'The Cat CEO');
      await expect(dialog).toContainText('Talk to the CEO in the chat on the right.');
      await expect(dock).toBeVisible();

      await next('Continue');
      await expect(dialog).toContainText('The CEO hands work to the lead');
      await next('Continue');
      await expect(dialog).toHaveAttribute('aria-label', 'Your office');
      await next('Continue');
      await expect(dialog.getByLabel('Step 7 of 7')).toBeVisible();
      await dialog.getByRole('button', { name: "Let's Go" }).click();
      await expect(dialog).toBeHidden({ timeout: 15_000 });
      await expect(page.getByTestId('engine-banner')).toBeVisible();
    });
  });
});
