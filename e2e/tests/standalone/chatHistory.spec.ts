import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from '../../fixtures/standalone';

// A logged-in fake `claude` (see ceoDock.spec.ts): the mock runner answers a
// CEO turn with `Mock CEO: <text>` and logs each turn's session id and args.
const BIN = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-chat-history-bin-'));
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

test.describe('Standalone / CEO chat history', () => {
  test.skip(process.platform === 'win32', 'the fake claude CLI is a POSIX sh script');
  test.use({ pathPrepend: BIN });

  test('the chat title opens the history: search, open and continue, rename, delete @area:standalone', async ({
    page,
    standalone,
  }) => {
    const input = page.getByTestId('dock-input');
    const log = page.getByTestId('dock-log');
    const title = page.getByTestId('dock-chat-title');
    const ask = async (text: string) => {
      await input.fill(text);
      await input.press('Enter');
      await expect(log.getByText(`Mock CEO: ${text}`)).toBeVisible({ timeout: TURN_TIMEOUT_MS });
    };

    await expect(title).toHaveText('New chat');
    await ask('Plan the launch party');
    await expect(title).toHaveText('Plan the launch party');
    await page.getByTestId('dock-new-chat').click();
    await expect(title).toHaveText('New chat');
    await ask('Fix the login page');

    // A chat archived before the history existed shows with its first message.
    const chats = path.join(standalone.tmpHome, '.pixel-agents', 'cat-ceo', 'chats');
    const day = 24 * 60 * 60 * 1000;
    fs.writeFileSync(
      path.join(chats, 'c-0ld0ld00.json'),
      JSON.stringify({
        version: 2,
        rows: [
          { kind: 'user', text: 'An old question from last month', at: Date.now() - 40 * day },
          { kind: 'text', text: 'An old answer', at: Date.now() - 40 * day + 1 },
        ],
      }),
    );

    await title.click();
    const menu = page.getByTestId('chat-history');
    await expect(menu).toBeVisible();
    await expect(menu.getByTestId('chat-group')).toHaveText([
      /^Today.*Fix the login page.*Plan the launch party/,
      /^Older.*An old question/,
    ]);
    await expect(menu.locator('[aria-current="true"]')).toHaveText(/Fix the login page/);

    await page.getByTestId('chat-search').fill('LAUNCH');
    await expect(menu.getByTestId('chat-row')).toHaveCount(1);
    await menu.getByTestId('chat-row').click();
    await expect(menu).toBeHidden();
    await expect(title).toHaveText('Plan the launch party');
    await expect(log.getByText('Mock CEO: Plan the launch party')).toBeVisible();

    // The next message continues the chat's Claude session.
    await ask('and the cake');
    const turns = fs
      .readFileSync(path.join(standalone.tmpHome, '.claude-mock', 'invocations.log'), 'utf-8')
      .trim()
      .split('\n');
    const sessionOf = (line: string) => /session-id=(\S+)/.exec(line)?.[1];
    expect(turns).toHaveLength(3);
    expect(sessionOf(turns[2])).toBe(sessionOf(turns[0]));
    expect(turns[2]).toContain('--resume');

    // Rename the open chat from its row.
    await title.click();
    const row = menu.getByTestId('chat-row').filter({ hasText: 'Plan the launch party' });
    await row.hover();
    await row.locator('xpath=..').getByTestId('chat-rename').click();
    const name = page.getByTestId('chat-rename-input');
    await name.fill('Party plan');
    await name.press('Enter');
    await expect(title).toHaveText('Party plan');
    await expect(menu.locator('[aria-current="true"]')).toHaveText(/Party plan/);

    // Delete the old chat after the question.
    const old = menu.getByTestId('chat-row').filter({ hasText: 'An old question' });
    await old.hover();
    await old.locator('xpath=..').getByTestId('chat-delete').click();
    await expect(menu.getByTestId('chat-delete-confirm')).toContainText('for good');
    await menu.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(menu.getByTestId('chat-row')).toHaveCount(2);
    expect(fs.existsSync(path.join(chats, 'c-0ld0ld00.json'))).toBe(false);

    // The other chat opens with its transcript.
    await page.getByTestId('chat-search').fill('login');
    await menu.getByTestId('chat-row').click();
    await expect(title).toHaveText('Fix the login page');
    await expect(log.getByText('Mock CEO: Fix the login page')).toBeVisible();
  });
});
