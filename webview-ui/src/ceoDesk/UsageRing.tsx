import type { ContextUse, UsageLimits } from '../../../core/src/catSession.js';
import { ComposerMenu } from './ComposerMenu.js';
import { contextText, percent, resetText } from './dockState.js';

function Bar({
  label,
  used,
  note,
  testId,
}: {
  label: string;
  used: number;
  note?: string;
  testId: string;
}) {
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <div className="flex gap-8 justify-between">
        <span className="text-text whitespace-nowrap">{label}</span>
        <span className="text-right">
          {percent(used)} used{note ? ` · ${note}` : ''}
        </span>
      </div>
      <div className="usage-bar">
        <div style={{ width: percent(used) }} />
      </div>
    </div>
  );
}

const R = 6;
const C = 2 * Math.PI * R;

/** The ring: how full the CEO's context window is. */
function Ring({ part }: { part: number }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <circle
        cx="8"
        cy="8"
        r={R}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="2"
      />
      <circle
        cx="8"
        cy="8"
        r={R}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray={`${C * Math.min(1, part)} ${C}`}
        transform="rotate(-90 8 8)"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * The context ring at the right of the composer row. A click opens plain
 * bars: the context used, and the 5-hour and weekly limits of the Claude
 * subscription (a limit the office has not seen yet is not shown).
 */
export function UsageRing({ context, limits }: { context?: ContextUse; limits?: UsageLimits }) {
  const part = context ? context.used / context.window : 0;
  return (
    <ComposerMenu
      label={<Ring part={part} />}
      title={contextText(context)}
      testId="dock-usage"
      align="right"
    >
      {() => (
        <div className="flex flex-col gap-10 prose-small text-text-muted w-[240px]">
          {context ? (
            <Bar label="Context used" used={part} testId="usage-context" />
          ) : (
            <span data-testid="usage-context">{contextText(context)}</span>
          )}
          {limits?.fiveHour && (
            <Bar
              label="5-hour limit"
              used={limits.fiveHour.used}
              note={resetText(limits.fiveHour, false)}
              testId="usage-five-hour"
            />
          )}
          {limits?.weekly && (
            <Bar
              label="Weekly limit"
              used={limits.weekly.used}
              note={resetText(limits.weekly, true)}
              testId="usage-weekly"
            />
          )}
        </div>
      )}
    </ComposerMenu>
  );
}
