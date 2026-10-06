import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from '../../fixtures/standalone';

// Fake engine CLIs first on the host's PATH. `claude auth status` reports
// logged out (the real output under an empty HOME) until `claude auth login`
// runs; the fake login then marks the CLI logged in. Codex reports logged in.
const BIN = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-engines-bin-'));
const FAKE_CLAUDE = `#!/bin/sh
STATE="$(dirname "$0")/claude-logged-in"
case "$1" in
  --version) echo "2.1.291 (Claude Code)"; exit 0 ;;
  --help) printf "  --effort <level>   Effort level (low, medium, high)\\n  --model <model>   Model alias (e.g. 'opus' or 'sonnet') or a model's full name.\\n"; exit 0 ;;
  auth)
    if [ "$2" = "status" ]; then
      if [ -f "$STATE" ]; then echo '{"loggedIn": true, "authMethod": "claude.ai"}'; exit 0; fi
      echo '{"loggedIn": false, "authMethod": "none"}'; exit 1
    fi
    if [ "$2" = "login" ]; then
      echo "Opening browser to sign in..."; touch "$STATE"; echo "Login successful."; sleep 1; exit 0
    fi ;;
esac
echo "fake claude: unexpected $*" >&2
exit 2
`;
const FAKE_CODEX = `#!/bin/sh
case "$1" in
  --version) echo "codex-cli 0.160.1"; exit 0 ;;
  login) echo "Logged in using ChatGPT" >&2; exit 0 ;;
esac
exit 2
`;
fs.writeFileSync(path.join(BIN, 'claude'), FAKE_CLAUDE, { mode: 0o755 });
fs.writeFileSync(path.join(BIN, 'codex'), FAKE_CODEX, { mode: 0o755 });

const PROBE_TIMEOUT_MS = 20_000;

test.describe('Standalone / engines', () => {
  test.skip(process.platform === 'win32', 'the fake engine CLIs are POSIX sh scripts');
  test.use({ pathPrepend: BIN });

  test('a logged-out Claude Code: notice, blocked Start, and Log in in the terminal @area:standalone', async ({
    page,
    standalone,
  }) => {
    void standalone;
    const banner = page.getByTestId('engine-banner');
    await expect(banner).toContainText('Claude Code is not logged in', {
      timeout: PROBE_TIMEOUT_MS,
    });
    await expect(banner).not.toContainText('Codex');

    await page.getByRole('button', { name: 'Tasks' }).click();
    await page.getByTitle('New task').click();
    await page.getByPlaceholder('What should the cat do?').fill('weather in Rhodes tomorrow');
    await expect(page.getByTestId('task-start')).toBeDisabled();
    await expect(page.getByTestId('task-start-blocker')).toContainText(
      'Claude Code is not logged in',
    );

    await banner.getByTestId('engine-login-claude').click();
    const panel = page.getByTestId('engine-login-panel');
    await expect(panel).toContainText('Login successful', { timeout: PROBE_TIMEOUT_MS });
    // The login process exits: the server probes again and every notice goes away.
    await expect(banner).toBeHidden({ timeout: PROBE_TIMEOUT_MS });
    await expect(panel.getByText('logged in', { exact: true })).toBeVisible();
    await expect(page.getByTestId('task-start')).toBeEnabled({ timeout: PROBE_TIMEOUT_MS });
  });
});
