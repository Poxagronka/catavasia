import fs from 'node:fs';
import path from 'node:path';

import type { Frame, Locator } from '@playwright/test';

import { expect, test } from '../../../fixtures/pixel-agents';
import { ourHookEvents } from '../../../helpers/hooks';
import {
  advanceIntroToClosingStep,
  advanceIntroToConsentStep,
  backIntroToConsentStep,
  finishIntro,
} from '../../../helpers/intro';
import { getSettingChecked, setSettings } from '../../../helpers/webview';

/**
 * The hooks consent gate for modifying ~/.claude/settings.json, asked inside the onboarding.
 * Every other spec seeds a granted Claude consent so hooks flow silently; these opt OUT via `seedConfig`, which is
 * what a real first run looks like. They also seed `onboardingDone: true`, so the onboarding opens in its
 * consent-only mode (webview-ui/src/onboarding/Onboarding.tsx): the server's `hooksConsentRequest` shows the
 * consent step, a choice sends immediately and moves on to the last step, and Back from there re-opens the
 * consent step for a genuine change of mind. The full first-run flow is in standalone/onboarding.spec.ts.
 * Both surfaces render this component off the same message (standalone: standalone/hooks.spec.ts).
 * The gate answers a 1-star review — a settings.json replaced with no prompt, backup or disclosure — so these assert
 * the ON-DISK consequence of each choice, not just that a prompt appeared.
 */

const NO_CONSENT_CONFIG = {
  vscode: { alwaysShowLabels: true, onboardingDone: true },
  standalone: { alwaysShowLabels: true, onboardingDone: true },
  // hooksConsent deliberately absent -> parses to unanswered -> dialog shows.
};

/** The onboarding is the only role="dialog" element in the webview (the Settings/changelog modals don't carry the role). */
function consentDialog(frame: Frame): Locator {
  return frame.getByRole('dialog');
}

/** Wait for the consent ask (the consent-only onboarding) and return its dialog. */
async function openConsentDialog(frame: Frame): Promise<Locator> {
  const dialog = consentDialog(frame);
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  return dialog;
}

function settingsPath(tmpHome: string): string {
  return path.join(tmpHome, '.claude', 'settings.json');
}

function readSettings(tmpHome: string): {
  hooks?: Record<string, Array<{ hooks?: Array<{ command?: string }> }>>;
  permissions?: unknown;
} {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(tmpHome), 'utf8'));
  } catch {
    return {};
  }
}

function readConsent(tmpHome: string): boolean {
  try {
    const raw = fs.readFileSync(path.join(tmpHome, '.pixel-agents', 'config.json'), 'utf8');
    const consent = (JSON.parse(raw) as { hooksConsent?: Record<string, string> }).hooksConsent;
    return consent?.claude === 'granted';
  } catch {
    return false;
  }
}

function readHooksEnabled(tmpHome: string): boolean | undefined {
  try {
    const raw = fs.readFileSync(path.join(tmpHome, '.pixel-agents', 'config.json'), 'utf8');
    return (JSON.parse(raw) as { hooksEnabled?: Record<string, boolean> }).hooksEnabled?.claude;
  } catch {
    return undefined;
  }
}

/**
 * A pre-consent (legacy) settings.json: our command on 14 events, including the two we no longer collect, plus a
 * third-party hook sharing one entry. The command is matched by its `.pixel-agents/hooks/claude-hook.js` path SUFFIX
 * rather than against the resolved homedir, so a literal `/home/legacy/...` reads as ours even though the test HOME
 * is a temp dir — which is what lets this be seeded at launch time, before that temp HOME has a name.
 */
