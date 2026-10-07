import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from '../../fixtures/standalone';

// A fake `gh` first on PATH that is not logged in: the server must take the
// browser fallback. No test runs the real `gh` or reaches GitHub.
const fakeGh = (): string => {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-feedback-bin-'));
  fs.writeFileSync(
    path.join(bin, 'gh'),
    `#!/bin/sh
echo "You are not logged into any GitHub hosts. To log in, run: gh auth login" >&2
exit 1
`,
    { mode: 0o755 },
  );
  return bin;
};

test.describe('Standalone / Feedback', () => {
  test.use({ pathPrepend: fakeGh() });

  test('Feedback form: office screenshot, remove, and the browser fallback without a gh login @area:standalone', async ({
    page,
    standalone,
  }) => {
    void standalone;
    await page.getByTestId('feedback-button').click();
    const form = page.getByTestId('feedback-form');
    await expect(form).toBeVisible();

    // Send waits for a title.
    await expect(page.getByTestId('feedback-send')).toBeDisabled();

    // One click captures the office canvas as an attachment.
    await page.getByTestId('feedback-screenshot').click();
    await expect(form.getByTestId('dock-thumb')).toHaveCount(1);
    await form.getByTestId('dock-attachment-remove').click();
    await expect(form.getByTestId('dock-thumb')).toHaveCount(0);
    await page.getByTestId('feedback-screenshot').click();
    await expect(form.getByTestId('dock-thumb')).toHaveCount(1);

    await page.getByTestId('feedback-title').fill('The cat sits on the keyboard');
    await page.getByTestId('feedback-description').fill('Steps: open the office.');
    await page.getByTestId('feedback-send').click();

    const fallback = page.getByTestId('feedback-fallback');
    await expect(fallback).toBeVisible({ timeout: 15_000 });
    await expect(fallback).toContainText('not logged in');
    const link = fallback.getByRole('link', { name: 'Open the GitHub issue form' });
    const href = (await link.getAttribute('href')) ?? '';
    expect(href.startsWith('https://github.com/Poxagronka/catavasia/issues/new?')).toBe(true);
    const params = new URL(href).searchParams;
    expect(params.get('title')).toBe('The cat sits on the keyboard');
    expect(params.get('body')).toContain('- host: standalone CLI');

    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(form).toHaveCount(0);
  });
});
