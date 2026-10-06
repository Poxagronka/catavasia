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
});
