import type { Frame } from '@playwright/test';

import { expect, test } from '../../../fixtures/pixel-agents';
import { spawnInternalAgentAndWait } from '../../../helpers/internal-agent';
import {
  arrangeNextClaudeInvocation,
  claudeScenario,
  spawnExternalClaudeScenario,
} from '../../../helpers/mock-claude';
import {
  expectNoOverlayWithTexts,
  expectOverlayCount,
  expectOverlayVisible,
} from '../../../helpers/office';
import {
  buildAssistantToolUseRecord,
  buildAsyncAgentLaunchResultRecord,
  buildTeamMetadataRecord,
  buildTurnDurationRecord,
  buildUserToolResultRecord,
  seedTeamConfig,
} from '../../../helpers/team';
import {
  INLINE_TEAMMATE_ROLE,
  TMUX_TEAMMATE_ALIAS,
  uniqueTeamName,
  withTmuxTeammateSession,
} from '../../../helpers/lifecycle';
import { getPixelAgentsFrame, openPixelAgentsPanel, setSettings } from '../../../helpers/webview';

async function expectExternalAgentAdoption(frame: Frame): Promise<void> {
  await expectOverlayCount(frame, 1, 10_000);
}

test.describe('Hooks OFF / matrix', () => {
  test('internal basic spawn adopted via JSONL polling @area:matrix', async ({ pixelAgents }) => {
    const { frame, window, tmpHome, mockLogFile, narrator } = pixelAgents;

    narrator.step('turning hooks OFF — adoption must come purely from JSONL polling');
    await setSettings(frame, {
      hooksEnabled: false,
    });

    narrator.step('scripting the mock: a Task tool_use, its result, then turn_duration');
    await arrangeNextClaudeInvocation(
      tmpHome,
      claudeScenario('internal basic spawn hooks off')
        .at(4_500)
        .appendJsonl(
          buildAssistantToolUseRecord('toolu-a2-task', 'Task', {
            description: 'Delegate research',
          }),
        )
        .at(8_000)
        .appendJsonl(buildUserToolResultRecord('toolu-a2-task'))
        .at(8_500)
        .appendJsonl(buildTurnDurationRecord())
        .holdOpenFor(11_000)
        .build(),
    );

    await spawnInternalAgentAndWait(frame, tmpHome, mockLogFile);
    const terminalTab = window.getByText(/Claude Code #\d+/);
    await expect(terminalTab.first()).toBeVisible({ timeout: 15_000 });
    narrator.check('the Claude Code terminal tab is visible');
    await openPixelAgentsPanel(window);
    const panelFrame = await getPixelAgentsFrame(window);

    narrator.step('watching the office — the launched session should be adopted by polling');
    await expectOverlayCount(panelFrame, 1);
    narrator.check('exactly one character adopted via JSONL polling (count → 1)');
  });

  test('external tmux teammate session is never adopted as a character @area:matrix', async ({
    pixelAgents,
  }) => {
    const { frame, tmpHome, workspaceDir, mockLogFile, narrator } = pixelAgents;
    const teamName = uniqueTeamName('hooks-off-external-tmux');
    const sessionId = 'hooks-off-external-tmux-session';

    narrator.step('enabling Watch All Sessions, hooks OFF — external tmux team on disk');
    await setSettings(frame, {
      watchAllSessions: true,
      hooksEnabled: false,
    });

    narrator.step('seeding the team config: a lead plus a web-researcher teammate');
    seedTeamConfig(tmpHome, teamName, ['lead', INLINE_TEAMMATE_ROLE]);
    await spawnExternalClaudeScenario({
      tmpHome,
      workspaceDir,
      mockLogFile,
      sessionId,
      scenario: withTmuxTeammateSession(claudeScenario('external tmux teammate hooks off'))
        .at(5_000)
        .appendJsonl(buildTeamMetadataRecord(teamName))
        .at(6_500)
        .appendJsonl(
          buildAssistantToolUseRecord('toolu-a12-team-spawn', 'Agent', {
            description: 'Delegate research',
            run_in_background: true,
          }),
        )
        .at(7_000)
        .appendJsonl(buildAsyncAgentLaunchResultRecord('toolu-a12-team-spawn'))
        .at(8_000)
        .appendJsonl(buildTeamMetadataRecord(teamName, INLINE_TEAMMATE_ROLE), {
          session: TMUX_TEAMMATE_ALIAS,
        })
        .at(10_000)
        .appendJsonl(
          buildAssistantToolUseRecord('toolu-a12-lead-bash', 'Bash', {
            command: 'npm test',
          }),
        )
        .at(10_000)
        .appendJsonl(
          buildAssistantToolUseRecord('toolu-a12-teammate-search', 'WebSearch', {
            query: 'pixel agents',
          }),
          { session: TMUX_TEAMMATE_ALIAS },
        )
        .holdOpenFor(15_000)
        .build(),
    });

    narrator.step('waiting for the external scanner to adopt the session');
    await expectExternalAgentAdoption(frame);
    narrator.check('external lead adopted (count → 1)');
    narrator.step('waiting for the run_in_background Agent to surface a Subtask on the lead');
    await expectOverlayVisible(frame, 'Subtask: Delegate research', 10_000);
    narrator.check('"Subtask: Delegate research" appears on the lead');
    await expectOverlayVisible(frame, 'Running: npm test', 10_000);
    narrator.check('the lead owns "Running: npm test"');
    // The teammate's own session is on disk and active, yet it is no character:
    // the count stays 1 and its tool never shows in the office.
    await expectOverlayCount(frame, 1);
    await expectNoOverlayWithTexts(frame, ['Searching the web']);
    narrator.check('the tmux teammate adds no character — still 1, no "Searching the web"');
  });
});