function legacyClaudeSettings(thirdPartyCommand: string): unknown {
  const command = 'node "/home/legacy/.pixel-agents/hooks/claude-hook.js"';
  const events = [
    'SessionStart',
    'SessionEnd',
    'Stop',
    'PermissionRequest',
    'Notification',
    'UserPromptSubmit',
    'PreToolUse',
    'PostToolUse',
    'PostToolUseFailure',
    'SubagentStart',
    'SubagentStop',
    'TeammateIdle',
    'TaskCreated',
    'TaskCompleted',
  ];
  const hooks: Record<string, unknown[]> = {};
  for (const event of events) {
    hooks[event] = [{ matcher: '', hooks: [{ type: 'command', command, timeout: 5 }] }];
  }
  (hooks['UserPromptSubmit'] as Array<{ hooks: Array<unknown> }>)[0].hooks.unshift({
    type: 'command',
    command: thirdPartyCommand,
  });
  return { permissions: { allow: ['Bash(ls:*)'] }, hooks };
}

test.describe('Hooks consent gate', () => {
  test.use({ seedConfig: NO_CONSENT_CONFIG });

  test('fresh install: the onboarding shows the disclosure and Install writes the hooks @area:cross-cutting', async ({
    pixelAgents,
  }) => {
    const { frame, tmpHome, narrator } = pixelAgents;

    narrator.step('waiting for the consent ask');
    const dialog = await openConsentDialog(frame);
    await advanceIntroToConsentStep(dialog);

    // The disclosure is the point: what is written, what data moves, how to undo.
    const text = (await dialog.textContent()) ?? '';
    expect(text).toContain('One more thing: hooks!');
    expect(text).toMatch(/adds hooks for 10 Claude Code events/);
    expect(text).toContain('~/.claude/settings.json');
    expect(text).toContain('.pixel-agents.backup');
    expect(text).toMatch(/tool inputs/);
    expect(text).toContain('127.0.0.1');
    // The LAST sentence of the disclosure — asserted at the tail so a clipped
    // or half-rendered body fails here rather than passing on its opening.
    expect(text).toContain('Instant Detection (Hooks)');
    narrator.check(
      'the consent step discloses event scope, payload destination, and how to remove',
    );

    // The consent step's controls, as an exact SET, not a count. The three
    // choices carry the decision; Help only opens the help chat and sends nothing,
    // so it is no dismissal synonym beside the choices (Not Now answers and continues).
    expect(
      (await dialog.getByRole('button').allTextContents()).map((t) => t.trim()).sort(),
    ).toEqual(['Help', "Don't Ask Again", 'Install Hooks', 'Not Now'].sort());
    narrator.check('exactly the three choices plus Help');

    // Nothing has been written yet — the ask precedes any modification.
    expect(fs.existsSync(settingsPath(tmpHome))).toBe(false);

    narrator.step('clicking Install Hooks');
    await dialog.getByRole('button', { name: 'Install Hooks' }).click();

    await expect.poll(() => ourHookEvents(tmpHome).length, { timeout: 15_000 }).toBe(10);
    expect(ourHookEvents(tmpHome)).not.toContain('UserPromptSubmit');
    expect(ourHookEvents(tmpHome)).not.toContain('TaskCreated');
    expect(readConsent(tmpHome)).toBe(true);
    narrator.check('10 events installed, prompt-forwarding events not among them');

    // The install broadcast a hooksStatus installed:true — which moots an
    // UNANSWERED ask, but must not yank the onboarding away from the person who just
    // answered it. It pages on to its last step after the install landed.
    await advanceIntroToClosingStep(dialog);
    await expect(dialog).toContainText("You're all set!");
    narrator.check('the closing step survived its own install broadcast');

    narrator.step("finishing with Let's go");
    await finishIntro(dialog);

    // The checkbox reflects ACTUAL install state, fed by the hooksStatus message.
    await expect
      .poll(() => getSettingChecked(frame, 'Instant Detection (Hooks)'), { timeout: 15_000 })
      .toBe(true);
    narrator.check('Settings shows Instant Detection ON');
  });

  test('Not Now writes nothing, continues the onboarding, and leaves consent ungranted @area:cross-cutting', async ({
    pixelAgents,
  }) => {
    const { frame, tmpHome, narrator } = pixelAgents;

    const dialog = await openConsentDialog(frame);
    await advanceIntroToConsentStep(dialog);

    narrator.step('declining with Not Now');
    await dialog.getByRole('button', { name: 'Not Now' }).click();
    // A decline still gets the closing step — hooks are optional, the office
    // works without them, and the onboarding ends the same way for everyone.
    await finishIntro(dialog);

    // Settle: an install, had it happened, would land well inside this window.
    await frame.page().waitForTimeout(3_000);
    expect(fs.existsSync(settingsPath(tmpHome))).toBe(false);
    expect(readConsent(tmpHome)).toBe(false);
    // Not Now persists nothing — the user is asked again next time they open
    // the office.
    expect(readHooksEnabled(tmpHome)).not.toBe(false);
    narrator.check('settings.json never created, consent still ungranted');

    expect(await getSettingChecked(frame, 'Instant Detection (Hooks)')).toBe(false);
    narrator.check('Settings shows Instant Detection OFF — the checkbox tells the truth');
  });

  test("Don't Ask Again writes nothing and persists hooks off @area:cross-cutting", async ({
    pixelAgents,
  }) => {
    const { frame, tmpHome, narrator } = pixelAgents;

    const dialog = await openConsentDialog(frame);
    await advanceIntroToConsentStep(dialog);

    narrator.step("declining permanently with Don't Ask Again");
    await dialog.getByRole('button', { name: "Don't Ask Again" }).click();
    await finishIntro(dialog);

    await expect.poll(() => readHooksEnabled(tmpHome), { timeout: 15_000 }).toBe(false);
    expect(fs.existsSync(settingsPath(tmpHome))).toBe(false);
    expect(readConsent(tmpHome)).toBe(false);
    narrator.check('hooksEnabled persisted false, settings.json untouched');
  });

  // Change of mind, the honest kind: Install lands the hooks, Back re-opens
  // the consent step, and a revised "Don't Ask Again" must UNDO the install —
  // uninstall plus persisted hooks-off. Recording the preference beside live
  // entries is the historical stranding bug (entries firing, checkbox lying,
  // gate skipped forever), so this asserts the disk, not the buttons.
  test("Back from the closing step lets Don't Ask Again undo a landed install @area:cross-cutting", async ({
    pixelAgents,
  }) => {
    const { frame, tmpHome, narrator } = pixelAgents;

    const dialog = await openConsentDialog(frame);
    await advanceIntroToConsentStep(dialog);

    narrator.step('installing, then walking back to revise');
    await dialog.getByRole('button', { name: 'Install Hooks' }).click();
    await expect.poll(() => ourHookEvents(tmpHome).length, { timeout: 15_000 }).toBe(10);
    expect(readConsent(tmpHome)).toBe(true);
    narrator.check('the install landed');

    await advanceIntroToClosingStep(dialog);
    await expect(dialog).toContainText("You're all set!");
    await backIntroToConsentStep(dialog);

    narrator.step("revising to Don't Ask Again");
    await dialog.getByRole('button', { name: "Don't Ask Again" }).click();

    await expect.poll(() => ourHookEvents(tmpHome).length, { timeout: 15_000 }).toBe(0);
    await expect.poll(() => readHooksEnabled(tmpHome), { timeout: 15_000 }).toBe(false);
    narrator.check('hooks removed from disk and hooks-off persisted — a real undo');

    await finishIntro(dialog);
    // The checkbox tells the truth about the revised state.
    expect(await getSettingChecked(frame, 'Instant Detection (Hooks)')).toBe(false);
    narrator.check('Settings shows Instant Detection OFF');
  });

  // The other stranding cell of the revision matrix: "Don't Ask Again", Back,
  // "Not Now". The decline persisted hooks-off, and the consent gate reads a
  // hooks-off preference as never-ask-again — so a "Not Now" that wrote
  // nothing here would retire an ask whose FINAL answer was "ask me again".
  // The revision must take back the decline AND the preference it wrote.
  test("Back after Don't Ask Again lets Not Now bring the ask back @area:cross-cutting", async ({
    pixelAgents,
  }) => {
    const { frame, tmpHome, narrator } = pixelAgents;

    const dialog = await openConsentDialog(frame);
    await advanceIntroToConsentStep(dialog);

    narrator.step("declining with Don't Ask Again, then walking back to revise");
    await dialog.getByRole('button', { name: "Don't Ask Again" }).click();
    await expect.poll(() => readHooksEnabled(tmpHome), { timeout: 15_000 }).toBe(false);
    narrator.check('the decline persisted hooks-off');

    await advanceIntroToClosingStep(dialog);
    await expect(dialog).toContainText("You're all set!");
    await backIntroToConsentStep(dialog);

    narrator.step('revising to Not Now');
    await dialog.getByRole('button', { name: 'Not Now' }).click();

    // The decline's own preference write is taken back with it: the key is
    // gone (default true applies), consent is unanswered, nothing installed.
    await expect.poll(() => readHooksEnabled(tmpHome), { timeout: 15_000 }).not.toBe(false);
    expect(readConsent(tmpHome)).toBe(false);
    expect(ourHookEvents(tmpHome)).toEqual([]);
    narrator.check('hooks-off un-persisted and consent unanswered — the ask can return');

    await finishIntro(dialog);
    // The on-disk state above IS what makes the ask return: the consent gate
    // asks exactly when consent is unanswered, the preference is default, and
    // nothing is installed (the wire-level re-ask on the next connect is
    // pinned in server/__tests__/consentFlow.test.ts).
  });

  // The population issue #377 is about: a settings.json we refuse to touch.
  // Two things have to hold when Install fails on it.
  //
  // 1. The closing step must not congratulate. It reports the OUTCOME, not the
  //    click, or the user walks away believing hooks are running over a file
  //    that was never written.
  // 2. The ask has to be recoverable. Install records the grant BEFORE it
  //    writes, so a failed install leaves a grant with nothing on disk — and
  //    the grant alone retires the ask forever. A revised "Not Now" must take
  //    that grant back.
  test.describe('when settings.json cannot be parsed', () => {
    test.use({ seedClaudeSettings: '{ "permissions": { "allow": [ "Bash(ls:*)" ]' });

    test('a failed install is reported, and Not Now brings the ask back @area:cross-cutting', async ({
      pixelAgents,
    }) => {
      const { frame, tmpHome, narrator } = pixelAgents;

      const dialog = await openConsentDialog(frame);
      await advanceIntroToConsentStep(dialog);

      narrator.step('clicking Install Hooks over an unparseable settings.json');
      await dialog.getByRole('button', { name: 'Install Hooks' }).click();

      // The installer refuses to rewrite a shape it cannot read, so nothing of
      // ours reaches the file — and the closing step says so rather than
      // claiming success.
      await advanceIntroToClosingStep(dialog);
      await expect(dialog).toContainText("Hooks couldn't be installed");
      await expect(dialog).not.toContainText("You're all set!");
      expect(ourHookEvents(tmpHome)).toEqual([]);
      narrator.check('the closing step reports the failure instead of congratulating');

      // The user's file is exactly as they left it — not repaired, not replaced.
      expect(fs.readFileSync(settingsPath(tmpHome), 'utf8')).toBe(
        '{ "permissions": { "allow": [ "Bash(ls:*)" ]',
      );
      narrator.check('the unparseable file was left byte-for-byte alone');

      narrator.step('walking back and revising to Not Now');
      await backIntroToConsentStep(dialog);
      await dialog.getByRole('button', { name: 'Not Now' }).click();
      await finishIntro(dialog);

      // The load-bearing half: the grant the failed install left is taken back,
      // so the consent ask returns on the next open. Keying the revert off
      // "are hooks installed" saw nothing to undo here and left the user with
      // an ask that never came back.
      await expect.poll(() => readConsent(tmpHome), { timeout: 15_000 }).toBe(false);
      expect(readHooksEnabled(tmpHome)).not.toBe(false);
      narrator.check('the grant is revoked and hooks-off is not persisted — the ask returns');
    });
  });

  // A stray click around the panel must not read as an answer — OR as an
  // abort. This is a decision surface: only the panel's own buttons do
  // anything at all, and the onboarding has no close control that could end
  // it without a choice. The most common accidental gesture — clicking the
  // dimmed office behind the panel — must leave the ask exactly where it was.
  test('clicking the office around the panel neither answers nor dismisses @area:cross-cutting', async ({
    pixelAgents,
  }) => {
    const { frame, tmpHome, narrator } = pixelAgents;

    const dialog = await openConsentDialog(frame);

    narrator.step('clicking the office beside the panel');
    // Top-left corner of the canvas — away from the centered panel.
    // force: the click targets the canvas even if some overlay pixel intercepts.
    await frame.locator('canvas').click({ position: { x: 8, y: 8 }, force: true });
    await frame.page().waitForTimeout(1_000);

    await expect(dialog).toBeVisible();
    expect(fs.existsSync(settingsPath(tmpHome))).toBe(false);
    expect(readConsent(tmpHome)).toBe(false);
    expect(readHooksEnabled(tmpHome)).not.toBe(false);
    narrator.check('panel still open, nothing written — a stray click is not an answer');
  });
});

