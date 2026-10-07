import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from '../../fixtures/standalone';

// A logged-in fake `claude` first on the host's PATH: probes answer here, and
// a headless turn (`-p --input-format stream-json`, the CEO desk) runs the
// mock runner, which echoes `Mock CEO: <text>` with a markdown list and a code block.
const BIN = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-ceo-dock-bin-'));
const RUNNER = path.join(__dirname, '../../fixtures/mock-claude-runner.cjs');
const FAKE_CLAUDE = `#!/bin/sh
case "$1" in
  --version) echo "2.1.291 (Claude Code)"; exit 0 ;;
  --help) printf "  --effort <level>   Effort level (low, medium, high)\\n  --model <model>   Model alias (e.g. 'opus' or 'sonnet') or a model's full name.\\n"; exit 0 ;;
  auth) echo '{"loggedIn": true, "authMethod": "claude.ai"}'; exit 0 ;;
esac
exec "${process.execPath}" "${RUNNER}" "$@"
`;
fs.writeFileSync(path.join(BIN, 'claude'), FAKE_CLAUDE, { mode: 0o755 });

const TURN_TIMEOUT_MS = 30_000;

test.describe('Standalone / CEO dock', () => {
  test.skip(process.platform === 'win32', 'the fake claude CLI is a POSIX sh script');
  test.use({ pathPrepend: BIN });

  test('the CEO answers in the dock with markdown; the dock collapses to a tab @area:standalone', async ({
    page,
    standalone,
  }) => {
    void standalone;
    const dock = page.getByTestId('ceo-dock');
    await expect(dock).toBeVisible(); // expanded on the first run

    const input = page.getByTestId('dock-input');
    await input.fill('hello dock');
    await input.press('Enter');

    const log = page.getByTestId('dock-log');
    await expect(log.getByText('Mock CEO: hello dock')).toBeVisible({ timeout: TURN_TIMEOUT_MS });
    await expect(log.locator('li', { hasText: 'second point' })).toBeVisible();
    await expect(log.locator('pre', { hasText: 'echo mock' })).toBeVisible();
    // The Claude app look: a Copy button on the code block, Copy and the time under the reply.
    await expect(log.getByTestId('code-copy')).toBeVisible();
    await expect(log.getByTestId('reply-copy')).toBeVisible();
    await expect(log.getByTestId('reply-actions')).toContainText('just now');
    // A subscription login (authMethod claude.ai): no money anywhere in the dock.
    await expect(dock).not.toContainText('$');
    await expect(input).toHaveValue('');
    await expect(page.getByTestId('dock-status')).toHaveText('idle');

    await page.getByTestId('dock-collapse').click();
    await expect(dock).toBeHidden();
    await page.getByTestId('dock-tab').click();
    await expect(dock).toBeVisible();
    // The chat survives the collapse.
    await expect(log.getByText('Mock CEO: hello dock')).toBeVisible();
  });

  test('the reply shows as Claude writes it, then the final text replaces it; code is highlighted @area:standalone', async ({
    page,
    standalone,
  }) => {
    void standalone;
    const input = page.getByTestId('dock-input');
    await input.fill('stream: live words');
    await input.press('Enter');

    const log = page.getByTestId('dock-log');
    const draft = log.getByTestId('dock-draft');
    // Halfway: the first words show, the rest is not written yet, "thinking" is gone.
    await expect(draft).toContainText('Mock CEO: stream: live words', { timeout: TURN_TIMEOUT_MS });
    await expect(draft).not.toContainText('first point');
    await expect(log.getByText(/is thinking/)).toBeHidden();
    // The end: the final row replaces the draft, once.
    await expect(log.locator('li', { hasText: 'second point' })).toBeVisible({
      timeout: TURN_TIMEOUT_MS,
    });
    await expect(draft).toBeHidden();
    await expect(log.getByText('Mock CEO: stream: live words')).toHaveCount(1);
    // A ```ts block gets syntax colors.
    await expect(log.locator('pre code.language-ts .hljs-keyword')).toHaveText('const');

    // Retry under the newest reply sends the last message again as a new turn.
    await log.getByTestId('reply-retry').click();
    await expect(log.locator('li', { hasText: 'second point' })).toHaveCount(2, {
      timeout: TURN_TIMEOUT_MS,
    });
    await expect(log.getByTestId('reply-retry')).toHaveCount(1);
  });

  test('a pasted image and a picked file reach the CEO and show in the sent row @area:standalone', async ({
    page,
    standalone,
  }) => {
    void standalone;
    const input = page.getByTestId('dock-input');
    await expect(input).toBeVisible();

    // A synthetic paste of a generated PNG (the clipboard API needs a real user gesture).
    await input.evaluate(async (el) => {
      const canvas = document.createElement('canvas');
      canvas.width = 40;
      canvas.height = 40;
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      ctx.fillStyle = '#e01414';
      ctx.fillRect(0, 0, 40, 40);
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b as Blob), 'image/png'),
      );
      const data = new DataTransfer();
      data.items.add(new File([blob], 'red.png', { type: 'image/png' }));
      el.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    });
    await expect(page.getByTestId('dock-thumb')).toHaveCount(1);

    await page.getByTestId('dock-file-input').setInputFiles({
      name: 'notes.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# notes\n'),
    });
    await expect(page.getByTestId('dock-chip')).toContainText('notes.md');

    await input.fill('what is this?');
    await page.getByTestId('dock-send').click();

    const log = page.getByTestId('dock-log');
    await expect(log.getByText('Received 1 images and 1 files.')).toBeVisible({
      timeout: TURN_TIMEOUT_MS,
    });
    await expect(log.getByText('Mock CEO: what is this?')).toBeVisible();
    await expect(page.getByTestId('dock-attachments')).toBeHidden();
    // The sent row loads its thumbnail from the token-gated attachments route.
    const thumb = log.getByTestId('sent-thumb');
    await expect(thumb).toBeVisible();
    await expect
      .poll(() => thumb.evaluate((img) => (img as HTMLImageElement).naturalWidth))
      .toBe(40);
    // A click enlarges the picture in the page; Esc closes it and keeps the dock open.
    await thumb.click();
    const lightbox = page.getByTestId('image-lightbox');
    await expect(lightbox).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(lightbox).toBeHidden();
    await expect(page.getByTestId('ceo-dock')).toBeVisible();
    await expect(log.getByTestId('sent-chip')).toContainText('notes.md');
  });

  test('a question of the CEO shows a card; Allow sends the answer back @area:standalone', async ({
    page,
    standalone,
  }) => {
    void standalone;
    const input = page.getByTestId('dock-input');
    await input.fill('ask: rm -rf build');
    await input.press('Enter');

    const card = page.getByTestId('approval-card');
    await expect(card).toBeVisible({ timeout: TURN_TIMEOUT_MS });
    await expect(card).toContainText('wants to run a command');
    await expect(card).toContainText('rm -rf build');
    await page.getByTestId('approval-allow').click();
    await expect(card).toBeHidden();
    await expect(page.getByTestId('dock-log').getByText('Permission answer: allow')).toBeVisible({
      timeout: TURN_TIMEOUT_MS,
    });
  });

  test('AskUserQuestion shows a question card; the picked option goes back as the answer @area:standalone', async ({
    page,
    standalone,
  }) => {
    void standalone;
    const input = page.getByTestId('dock-input');
    await input.fill('question: Which color?');
    await input.press('Enter');

    const card = page.getByTestId('question-card');
    await expect(card).toBeVisible({ timeout: TURN_TIMEOUT_MS });
    await expect(card).toContainText('Which color?');
    await expect(page.getByTestId('approval-card')).toHaveCount(0);
    await expect(card.getByTestId('question-send')).toBeDisabled();
    await card.getByTestId('question-option').filter({ hasText: 'Blue' }).click();
    await card.getByTestId('question-send').click();
    await expect(card).toBeHidden();
    await expect(
      page.getByTestId('dock-log').getByText('Permission answer: allow {"Which color?":"Blue"}'),
    ).toBeVisible({ timeout: TURN_TIMEOUT_MS });
  });

  test('tool activity reads in plain words, with the picture; ring, limits and pickers @area:standalone', async ({
    page,
    standalone,
  }) => {
    void standalone;
    const input = page.getByTestId('dock-input');
    await input.fill('show tools');
    await input.press('Enter');

    const log = page.getByTestId('dock-log');
    const summary = log.getByTestId('tool-summary');
    await expect(summary).toHaveText(/Thought for 2s, looked at a file, ran a command/, {
      timeout: TURN_TIMEOUT_MS,
    });
    // The picture the tool returned shows under the closed line, from the attachments route.
    const thumb = log.locator('[data-testid="tool-thumb"]:visible');
    await expect(thumb).toHaveCount(1);
    await expect
      .poll(() => thumb.evaluate((img) => (img as HTMLImageElement).naturalWidth))
      .toBe(8);
    await summary.click();
    const items = log.getByTestId('activity-item');
    await expect(items).toHaveCount(3);
    // Paths show relative to the folder the CEO works in.
    await expect(items.nth(1)).toHaveText(/^Looked at red\.png/);
    await items.nth(2).locator('summary').click();
    await expect(log.getByTestId('tool-result')).toContainText('README.md');
    // Open: the picture moves into its call's row.
    await items.nth(1).locator('summary').click();
    await expect(thumb).toHaveCount(1);
    await thumb.click();
    await expect(page.getByTestId('image-lightbox')).toBeVisible();
    await page.keyboard.press('Escape');

    // The context ring: 84K of 200K, and the subscription limits of the turn.
    const ring = page.getByTestId('dock-usage');
    await expect(ring).toHaveAttribute('title', 'Context: 42% used');
    await ring.click();
    await expect(page.getByTestId('usage-context')).toContainText('42% used');
    await expect(page.getByTestId('usage-five-hour')).toContainText(/7% used · resets at/);
    await expect(page.getByTestId('usage-weekly')).toContainText(/56% used · resets /);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('dock-usage-menu')).toBeHidden();

    // The permission mode label opens the CEO's mode menu: four rows, a check on the current one.
    await expect(page.getByTestId('dock-mode')).toHaveText('Auto');
    await page.getByTestId('dock-mode').click();
    const modeMenu = page.getByTestId('dock-mode-menu');
    await expect(modeMenu.getByRole('menuitemradio')).toHaveCount(4);
    await expect(page.getByTestId('dock-mode-auto')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('dock-mode-ask').click();
    await expect(modeMenu).toBeHidden();
    await expect(page.getByTestId('dock-mode')).toHaveText('Ask before actions');
    // Keyboard: the arrows move from the current row, Enter picks, Esc closes.
    await page.getByTestId('dock-mode').click();
    await expect(page.getByTestId('dock-mode-ask')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('dock-mode')).toHaveText('Auto');
    await page.getByTestId('dock-mode').click();
    await page.keyboard.press('Escape');
    await expect(modeMenu).toBeHidden();

    // Model and effort are pickers that change the CEO's settings.
    await page.getByTestId('dock-model').click();
    await page.getByTestId('dock-model-sonnet').click();
    await expect(page.getByTestId('dock-model')).toHaveText('Sonnet');
    await page.getByTestId('dock-effort').click();
    await page.getByTestId('dock-effort-low').click();
    await expect(page.getByTestId('dock-effort')).toHaveText('Low');
  });

  test('slash commands: the "/" menu, dock cards and pickers, and connectors @area:standalone', async ({
    page,
    standalone,
  }) => {
    void standalone;
    const input = page.getByTestId('dock-input');
    const menu = page.getByTestId('slash-menu');
    const log = page.getByTestId('dock-log');
    await expect(input).toBeVisible();

    // "/" lists Claude Code's commands (built-ins, custom ones) and the dock's own.
    await input.fill('/');
    await expect(menu.getByTestId('slash-compact')).toBeVisible();
    await expect(menu.getByTestId('slash-tidy-notes')).toContainText('Tidy my notes');
    await expect(menu.getByTestId('slash-help')).toBeVisible();
    await input.pressSequentially('mo');
    await expect(menu.getByTestId('slash-model')).toContainText('<model>');
    await expect(menu.getByTestId('slash-compact')).toBeHidden();
    // Esc closes the menu; Enter completes a command that takes words.
    await input.press('Escape');
    await expect(menu).toBeHidden();
    await input.fill('');
    await input.fill('/mo');
    await input.press('Enter');
    await expect(input).toHaveValue('/model ');
    // /model with nothing after it opens the model picker, like the terminal's screen.
    await input.press('Enter');
    await expect(page.getByTestId('dock-model-menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await input.fill('/model sonnet');
    await input.press('Enter');
    await expect(page.getByTestId('dock-model')).toHaveText('Sonnet');

    // /usage opens the context and limits; /help lists the commands.
    await input.fill('/usage');
    await input.press('Enter');
    await expect(page.getByTestId('dock-usage-menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await input.fill('/help');
    await input.press('Enter');
    await expect(log.getByTestId('help-card')).toContainText('Sent to Claude');
    await expect(input).toHaveValue('');

    // /compact goes to Claude as typed; the summary shows as a quiet line.
    await input.fill('/compact');
    await input.press('Enter');
    await expect(log.getByTestId('chat-note')).toHaveText('Summarised the chat', {
      timeout: TURN_TIMEOUT_MS,
    });

    // /mcp opens the Connectors card with each server's state in plain words.
    await input.fill('/mcp');
    await input.press('Enter');
    const card = log.getByTestId('connectors-card');
    await expect(card).toContainText('Changes apply to all cats');
    const rows = card.getByTestId('connector-row');
    await expect(rows).toHaveCount(3, { timeout: TURN_TIMEOUT_MS });
    await expect(rows.nth(0)).toContainText('Working');
    await expect(rows.nth(1)).toContainText('Needs sign-in');
    await expect(rows.nth(2)).toContainText('Not working');
    // No project: nothing to turn off for.
    await expect(card.getByTestId('connector-turn-off')).toHaveCount(0);

    await rows.nth(1).getByTestId('connector-sign-in').click();
    await expect(rows.nth(1).getByTestId('connector-status')).toHaveText('Working');

    await rows.nth(2).getByTestId('connector-remove').click();
    await expect(card.getByTestId('connector-confirm')).toContainText('Every cat loses it');
    await card.getByTestId('connector-remove-yes').click();
    await expect(rows).toHaveCount(2);

    await card.getByTestId('connector-add').click();
    await card.getByTestId('connector-name').fill('web-tool');
    await card.getByTestId('connector-target').fill('https://tools.example/mcp');
    await card.getByTestId('connector-add-save').click();
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(2)).toContainText('web-tool');
  });
});
