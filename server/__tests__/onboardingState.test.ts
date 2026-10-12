/**
 * The `language` and `onboardingDone` settings: an existing user is never forced into the onboarding,
 * "Reset everything" shows it again. Runs in a temp HOME.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readConfig } from '../src/configPersistence.js';
import { FileStateAdapter } from '../src/fileStateAdapter.js';
import {
  getLanguage,
  isOnboardingDone,
  resetOnboardingState,
  setLanguage,
  settleOnboardingState,
} from '../src/onboardingState.js';

let home: string;
let originalHome: string | undefined;

beforeEach(() => {
  home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pa-onboarding-')));
  originalHome = process.env.HOME;
  process.env.HOME = home;
  fs.mkdirSync(path.join(home, '.pixel-agents'));
});

afterEach(() => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  fs.rmSync(home, { recursive: true, force: true });
});

const adapter = () => new FileStateAdapter({ namespace: 'standalone' });

describe('onboardingDone', () => {
  it('settles a fresh machine to not done', () => {
    const a = adapter();
    settleOnboardingState(a);
    expect(isOnboardingDone(a)).toBe(false);
    expect(readConfig().standalone.onboardingDone).toBe(false);
  });

  it('stays not done when cats.json appears after the first settle', () => {
    settleOnboardingState(adapter());
    fs.writeFileSync(path.join(home, '.pixel-agents', 'cats.json'), '{}');
    const a = adapter();
    settleOnboardingState(a);
    expect(isOnboardingDone(a)).toBe(false);
  });

  it('is done for an existing user whose cats.json exists', () => {
    fs.writeFileSync(path.join(home, '.pixel-agents', 'cats.json'), '{}');
    const a = adapter();
    settleOnboardingState(a);
    expect(isOnboardingDone(a)).toBe(true);
  });

  it('is done for a VS Code user who has a layout.json but no cats.json', () => {
    fs.writeFileSync(path.join(home, '.pixel-agents', 'layout.json'), '{}');
    const a = adapter();
    settleOnboardingState(a);
    expect(isOnboardingDone(a)).toBe(true);
  });

  it('is done for a user who has seen a version', () => {
    const a = adapter();
    a.setSetting('pixel-agents.lastSeenVersion', '1.4.0');
    settleOnboardingState(a);
    expect(isOnboardingDone(a)).toBe(true);
  });

  it('never overrides a decided value', () => {
    fs.writeFileSync(path.join(home, '.pixel-agents', 'cats.json'), '{}');
    const a = adapter();
    a.setSetting('pixel-agents.onboardingDone', false);
    settleOnboardingState(a);
    expect(isOnboardingDone(a)).toBe(false);
  });

  it('Reset everything turns it off in both namespaces', () => {
    const a = adapter();
    a.setSetting('pixel-agents.onboardingDone', true);
    resetOnboardingState();
    const cfg = readConfig();
    expect(cfg.standalone.onboardingDone).toBe(false);
    expect(cfg.vscode.onboardingDone).toBe(false);
  });
});

describe('language', () => {
  it('defaults to unset and stores a supported code', () => {
    const a = adapter();
    expect(getLanguage(a)).toBe('');
    expect(setLanguage(a, 'ur')).toBe(true);
    expect(getLanguage(a)).toBe('ur');
  });

  it('ignores an unknown code', () => {
    const a = adapter();
    expect(setLanguage(a, 'xx')).toBe(false);
    expect(setLanguage(a, 42)).toBe(false);
    expect(getLanguage(a)).toBe('');
  });
});