const THIRD_PARTY = 'node /elsewhere/other-tool.js';

test.describe('Hooks consent gate / pre-consent install', () => {
  // The legacy install must exist BEFORE the extension activates — the gate
  // reads settings.json during activation, so a test-body write is too late.
  test.use({
    seedConfig: NO_CONSENT_CONFIG,
    seedClaudeSettings: legacyClaudeSettings(THIRD_PARTY),
  });

  // ZERO friction for the population that already had our hooks: no prompt at
  // all, just the migration. The reinstall only ever REDUCES scope — it drops
  // UserPromptSubmit and TaskCreated, the two events that forwarded prompt text
  // and were consumed by nothing — so a prompt would buy this user nothing they
  // do not already have. The removal route the disclosure promises is the
  // Settings toggle, exercised end-to-end by the next test.
  test('a pre-consent 14-event install migrates to 10 with no prompt @area:cross-cutting', async ({
    pixelAgents,
  }) => {
    const { frame, tmpHome, narrator } = pixelAgents;

    await expect.poll(() => ourHookEvents(tmpHome).length, { timeout: 30_000 }).toBe(10);
    expect(ourHookEvents(tmpHome)).not.toContain('UserPromptSubmit');
    expect(ourHookEvents(tmpHome)).not.toContain('TaskCreated');
    expect(readConsent(tmpHome)).toBe(true);
    // The third-party hook that shared the UserPromptSubmit entry survives.
    expect(JSON.stringify(readSettings(tmpHome))).toContain(THIRD_PARTY);
    // And the unrelated settings key nobody asked us to touch.
    expect(readSettings(tmpHome).permissions).toEqual({ allow: ['Bash(ls:*)'] });
    narrator.check('migrated to 10 events; third-party hook and unrelated keys survived');

    // The whole point: nothing was ever asked. The consent dialog stays open
    // until answered, so it would still be on screen right now — an absent
    // dialog here means none was ever raised. Two ways this fails if a prompt
    // comes back: the dialog assertion below, and the migration poll above,
    // which could not have reached 10 with the install gated behind an
    // unanswered dialog. Matched on the dialog role and again on the tail of
    // the shared disclosure block, which EVERY consent variant carries, so a
    // re-introduced prompt of any wording fails this.
    narrator.step('checking for a consent dialog');
    await expect(consentDialog(frame)).toHaveCount(0);
    await expect(frame.getByText(/remove the hooks at any time/i)).toHaveCount(0);
    narrator.check('no consent dialog was ever raised');

    // Migrated hooks are live, and the checkbox says so.
    await expect
      .poll(() => getSettingChecked(frame, 'Instant Detection (Hooks)'), { timeout: 15_000 })
      .toBe(true);
    narrator.check('Settings shows Instant Detection ON');
  });

  // The undo route the disclosure PROMISES ("You can remove the hooks at any
  // time from Settings → Instant Detection (Hooks)"), driven for exactly the
  // population that gets no prompt. With the Remove Hooks button gone this is
  // their ONLY removal route, so it is asserted end-to-end — toggle off,
  // entries gone from disk — rather than assumed from the toggle existing.
  test('Settings toggle removes the migrated hooks and keeps third-party entries @area:cross-cutting', async ({
    pixelAgents,
  }) => {
    const { frame, tmpHome, narrator } = pixelAgents;

    // The silent migration lands first, so the toggle below is a genuine state
    // change over live hooks rather than a no-op click.
    await expect.poll(() => ourHookEvents(tmpHome).length, { timeout: 30_000 }).toBe(10);
    expect(await getSettingChecked(frame, 'Instant Detection (Hooks)')).toBe(true);
    narrator.check('migrated hooks installed and the checkbox reads ON');

    narrator.step('toggling Instant Detection (Hooks) OFF');
    await setSettings(frame, { hooksEnabled: false });

    await expect.poll(() => ourHookEvents(tmpHome).length, { timeout: 15_000 }).toBe(0);
    expect(JSON.stringify(readSettings(tmpHome))).toContain(THIRD_PARTY);
    await expect.poll(() => readHooksEnabled(tmpHome), { timeout: 15_000 }).toBe(false);
    // Removal turns hooks OFF; it does not revoke the consent the migration
    // recorded, so re-enabling later installs without re-asking.
    expect(readConsent(tmpHome)).toBe(true);
    narrator.check('our entries gone, third-party hook kept, hooks persisted off');

    expect(await getSettingChecked(frame, 'Instant Detection (Hooks)')).toBe(false);
    narrator.check('Settings shows Instant Detection OFF');
  });
});

