import { useEffect, useState } from 'react';

import {
  CHARACTER_SITTING_OFFSET_PX,
  SCENE_BADGE_GLYPH_COLOR,
  SCENE_BUBBLE_BG as BUBBLE_BG,
  SCENE_BUBBLE_INK as BUBBLE_INK,
  SCENE_KIND_COLORS,
  TOOL_OVERLAY_VERTICAL_OFFSET,
} from '../../constants.js';
import type { CatMessageKind } from '../../orchestratorEvents.js';
import { activityHeadDropY, characterDrawOffsetX } from '../engine/characters.js';
import type { SceneBubble } from '../engine/officeScenes.js';
import type { OfficeState } from '../engine/officeState.js';
import { overlayProjection } from '../projection.js';
import { CharacterState } from '../types.js';

/** Corner badge per message kind: a glyph and its colour. */
const KIND_BADGE: Record<CatMessageKind, { glyph: string; color: string; label: string }> = {
  brief: { glyph: '!', color: SCENE_KIND_COLORS.brief, label: 'Brief' },
  delegate: { glyph: '»', color: SCENE_KIND_COLORS.delegate, label: 'Delegate' },
  ask: { glyph: '?', color: SCENE_KIND_COLORS.ask, label: 'Ask' },
  reply: { glyph: '«', color: SCENE_KIND_COLORS.reply, label: 'Reply' },
  report: { glyph: '✓', color: SCENE_KIND_COLORS.report, label: 'Report' },
  review: { glyph: '★', color: SCENE_KIND_COLORS.review, label: 'Review' },
};

/** CSS px between the bubble tail and the cat's head. */
const BUBBLE_LIFT_PX = 2;
/** CSS px from the bubble's near edge to its tail, for a bubble grown to one side. */
const TAIL_INSET_PX = 14;

interface SceneBubbleOverlayProps {
  officeState: OfficeState;
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  panRef: React.RefObject<{ x: number; y: number }>;
}

function catName(os: OfficeState, id: number): string {
  const ch = os.characters.get(id);
  return ch?.agentName || ch?.folderName || `Cat ${id}`;
}

/**
 * Text speech bubbles of work talks and briefings (engine/officeScenes.ts),
 * with a tooltip of the full summary on hover over a bubble or either cat.
 */
