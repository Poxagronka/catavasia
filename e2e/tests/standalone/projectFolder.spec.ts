import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from '../../fixtures/standalone';

// A logged-in fake `claude` (see ceoDock.spec.ts). Its CEO turn calls the desk
// tool start_job when the user writes "start job: <task>".
const BIN = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-project-bin-'));
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

// The project the mocked folder window "picks": a git repo with one commit.
const PROJECT = path.join(
  fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-proj-'))),
  'my-site',
);
fs.mkdirSync(PROJECT);
fs.writeFileSync(path.join(PROJECT, 'index.html'), '<p>hi</p>\n');
const git = (...args: string[]) => execFileSync('git', ['-C', PROJECT, ...args]);
git('init', '-q');
git('add', '-A');
git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init');

const DIALOG_ENV = 'CATAVASIA_FOLDER_DIALOG_CMD';
const TURN_TIMEOUT_MS = 30_000;

test.describe('Standalone / Project folder', () => {
  test.skip(process.platform === 'win32', 'the fake claude CLI is a POSIX sh script');
  test.use({ pathPrepend: BIN });
  // The host inherits this env: the folder window prints the path, no real window opens.
  test.beforeAll(() => {
    process.env[DIALOG_ENV] = `printf '%s' '${PROJECT}'`;
  });
  test.afterAll(() => {
    delete process.env[DIALOG_ENV];
  });

  test('pick a project in the bottom bar; a CEO job runs in it @area:standalone', async ({
    page,
    standalone,
  }) => {
    void standalone;
    const button = page.getByTestId('project-button');
    await expect(button).toHaveText('📁 No project');
    await expect(page.getByTestId('dock-project')).toHaveText('Project: No project');

    await button.click();
    const panel = page.getByTestId('project-panel');
    await expect(panel).toBeVisible();
    await panel.getByTestId('project-choose').click();
    // A git folder: the panel closes and the bar shows the name.
    await expect(button).toHaveText('📁 my-site');
    await expect(panel).toBeHidden();
    await expect(page.getByTestId('dock-project')).toHaveText('Project: my-site');

    const input = page.getByTestId('dock-input');
    await input.fill('start job: add a footer');
    await input.press('Enter');
    const card = page.getByTestId('job-card');
    await expect(card).toBeVisible({ timeout: TURN_TIMEOUT_MS });
    await expect(card.locator(`[title="${PROJECT}"]`)).toBeVisible();
    await expect(card.locator('code')).toContainText('task/');

    // The panel lists the project under Recent once another one is current.
    await button.click();
    await panel.getByTestId('project-none').click();
    await expect(button).toHaveText('📁 No project');
    await button.click();
    await expect(panel.getByTestId('project-recent')).toContainText('my-site');
  });
});