/**
 * The ordinary Settings toggle, when the uninstall CANNOT succeed.
 *
 * The preference used to be persisted before the removal was attempted, so a
 * failed uninstall stranded the user: the entries stayed on disk and kept
 * firing, while the persisted hooks-off made the next activation skip the
 * consent/install path entirely — never asked again, and the checkbox read
 * "off" so clicking it would install rather than remove.
 *
 * Consent is seeded, so this is the ordinary toggle path and not the gate. The
 * failure is forced by making ~/.claude unwritable AFTER a real install, which
 * is the state that matters: hooks genuinely installed and firing, checkbox
 * genuinely ON, and a removal that cannot land.
 */
test.describe('Hooks consent gate / toggle-off failure', () => {
  test.use({
    seedConfig: {
      vscode: { alwaysShowLabels: true, onboardingDone: true },
      hooksConsent: { claude: 'granted' },
    },
  });

  test.skip(process.platform === 'win32', 'chmod-based write failure is not meaningful on Windows');

  test('a failed uninstall does not persist hooks-off @area:cross-cutting', async ({
    pixelAgents,
  }) => {
    const { frame, tmpHome, narrator } = pixelAgents;
    const claudeDir = path.join(tmpHome, '.claude');

    // Startup installed for real (consent seeded), so the checkbox is ON and
    // the toggle below is a genuine state change rather than a no-op click.
    await expect.poll(() => ourHookEvents(tmpHome).length, { timeout: 30_000 }).toBe(10);
    expect(await getSettingChecked(frame, 'Instant Detection (Hooks)')).toBe(true);
    narrator.check('hooks installed and the checkbox reads ON');

    const before = fs.readFileSync(settingsPath(tmpHome), 'utf8');
    try {
      fs.chmodSync(claudeDir, 0o500); // read+execute only: no write can land
      narrator.step('toggling hooks OFF while ~/.claude cannot be written');
      await setSettings(frame, { hooksEnabled: false });

      // Settle: the persist, had it happened, lands well inside this window.
      await frame.page().waitForTimeout(3_000);

      // The entries are still there and still firing...
      expect(fs.readFileSync(settingsPath(tmpHome), 'utf8')).toBe(before);
      // ...so the preference must NOT say hooks-off, or the next activation
      // skips the install path and the user is never asked again.
      expect(readHooksEnabled(tmpHome)).not.toBe(false);
      narrator.check('hooks still installed and hooksEnabled not persisted off');
    } finally {
      fs.chmodSync(claudeDir, 0o700); // or teardown cannot remove tmpHome
    }
  });
});