export function SceneBubbleOverlay({
  officeState,
  containerRef,
  zoom,
  panRef,
}: SceneBubbleOverlayProps) {
  const [, setTick] = useState(0);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      setTick((n) => n + 1);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const el = containerRef.current;
  if (!el) return null;
  const bubbles = officeState.scenes.bubbles();
  const queued = officeState.scenes.queuedCats();
  if (bubbles.length === 0 && queued.length === 0) return null;
  const project = overlayProjection(
    officeState.getLayout(),
    el.getBoundingClientRect(),
    zoom,
    panRef.current,
    window.devicePixelRatio || 1,
  );
  const hoveredCat = officeState.hoveredAgentId;
  const pair = (b: SceneBubble) => [b.from, b.to].sort().join(':');
  // The tooltip shows on the hovered bubble, else on the first bubble of the
  // talk the hovered cat takes part in.
  const tipKey =
    bubbles.find((b) => b.key === hoverKey)?.key ??
    bubbles.find((b) => hoveredCat !== null && (b.from === hoveredCat || b.to === hoveredCat))?.key;

  return (
    <>
      {queued.map((id, i) => {
        const ch = officeState.characters.get(id);
        if (!ch) return null;
        const x = project.toScreenX(ch.x + characterDrawOffsetX(ch));
        const y = project.toScreenY(ch.y - TOOL_OVERLAY_VERTICAL_OFFSET);
        return (
          <div
            key={`queue-${id}`}
            className="absolute pixel-panel px-4 leading-none whitespace-nowrap text-2xs"
            style={{ left: x, top: y, transform: 'translate(-50%, -100%)', zIndex: 39 }}
            data-testid="queue-marker"
            data-cat-id={id}
            title="This cat's turn waits for a free slot (Settings: Cats working at once)"
          >
            in queue #{i + 1}
          </div>
        );
      })}
      {bubbles.map((b) => {
        const ch = officeState.characters.get(b.catId);
        if (!ch) return null;
        const drop =
          ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : activityHeadDropY(ch);
        const x = project.toScreenX(ch.x + characterDrawOffsetX(ch));
        const y = project.toScreenY(ch.y + drop - TOOL_OVERLAY_VERTICAL_OFFSET) - BUBBLE_LIFT_PX;
        const badge = KIND_BADGE[b.kind];
        // Two cats side by side: each bubble grows away from the partner, so
        // the speaker's and the listener's bubbles never overlap.
        const partner = officeState.characters.get(b.catId === b.from ? b.to : b.from);
        const side = !partner || partner.id === ch.id ? 0 : partner.x > ch.x ? -1 : 1;
        const shiftX =
          side === 0
            ? '-50%'
            : side < 0
              ? `calc(-100% + ${TAIL_INSET_PX}px)`
              : `-${TAIL_INSET_PX}px`;
        const tailLeft =
          side === 0 ? '50%' : side < 0 ? `calc(100% - ${TAIL_INSET_PX}px)` : `${TAIL_INSET_PX}px`;
        const showTip = b.key === tipKey;
        const thread = bubbles.filter((o) => pair(o) === pair(b));
        return (
          <div
            key={b.key}
            className="absolute"
            style={{
              left: x,
              top: y,
              transform: `translate(${shiftX}, -100%)`,
              zIndex: showTip ? 44 : 40,
            }}
            data-testid="scene-bubble"
            data-cat-id={b.catId}
            data-kind={b.kind}
            onMouseEnter={() => setHoverKey(b.key)}
            onMouseLeave={() => setHoverKey((k) => (k === b.key ? null : k))}
          >
            <div
              className="relative px-6 pt-3 pb-4 whitespace-nowrap leading-none shadow-pixel"
              style={{
                background: BUBBLE_BG,
                color: BUBBLE_INK,
                border: `2px solid ${BUBBLE_INK}`,
                fontSize: '16px',
                minWidth: 28,
              }}
            >
              <span
                className="absolute flex items-center justify-center leading-none"
                style={{
                  top: -8,
                  left: -8,
                  width: 14,
                  height: 14,
                  background: badge.color,
                  color: SCENE_BADGE_GLYPH_COLOR,
                  border: `2px solid ${BUBBLE_INK}`,
                  fontSize: '14px',
                }}
                title={badge.label}
              >
                {badge.glyph}
              </span>
              {b.lines.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
              <span
                className="absolute"
                style={{
                  left: tailLeft,
                  bottom: -8,
                  marginLeft: -4,
                  width: 8,
                  height: 6,
                  background: BUBBLE_BG,
                  borderLeft: `2px solid ${BUBBLE_INK}`,
                  borderRight: `2px solid ${BUBBLE_INK}`,
                  borderBottom: `2px solid ${BUBBLE_INK}`,
                }}
              />
            </div>
            {showTip && (
              <div
                className="absolute pixel-panel px-8 py-6 text-left"
                style={{
                  left: '50%',
                  bottom: '100%',
                  marginBottom: 6,
                  transform: 'translateX(-50%)',
                  width: 260,
                  whiteSpace: 'normal',
                  fontSize: '16px',
                  lineHeight: 1.15,
                }}
                data-testid="scene-tooltip"
              >
                {thread.map((t) => (
                  <div key={t.key} className="mb-4 last:mb-0">
                    <div style={{ color: KIND_BADGE[t.kind].color, filter: 'brightness(1.6)' }}>
                      {catName(officeState, t.from)}
                      {t.to !== t.from ? ` → ${catName(officeState, t.to)}` : ''} ·{' '}
                      {KIND_BADGE[t.kind].label}
                    </div>
                    <div>{t.tooltip}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
