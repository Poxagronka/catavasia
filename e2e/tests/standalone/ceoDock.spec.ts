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
    await expect(input).toHaveValue('');
    await expect(page.getByTestId('dock-status')).toHaveText('idle');

    await page.getByTestId('dock-collapse').click();
    await expect(dock).toBeHidden();
    await page.getByTestId('dock-tab').click();
    await expect(dock).toBeVisible();
    // The chat survives the collapse.
    await expect(log.getByText('Mock CEO: hello dock')).toBeVisible();
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
    await expect(log.getByTestId('sent-chip')).toContainText('notes.md');
  });
});
