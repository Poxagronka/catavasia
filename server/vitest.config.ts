import { defineConfig } from 'vitest/config';

process.env['ALLURE_LABEL_epic'] ??= 'server';
// No test may open a real browser tab: the spawned CLIs inherit this env.
process.env['CATAVASIA_NO_OPEN'] = '1';
// No detached git auto-maintenance: after a commit it can still write packs
// into a temp HOME that afterEach already removes (ENOTEMPTY in rmSync).
process.env['GIT_CONFIG_COUNT'] = '2';
process.env['GIT_CONFIG_KEY_0'] = 'maintenance.auto';
process.env['GIT_CONFIG_VALUE_0'] = 'false';
process.env['GIT_CONFIG_KEY_1'] = 'gc.auto';
process.env['GIT_CONFIG_VALUE_1'] = '0';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 10_000,
    include: ['__tests__/**/*.test.ts'],
    setupFiles: ['allure-vitest/setup'],
    reporters: [
      'default',
      [
        'allure-vitest/reporter',
        {
          resultsDir: '../allure-results/server',
        },
      ],
    ],
  },
});
