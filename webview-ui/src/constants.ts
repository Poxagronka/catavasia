import type { ColorValue } from './components/ui/types.js';

// ── Grid & Layout ────────────────────────────────────────────
export const TILE_SIZE = 16;
export const DEFAULT_COLS = 20;
export const DEFAULT_ROWS = 11;
export const MAX_COLS = 64;
export const MAX_ROWS = 64;

// ── Character Animation ─────────────────────────────────────
export const WALK_SPEED_PX_PER_SEC = 48;
export const WALK_FRAME_DURATION_SEC = 0.15;
export const TYPE_FRAME_DURATION_SEC = 0.3;
export const WANDER_PAUSE_MIN_SEC = 2.0;
export const WANDER_PAUSE_MAX_SEC = 20.0;
export const WANDER_MOVES_BEFORE_REST_MIN = 3;
export const WANDER_MOVES_BEFORE_REST_MAX = 6;
export const SEAT_REST_MIN_SEC = 120.0;
export const SEAT_REST_MAX_SEC = 240.0;
/** Pause between two idle activities (coffee, nap, ...). */
export const IDLE_ACTIVITY_PAUSE_MIN_SEC = 1.5;
export const IDLE_ACTIVITY_PAUSE_MAX_SEC = 5.0;

// ── Matrix Effect ────────────────────────────────────────────
export const MATRIX_EFFECT_DURATION_SEC = 0.3;
export const MATRIX_TRAIL_LENGTH = 6;
export const MATRIX_SPRITE_COLS = 16;
export const MATRIX_SPRITE_ROWS = 24;
export const MATRIX_FLICKER_FPS = 30;
export const MATRIX_FLICKER_VISIBILITY_THRESHOLD = 180;
export const MATRIX_COLUMN_STAGGER_RANGE = 0.3;
export const MATRIX_HEAD_COLOR = '#ccffcc';
export const matrixGreenBright = (a: number): string => `rgba(0, 255, 65, ${a})`;
export const matrixGreenMid = (a: number): string => `rgba(0, 170, 40, ${a})`;
export const matrixGreenDim = (a: number): string => `rgba(0, 85, 20, ${a})`;
export const MATRIX_TRAIL_OVERLAY_ALPHA = 0.6;
export const MATRIX_TRAIL_EMPTY_ALPHA = 0.5;
export const MATRIX_TRAIL_MID_THRESHOLD = 0.33;
export const MATRIX_TRAIL_DIM_THRESHOLD = 0.66;

// ── Rendering ────────────────────────────────────────────────
export const CHARACTER_SITTING_OFFSET_PX = 6;
export const CHARACTER_Z_SORT_OFFSET = 0.5;
export const OUTLINE_Z_SORT_OFFSET = 0.001;
export const SELECTED_OUTLINE_ALPHA = 1.0;
export const HOVERED_OUTLINE_ALPHA = 0.5;
/** Headless agents (adopted, no terminal to focus) render slightly translucent. */
export const HEADLESS_CHARACTER_ALPHA = 0.5;
export const GHOST_PREVIEW_SPRITE_ALPHA = 0.5;
export const GHOST_PREVIEW_TINT_ALPHA = 0.25;
export const SELECTION_DASH_PATTERN: [number, number] = [4, 3];
export const BUTTON_MIN_RADIUS = 6;
export const BUTTON_RADIUS_ZOOM_FACTOR = 3;
export const BUTTON_ICON_SIZE_FACTOR = 0.45;
export const BUTTON_LINE_WIDTH_MIN = 1.5;
export const BUTTON_LINE_WIDTH_ZOOM_FACTOR = 0.5;
export const BUBBLE_FADE_DURATION_SEC = 0.5;
export const BUBBLE_SITTING_OFFSET_PX = 10;
export const BUBBLE_VERTICAL_OFFSET_PX = 24;
export const FALLBACK_FLOOR_COLOR = '#808080';

// ── Rendering - Overlay Colors (canvas, not CSS) ─────────────
export const SEAT_OWN_COLOR = 'rgba(0, 127, 212, 0.35)';
export const SEAT_AVAILABLE_COLOR = 'rgba(0, 200, 80, 0.35)';
export const SEAT_BUSY_COLOR = 'rgba(220, 50, 50, 0.35)';
export const GRID_LINE_COLOR = 'rgba(255,255,255,0.12)';
export const VOID_TILE_OUTLINE_COLOR = 'rgba(255,255,255,0.08)';
export const VOID_TILE_DASH_PATTERN: [number, number] = [2, 2];
export const GHOST_BORDER_HOVER_FILL = 'rgba(60, 130, 220, 0.25)';
export const GHOST_BORDER_HOVER_STROKE = 'rgba(60, 130, 220, 0.5)';
export const GHOST_BORDER_STROKE = 'rgba(255, 255, 255, 0.06)';
export const GHOST_VALID_TINT = '#00ff00';
export const GHOST_INVALID_TINT = '#ff0000';
export const SELECTION_HIGHLIGHT_COLOR = '#007fd4';
export const DELETE_BUTTON_BG = 'rgba(200, 50, 50, 0.85)';
export const ROTATE_BUTTON_BG = 'rgba(50, 120, 200, 0.85)';
export const BUTTON_ICON_COLOR = '#fff';
export const CANVAS_FALLBACK_TILE_COLOR = '#444';
export const CANVAS_ERROR_TILE_COLOR = '#FF00FF';
export const WALL_COLOR = '#3A3A5C';

// ── Camera ───────────────────────────────────────────────────
export const CAMERA_FOLLOW_LERP = 0.1;
export const CAMERA_FOLLOW_SNAP_THRESHOLD = 0.5;

// ── Zoom ─────────────────────────────────────────────────────
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 10;
export const ZOOM_DEFAULT_DPR_FACTOR = 2;
/** How long the rotate banner shows why R changed nothing. */
export const ROTATE_NOTE_MS = 1600;
export const ZOOM_LEVEL_FADE_DELAY_MS = 1500;
export const ZOOM_LEVEL_HIDE_DELAY_MS = 2000;
export const ZOOM_LEVEL_FADE_DURATION_SEC = 0.5;
export const ZOOM_SCROLL_THRESHOLD = 50;
export const PAN_MARGIN_FRACTION = 0.25;

// ── Editor ───────────────────────────────────────────────────
export const UNDO_STACK_MAX_SIZE = 50;
export const LAYOUT_SAVE_DEBOUNCE_MS = 500;

// ── Layout Import/Export (browser-native, standalone) ────────
/** Suggested filename when exporting the office layout from the standalone browser. */
export const LAYOUT_EXPORT_FILENAME = 'pixel-agents-layout.json';
/** MIME type for the exported layout Blob. */
export const LAYOUT_EXPORT_MIME = 'application/json';
export const DEFAULT_FLOOR_COLOR: ColorValue = { h: 35, s: 30, b: 15, c: 0 };
export const DEFAULT_WALL_COLOR: ColorValue = { h: 240, s: 25, b: 0, c: 0 };
export const DEFAULT_NEUTRAL_COLOR: ColorValue = { h: 0, s: 0, b: 0, c: 0 };

// ── Carpets ──────────────────────────────────────────────────
/** Main (lowest-luminance) color applied to carpets when no per-tile override is set. */
export const CARPET_DEFAULT_COLOR: ColorValue = { h: 0, s: 71, b: -32, c: 0, colorize: true };
/** Accent (highest-luminance) color applied to carpets when no per-tile override is set. */
export const CARPET_DEFAULT_ACCENT_COLOR: ColorValue = {
  h: 34,
  s: 64,
  b: 21,
  c: 0,
  colorize: true,
};
/** Keyboard key that switches from CARPET_PAINT to CARPET_PICK while editing. */
export const KEY_CARPET_PICK = 'p';

// ── Areas (named, colored workspace-folder zones) ────────────
/** Color palette assigned to new Areas in rotation (cycles when more areas exist). */
export const AREA_DEFAULT_COLORS: readonly string[] = [
  '#ff6b6b',
  '#feca57',
  '#48dbfb',
  '#1dd1a1',
  '#5f27cd',
  '#ff9ff3',
  '#54a0ff',
  '#ffa502',
] as const;
/** Translucent overlay alpha for area tile fills. */
export const AREA_OVERLAY_ALPHA = 0.25;
/** Alpha multiplier applied to the actively-selected area's overlay. */
export const AREA_ACTIVE_ALPHA_MULTIPLIER = 1.6;
/** Base font size (pixel-pre-zoom) for area centroid labels. */
export const AREA_LABEL_FONT_SIZE_PX = 14;
/** Minimum on-screen label size to keep labels legible at low zoom. */
export const AREA_LABEL_MIN_FONT_SIZE_PX = 12;
/** Alpha of the area label text. */
export const AREA_LABEL_ALPHA = 1.0;
/** Fallback label color when an area has no color set (shouldn't happen in practice). */
export const AREA_LABEL_FALLBACK_COLOR = '#ffffff';
/** Drop-shadow color behind area labels for legibility on light backgrounds. */
export const AREA_LABEL_SHADOW_COLOR = '#000000';
/** Drop-shadow alpha behind area labels. */
export const AREA_LABEL_SHADOW_ALPHA = 0.6;

// ── VisualColorPicker (HSV wheel + brightness for carpets) ───
export const VISUAL_COLOR_PICKER_SV_SIZE_PX = 180;
export const VISUAL_COLOR_PICKER_HUE_WIDTH_PX = 20;
export const VISUAL_COLOR_PICKER_MARKER_RADIUS_PX = 6;
/**
 * The hue bar gradient is intrinsic to the color-picking interaction, not a
 * theme color — it must span the full hue circle. Centralized here so the
 * component body stays free of inline color literals. (The saturation/brightness
 * square is painted to a canvas from the carpet HSL model, not a CSS gradient.)
 */
export const VISUAL_COLOR_PICKER_HUE_GRADIENT =
  'linear-gradient(to bottom, ' +
  '#ff0000 0%, #ffff00 16.7%, #00ff00 33.3%, ' +
  '#00ffff 50%, #0000ff 66.7%, #ff00ff 83.3%, #ff0000 100%)';
export const VISUAL_COLOR_PICKER_MARKER_BORDER = '2px solid #fff';
export const VISUAL_COLOR_PICKER_MARKER_SHADOW = '0 0 0 1px rgba(0,0,0,0.6)';
/** Width of the collapsed swatch + hex trigger row (compact mode). */
export const VISUAL_COLOR_PICKER_COMPACT_WIDTH_PX = 160;
/** Swatch square size shown in the collapsed trigger. */
export const VISUAL_COLOR_PICKER_SWATCH_PX = 22;
/** Gap (px) between the collapsed trigger and the expanded popup panel. */
export const VISUAL_COLOR_PICKER_POPUP_GAP_PX = 6;

// ── Notification Sound (done: ascending chime) ─────────────
export const NOTIFICATION_NOTE_1_HZ = 659.25; // E5
export const NOTIFICATION_NOTE_2_HZ = 1318.51; // E6 (octave up)
export const NOTIFICATION_NOTE_1_START_SEC = 0;
export const NOTIFICATION_NOTE_2_START_SEC = 0.1;
export const NOTIFICATION_NOTE_DURATION_SEC = 0.18;
export const NOTIFICATION_VOLUME = 0.14;

// ── Permission Sound (attention: descending double tap) ────
export const PERMISSION_NOTE_1_HZ = 880; // A5
export const PERMISSION_NOTE_2_HZ = 659.25; // E5 (down a fourth)
export const PERMISSION_NOTE_1_START_SEC = 0;
export const PERMISSION_NOTE_2_START_SEC = 0.12;
export const PERMISSION_NOTE_DURATION_SEC = 0.15;
export const PERMISSION_VOLUME = 0.12;

// ── Furniture Animation ─────────────────────────────────────
export const FURNITURE_ANIM_INTERVAL_SEC = 0.2;

// ── Version Notice ──────────────────────────────────────────
export const WHATS_NEW_AUTO_CLOSE_MS = 20000;
export const WHATS_NEW_FADE_MS = 1000;

// ── Game Logic ───────────────────────────────────────────────
export const MAX_DELTA_TIME_SEC = 0.1;
export const WAITING_BUBBLE_DURATION_SEC = 2.0;
export const DISMISS_BUBBLE_FAST_FADE_SEC = 0.3;
export const INACTIVE_SEAT_TIMER_MIN_SEC = 3.0;
export const INACTIVE_SEAT_TIMER_RANGE_SEC = 2.0;
/** Default/fallback palette count (bundled characters). Actual count comes from getLoadedCharacterCount(). */
export const PALETTE_COUNT = 13;
/** Cat names by palette index, in scripts/cats/breeds.mjs order (char_N.png = CAT_NAMES[N]). */
export const CAT_NAMES = [
  'Marmalade',
  'Smokey',
  'Shadow',
  'Snow',
  'Tux',
  'Patches',
  'Tortie',
  'Mochi',
  'Nikolai',
  'Butterscotch',
  'Leo',
  'Dobby',
  'Bear',
] as const;
export const AUTO_ON_FACING_DEPTH = 3;
export const AUTO_ON_SIDE_DEPTH = 2;
export const CHARACTER_HIT_HALF_WIDTH = 8;
export const CHARACTER_HIT_HEIGHT = 24;
export const TOOL_OVERLAY_VERTICAL_OFFSET = 32;

// ── Greeter + Intro bubble ──────────────────────────────────
/** Reserved character id for the Intro's greeter. Far outside both real agent
 *  ids (positive) and sub-agent ids (small negatives from -1 down). */
export const GREETER_ID = -1_000_000_000;
/** Stacking order for the Intro's bubble. Deliberately BELOW the modal stack
 *  (ui/Modal defaults to 50, ChangelogModal 51, the migration notice z-100): the
 *  Intro is diegetic furniture over the office, not a modal, so a modal opened
 *  on top of it must cover it rather than slide underneath. */
export const INTRO_BUBBLE_Z_INDEX = 45;
/** The greeter stands this many tiles in from the office's bottom-left corner
 *  (target tile (margin, rows-1-margin); nearest walkable tile if blocked). */
export const GREETER_TILE_MARGIN = 3;
/** World px above the greeter's anchor (feet) where the bubble's bottom sits.
 *  Kept well above the head target (INTRO_TAIL_TARGET_RISE_WORLD) so the
 *  tail squares have a visible run between bubble and head. */
export const INTRO_BUBBLE_ANCHOR_RISE_WORLD = 44;
/** World px right of the greeter's center where the bubble's left edge starts —
 *  just clear of the sprite so the tail points down-left at the head. */
export const INTRO_BUBBLE_OFFSET_X_WORLD = 10;
/** Bubble width cap (CSS px) and the margin kept from the container edges.
 *  Wide on purpose: the disclosure reads as three short paragraphs instead of
 *  a tall column (still clamped to the container on narrow panels). */
export const INTRO_BUBBLE_MAX_WIDTH_PX = 560;
export const INTRO_BUBBLE_EDGE_MARGIN_PX = 4;
/** Where the Intro's Claude Code step sends people who don't have it yet. */
export const CLAUDE_CODE_URL = 'https://claude.com/claude-code';
export const CLAUDE_CODE_INSTALL_COMMAND = 'npm install -g @anthropic-ai/claude-code';
/** Speech-tail squares: placed at fraction `t` along the segment from the
 *  bubble's nearest edge point to the greeter's head, shrinking toward the
 *  speaker. Recomputed every frame so the tail stays connected no matter where
 *  edge-clamping or panning puts the bubble relative to the character. */
export const INTRO_TAIL_STEPS = [
  { t: 0.25, size: 12 },
  { t: 0.55, size: 9 },
  { t: 0.82, size: 6 },
] as const;
/** World px above the greeter's anchor (feet) the tail points at — the head. */
export const INTRO_TAIL_TARGET_RISE_WORLD = 26;
/** Camera-offset caps while centering character + bubble. The ideal composition
 *  assumes the bubble fits beside/above the character; when it can't (narrow or
 *  short viewports clamp the bubble to the screen), uncapped offsets shove the
 *  greeter to the viewport edge. Horizontal offset is capped to this fraction
 *  of the viewport; vertical offset always keeps this many world px of the
 *  character visible above the bottom edge. */
export const INTRO_CAMERA_MAX_X_OFFSET_VIEWPORT_FRACTION = 0.25;
export const INTRO_CAMERA_MIN_CHAR_VISIBLE_WORLD = 48;
/** Extra downward camera shift (CSS px) so the character+bubble composition
 *  sits a bit above the vertical center instead of dead-centered. */
export const INTRO_CAMERA_DOWN_SHIFT_PX = 50;

// ── Context Fuel Gauge ──────────────────────────────────────
/** Window assumed before the runtime reports one (it always does for agents
 *  that have taken a turn; this only covers characters created ahead of it). */
export const DEFAULT_MAX_CONTEXT_TOKENS = 200_000;
export const CONTEXT_WARN_THRESHOLD = 0.6;
export const CONTEXT_DANGER_THRESHOLD = 0.8;
export const CONTEXT_CRITICAL_THRESHOLD = 0.95;
export const CONTEXT_GAUGE_WIDTH_PX = 40;
export const CONTEXT_GAUGE_HEIGHT_PX = 4;
export const CONTEXT_GAUGE_COLOR_OK = '#44cc44';
export const CONTEXT_GAUGE_COLOR_WARN = '#ffcc00';
export const CONTEXT_GAUGE_COLOR_DANGER = '#ff8800';
export const CONTEXT_GAUGE_COLOR_CRITICAL = '#ff2222';
export const CONTEXT_GAUGE_BG = '#222';

// ── Agent Teams ─────────────────────────────────────────────
export const TEAM_LEAD_COLOR = '#ffd700';
export const TEAM_ROLE_COLOR = '#66aaff';

// ── Pets ────────────────────────────────────────────────────────
/** Walking speed in world pixels per second (matches character walk speed visually but slower). */
export const PET_WALK_SPEED_PX_PER_SEC = 32;
/** Time per WALK animation cycle step (4 cycle steps × 0.15s = 0.6s per loop). */
export const PET_WALK_FRAME_DURATION_SEC = 0.15;
/** Time per IDLE animation cycle step (4 cycle steps × 0.3s = 1.2s per loop). */
export const PET_IDLE_FRAME_DURATION_SEC = 0.3;
/** Walk cycle: 4-step lookup into the 3-frame walkDown/walkUp/walkRight arrays. */
export const PET_WALK_SEQUENCE = [0, 1, 0, 2] as const;
/** Idle cycle: 4-step lookup into the 3-frame idleDown/idleUp arrays. */
export const PET_IDLE_SEQUENCE = [0, 1, 2, 1] as const;
/** Minimum seconds the pet stays in IDLE before making a new decision. */
export const PET_WANDER_PAUSE_MIN_SEC = 3.0;
/** Maximum seconds the pet stays in IDLE before making a new decision. */
export const PET_WANDER_PAUSE_MAX_SEC = 15.0;
/** Seconds between FOLLOW path re-computations. */
export const PET_FOLLOW_RECALC_INTERVAL_SEC = 1.0;
/** Probability that a pet enters FOLLOW (instead of WALK) when wanderTimer expires. */
export const PET_FOLLOW_CHANCE = 0.3;
/** Maximum Manhattan distance (tiles) at which a character can become a follow target. */
export const PET_FOLLOW_RADIUS_TILES = 3;
/** Minimum seconds a FOLLOW episode lasts before timing out. */
export const PET_FOLLOW_DURATION_MIN_SEC = 5.0;
/** Maximum seconds a FOLLOW episode lasts before timing out. */
export const PET_FOLLOW_DURATION_MAX_SEC = 15.0;
/** Hit-box half-width (world px) for pet click detection. */
export const PET_HIT_HALF_WIDTH = 8;
/** Hit-box height (world px) measured upward from the bottom-center anchor. */
export const PET_HIT_HEIGHT = 16;
/** Maximum string length for a PlacedPet.id (defends against pathologically-long layout entries). */
export const MAX_PET_ID_LENGTH = 128;

// ── Cat social scenes (talk / play / fight) ──────────────────
/** Max Chebyshev distance (tiles) for two wandering cats to meet. */
export const SOCIAL_RADIUS_TILES = 2;
/** Max distance (tiles) for an activity-driven encounter (e.g. both at coffee). */
export const SOCIAL_ACTIVITY_RADIUS_TILES = 4;
/** How often idle cats are scanned for a chance meeting. */
export const SOCIAL_CHECK_INTERVAL_SEC = 1.0;
/** Chance that one scan starts an encounter for the closest eligible pair. */
export const SOCIAL_ENCOUNTER_CHANCE = 0.2;
/** Seconds a cat waits after any social scene before the next one. */
export const SOCIAL_CAT_COOLDOWN_SEC = 25;
/** Seconds the same two cats wait before meeting again. */
export const SOCIAL_PAIR_COOLDOWN_SEC = 60;
/** Chance an encounter turns into a fight (about 1 in 15). */
export const SOCIAL_FIGHT_CHANCE = 1 / 15;
/** Chance a non-fight encounter while wandering becomes chase play. */
export const SOCIAL_PLAY_CHANCE = 0.3;
/** Seconds to walk up to the partner before the scene gives up. */
export const SOCIAL_APPROACH_TIMEOUT_SEC = 4;
/** Number of pictogram bubbles in one conversation. */
export const SOCIAL_TALK_EXCHANGES_MIN = 3;
export const SOCIAL_TALK_EXCHANGES_MAX = 6;
/** Seconds one pictogram bubble stays up, and the pause between bubbles. */
export const SOCIAL_TALK_BUBBLE_SEC = 1.3;
export const SOCIAL_TALK_GAP_SEC = 0.35;
/** A talk opens with a nose boop, sometimes followed by a head rub from one cat. */
export const SOCIAL_GREET_BOOP_SEC = 0.9;
export const SOCIAL_GREET_RUB_SEC = 0.9;
export const SOCIAL_GREET_RUB_CHANCE = 0.5;
/** The listener's happy tail flick: seconds per frame. */
export const SOCIAL_FLICK_FRAME_SEC = 0.35;
/** The arched-back hiss bobs at this pace before a fight. */
export const SOCIAL_HISS_FRAME_SEC = 0.25;
/** Mouth open / closed toggle while a cat talks. */
export const SOCIAL_TALK_MOUTH_SEC = 0.18;
/** Chase play: total length, walk-speed multiplier, re-path interval, chase radius. */
export const SOCIAL_CHASE_DURATION_SEC = 8;
export const SOCIAL_CHASE_SPEED_MUL = 1.7;
export const SOCIAL_CHASE_REPATH_SEC = 0.5;
export const SOCIAL_CHASE_RANGE_MIN_TILES = 3;
export const SOCIAL_CHASE_RANGE_MAX_TILES = 5;
/** Chase: max distance (tiles) from where the play started. */
export const SOCIAL_CHASE_ROAM_TILES = 4;
/** Seconds the tagged cat shows its "!" bubble after a tag, and before it can tag back. */
export const SOCIAL_TAG_BUBBLE_SEC = 0.8;
export const SOCIAL_TAG_COOLDOWN_SEC = 1.2;
/** Toy joint play: total length and seconds per turn. */
export const SOCIAL_TOY_DURATION_SEC = 10;
export const SOCIAL_TOY_TURN_SEC = 2;
/** Fight: puff-up stare, dust cloud, then fleeing with the anger mark. */
export const SOCIAL_FIGHT_PUFF_SEC = 1.2;
export const SOCIAL_FIGHT_CLOUD_SEC = 2.5;
export const SOCIAL_FIGHT_FLEE_SEC = 4;
export const SOCIAL_FIGHT_ANGER_SEC = 2;
export const SOCIAL_FLEE_SPEED_MUL = 1.9;
export const SOCIAL_FLEE_MIN_TILES = 4;
/** Seconds a pair that fought avoids each other (no talk / play / fight). */
export const SOCIAL_FIGHT_AVOID_SEC = 120;
/** Frame durations for the angry bristle, the anger mark and the dust cloud. */
export const SOCIAL_ANGRY_FRAME_SEC = 0.15;
export const SOCIAL_ANGER_FRAME_SEC = 0.25;
export const SOCIAL_CLOUD_FRAME_SEC = 0.1;
/** Wander pause given back to a cat when its scene ends. */
export const SOCIAL_RESUME_PAUSE_MIN_SEC = 1;
export const SOCIAL_RESUME_PAUSE_MAX_SEC = 3;
/** Cloud anchor: world px below the cats' tile centre. */
export const SOCIAL_CLOUD_FOOT_OFFSET_PX = 4;
/** Social bubble bottom above the cat's anchor (world px): clears the ears. */
export const SOCIAL_BUBBLE_OFFSET_PX = 30;
/** Anger mark position: bottom-centre, relative to the cat's anchor (world px). */
export const SOCIAL_ANGER_HEAD_OFFSET_X_PX = 6;
export const SOCIAL_ANGER_HEAD_OFFSET_Y_PX = 27;

// ── Office scenes (work conversations, briefing meeting) ─────
/** Characters per line of a work-conversation bubble. */
export const SCENE_BUBBLE_LINE_CHARS = 20;
/** Lines per bubble: longer text ends with "…" (the tooltip has it all). */
export const SCENE_BUBBLE_MAX_LINES = 2;
/** Tooltip text cap. */
export const SCENE_TOOLTIP_MAX_CHARS = 400;
/** How long a speaker's bubble shows before the listener may answer. */
export const SCENE_SPEAK_SEC = 4;
/** How long the sender waits next to the receiver for a reply. */
export const SCENE_REPLY_WAIT_SEC = 6;
/** A walk-up that does not arrive in this time gives up: the talk plays from afar. */
export const SCENE_APPROACH_TIMEOUT_SEC = 20;
/** No free reachable tile next to the receiver: the sender may stand this many tiles away. */
export const SCENE_TALK_FALLBACK_RADIUS = 2;
/** Pause before a released cat goes back to its idle life. */
export const SCENE_RELEASE_PAUSE_SEC = 2;
/** Bubble text shown by the boss in a briefing before a brief message arrives. */
export const SCENE_BRIEFING_TEXT = 'Briefing the team';
/** Work-conversation bubble paper and ink. */
export const SCENE_BUBBLE_BG = '#f6f1e3';
export const SCENE_BUBBLE_INK = '#1e1e2e';
/** Corner badge colour per message kind. */
export const SCENE_KIND_COLORS = {
  brief: '#6030ff',
  delegate: '#2f7fd8',
  ask: '#b8860b',
  reply: '#3f8f3a',
  report: '#c8640c',
  review: '#d4af37',
} as const;
/** Badge glyph colour. */
export const SCENE_BADGE_GLYPH_COLOR = '#ffffff';

// ── Cat CEO ──────────────────────────────────────────────────
/** Cat id of the Cat CEO resident (server: CAT_CEO_ID). */
export const CAT_CEO_ID = 'cat-ceo';
/** Furniture group of the Cat CEO's own chair: reserved for it (no other cat sits there). */
export const CAT_CEO_CHAIR = 'EXECUTIVE_CHAIR';
/** Without an executive chair, an Area whose label matches holds the Cat CEO's desk. */
export const CAT_CEO_AREA_PATTERN = /head|ceo/i;
/** The Cat CEO walks to at most this many reviewed cats (lowest scores first). */
export const CAT_CEO_MAX_WALKS = 4;

// ── Task Board ───────────────────────────────────────────────
/** How often the open board re-reads GET /api/tasks. */
export const TASK_POLL_INTERVAL_MS = 1500;
/** Pixel scale of the cat avatar on a task card. */
export const TASK_AVATAR_ZOOM = 2;

// ── Cats menu (profile editor) ───────────────────────────────
/** Frame time of the animated cat preview in the Cats menu. */
export const CAT_PREVIEW_FRAME_MS = 180;
/** Pixel scale of cats in the Cats menu list and the hierarchy tree. */
export const CAT_LIST_ZOOM = 2;
/** Pixel scale of the big preview in the appearance editor. */
export const CAT_EDITOR_ZOOM = 5;
/** Pixel scale of pet cats (smaller sprites) in the Pets list and preset tiles. */
export const PET_LIST_ZOOM = 3;
export const PET_PRESET_ZOOM = 2;
/** Pixel scale of the big pet preview in the Pets tab. */
export const PET_EDITOR_ZOOM = 7;

// ── Idle activities ──────────────────────────────────────────
/** Floating "Zzz" over a napping cat. */
export const ZZZ_FILL_COLOR = '#F4F1FF';
export const ZZZ_EDGE_COLOR = '#3A3352';
/** Seconds for one "z" to rise and fade. */
export const ZZZ_CYCLE_SEC = 2.4;
/** Play tunnel: runs through and back (an even count ends at the start). */
export const TUNNEL_PASSES = 6;
export const TUNNEL_RUN_SPEED_PX_PER_SEC = 48;
/** Px a "z" rises over one cycle. */
export const ZZZ_RISE_PX = 12;

// ── Pet Care (tamagotchi needs for cat pets) ─────────────────
// Needs are satisfaction meters: 100 = content, 0 = desperate.
// "Office hours" = real hours the office runs, times the debug speed factor.
export const PET_NEED_MAX = 100;
/** Starting value of every need for a cat seen for the first time. */
export const PET_NEED_START = 80;
/** Need loss per office hour. */
export const PET_NEED_DECAY_PER_HOUR = {
  hunger: 12,
  thirst: 16,
  affection: 10,
  fun: 14,
  hygiene: 3,
  energy: 8,
} as const;
/** Extra hygiene loss per office hour for each poop left on the floor. */
export const PET_HYGIENE_DECAY_PER_FLOOR_POOP = 8;
/** Extra hygiene loss per office hour for each full litter box. */
export const PET_HYGIENE_DECAY_PER_FULL_BOX = 4;
/** A need under this shows a request bubble (and a meow). */
export const PET_REQUEST_THRESHOLD = 35;
/** A cat walks to the bowl by itself when hunger/thirst drops under this. */
export const PET_SEEK_THRESHOLD = 55;
/** Bowel fill per meal and per office hour; at PET_BOWEL_MAX the cat poops. */
export const PET_BOWEL_PER_MEAL = 40;
export const PET_BOWEL_PER_HOUR = 6;
export const PET_BOWEL_MAX = 100;
/**
 * Litter box fill: piles 0 clean, 1, 2-3, PET_LITTER_FULL full (stink lines),
 * PET_LITTER_CAPACITY overflowing with flies: cats grimace and refuse it.
 */
export const PET_LITTER_FULL = 4;
export const PET_LITTER_CAPACITY = 5;
/** Litter wear: uses since the last change before it looks used / dirty. */
export const PET_LITTER_USED_AFTER = 4;
export const PET_LITTER_DIRTY_AFTER = 10;
/** Hygiene hit for a poop in the box / on the floor. */
export const PET_POOP_HYGIENE_COST_BOX = 5;
export const PET_POOP_HYGIENE_COST_FLOOR = 15;
/** Bowl contents: food and water each run 0..PET_BOWL_MAX. */
export const PET_BOWL_MAX = 100;
export const PET_BOWL_FOOD_PER_MEAL = 25;
export const PET_BOWL_WATER_PER_DRINK = 20;
/** Need gain per completed action. */
export const PET_GAIN_MEAL = 45;
export const PET_GAIN_DRINK = 50;
export const PET_GAIN_TREAT = 30;
export const PET_GAIN_SCRATCH = 35;
export const PET_GAIN_PLAY = 40;
export const PET_GAIN_CLEAN_BOX = 35;
export const PET_GAIN_CLEAN_FLOOR_POOP = 20;
export const PET_GAIN_CHANGE_LITTER = 45;
/** Offline catch-up: decay runs at this fraction while the office is closed, capped. */
export const PET_OFFLINE_DECAY_FACTOR = 0.1;
export const PET_OFFLINE_MAX_CATCHUP_HOURS = 2;
/** Mood bands (mood = mean of the average and the lowest need). */
export const PET_MOOD_HAPPY = 70;
export const PET_MOOD_CONTENT = 45;
export const PET_MOOD_GRUMPY = 20;
/** Seconds between autonomous need checks (pathfinding is not per-frame). */
export const PET_CARE_DECIDE_INTERVAL_SEC = 2;
/** Seconds between pets-state.json saves while something changed. */
export const PET_CARE_SAVE_INTERVAL_SEC = 15;
/** Seconds between meows of one cat with a standing request, and across all cats. */
export const PET_MEOW_INTERVAL_SEC = 120;
export const PET_MEOW_GLOBAL_COOLDOWN_SEC = 20;
/** Care animation lengths (real seconds) and frame length. */
export const PET_ANIM_EAT_SEC = 4;
export const PET_ANIM_DRINK_SEC = 3.5;
export const PET_ANIM_POOP_SEC = 3.75;
export const PET_ANIM_PETTED_SEC = 2.5;
export const PET_ANIM_PLAY_SEC = 3.5;
export const PET_ANIM_FRAME_SEC = 0.25;
/** Floating hearts: count per positive action, life (s), rise (world px), spawn stagger (s). */
export const PET_HEART_COUNT = 3;
export const PET_HEART_LIFE_SEC = 1.4;
export const PET_HEART_RISE_PX = 14;
export const PET_HEART_STAGGER_SEC = 0.25;
/** Bowl refill / cleaning sparkle length (s). */
export const PET_SPARKLE_SEC = 0.9;
/** Request bubble bob amplitude (world px) and period (s). */
export const PET_REQUEST_BOB_PX = 1;
export const PET_REQUEST_BOB_PERIOD_SEC = 1.2;
/** Radial menu: ring radius and button size (CSS px). */
export const PET_MENU_RADIUS_PX = 58;
export const PET_MENU_BUTTON_PX = 40;
/** Radial menu icon scale (sprite px → CSS px). */
export const PET_MENU_ICON_SCALE = 3;
/** Meow synth: start / peak / end pitch (Hz), length (s), volume. */
export const MEOW_START_HZ = 560;
export const MEOW_PEAK_HZ = 900;
export const MEOW_END_HZ = 520;
export const MEOW_DURATION_SEC = 0.5;
export const MEOW_VOLUME = 0.08;

// ── Integration: spot reservations, contention, energy, activity social ──
/** A spot reserved less than this long ago (and not reached yet) can be contested. */
export const SPOT_CONTEST_WINDOW_SEC = 1.5;
/** Chance that two cats claiming one spot fight over it (else the second re-picks). */
export const SPOT_CONTEST_FIGHT_CHANCE = 0.35;
/** Cats farther apart than this (tiles) never fight over a spot: the second re-picks. */
export const SPOT_CONTEST_FIGHT_RADIUS_TILES = 8;
/** Re-picks an idle cat tries after losing a spot claim, before it pauses. */
export const SPOT_CLAIM_RETRIES = 3;
/** Pet energy: a pet under this walks to a bed, house or sofa to sleep. */
export const PET_TIRED_THRESHOLD = 35;
/** Energy a sleeping pet gains per real second (a nap of ~40 s fills it). */
export const PET_SLEEP_ENERGY_PER_SEC = 2.5;
/** Nap length for a tired pet (s): [min, max]; it wakes early when energy is full. */
export const PET_SLEEP_MIN_SEC = 20;
export const PET_SLEEP_MAX_SEC = 60;
/** Chance per decision that a content pet starts an idle activity (else it wanders). */
export const PET_ACTIVITY_CHANCE = 0.3;
/** Seconds a content pet spends on a toy, and the fun it gains. */
export const PET_TOY_MIN_SEC = 6;
export const PET_TOY_MAX_SEC = 14;
export const PET_TOY_FUN_GAIN = 25;
/** Cats in activities near each other: check interval (s) and chance per check. */
export const ACTIVITY_SOCIAL_CHECK_SEC = 2;
export const ACTIVITY_SOCIAL_CHANCE = 0.35;
/** Of those encounters in the playroom: the share that becomes joint play. */
export const ACTIVITY_JOINT_PLAY_CHANCE = 0.6;
/** Seconds added to an activity when its cat starts a talk there (it stays for the talk). */
export const ACTIVITY_TALK_EXTEND_SEC = 10;
/** Id base for the stand-in characters pet cats use in social scenes. */
export const PET_ACTOR_ID_BASE = 1_000_000;
/** Ears / tail of a cat asleep inside a cat house: outline and inner-ear colors. */
export const HOUSE_PEEK_OUTLINE_COLOR = '#2E1C20';
/** Eye shine of a cat looking out of a hooded litter box's dark doorway. */
export const HOUSE_PEEK_EYE_COLOR = '#f4f0a8';
export const HOUSE_PEEK_INNER_EAR_COLOR = '#E89AA8';
/** Social bubble height above a pet's feet (pets are shorter than agent cats). */
export const PET_SOCIAL_BUBBLE_OFFSET_PX = 20;
/** Head height of a pet above its feet, for its Zzz while it naps. */
export const PET_HEAD_ABOVE_ANCHOR_PX = 12;
/** Outline for the ears / tail of a near-black cat, so they read against a dark doorway. */
export const HOUSE_PEEK_RIM_COLOR = '#9A8AA0';

// ── Cat terminal ("take the wheel" PTY, ported from upstream PR #347) ──
/** Monospace stack: Claude Code is a full-screen TUI and needs aligned columns. */
export const TERMINAL_FONT_FAMILY =
  'ui-monospace, SFMono-Regular, Menlo, Consolas, "DejaVu Sans Mono", monospace';
export const TERMINAL_FONT_SIZE_PX = 13;
export const TERMINAL_SCROLLBACK_LINES = 5_000;
/** Debounce for propagating a resize to the PTY (fit on every frame thrashes it). */
export const TERMINAL_RESIZE_DEBOUNCE_MS = 100;
/** xterm theme, matched to the office palette (index.css :root). */
export const TERMINAL_THEME = {
  background: '#181828',
  foreground: 'rgba(255, 255, 255, 0.9)',
  cursor: '#6030ff',
  cursorAccent: '#181828',
  selectionBackground: 'rgba(96, 48, 255, 0.4)',
  black: '#1e1e2e',
  red: '#d14249',
  green: '#89d185',
  yellow: '#cca700',
  blue: '#3794ff',
  magenta: '#746fff',
  cyan: '#4ad9d9',
  white: 'rgba(255, 255, 255, 0.9)',
  brightBlack: '#4a4a6a',
  brightRed: '#ff6b72',
  brightGreen: '#a8e5a4',
  brightYellow: '#ffd700',
  brightBlue: '#66aaff',
  brightMagenta: '#a29bff',
  brightCyan: '#7fe8e8',
  brightWhite: '#ffffff',
} as const;

// ── Activity animations (engine/activityAnim.ts, activityFx.ts) ─────────
/** Colours of the small activity effects: steam, hearts, claw marks, dust, sparkles... */
export const ACTIVITY_FX_COLORS = {
  steam: '#f4f4f8',
  puff: '#e8eef6',
  heart: '#f0607c',
  heartDark: '#a83850',
  mark: '#fff6dc',
  fur: '#f2e6d0',
  sisal: '#d8b878',
  dust: '#d8c8a8',
  spark: '#fff4a0',
  sparkCore: '#ffffff',
  star: '#ffd84a',
  page: '#fbf8ee',
  line: '#5a4a58',
  water: '#bfe6ff',
  crumb: '#a8743c',
} as const;
/** The empty slot of a book taken from a shelf (the bookshelf art's darkest line). */
export const SHELF_BACK_COLOR = '#301c1c';

// ── Litter boxes and floor poop (all cats, see engine/litterLife.ts) ──
/** Relative weight of a litter box visit in an agent cat's idle pick (low: a rare need). */
export const LITTER_ACTIVITY_WEIGHT = 0.2;
/** Px a cat in an open box is drawn lower: the front wall hides its paws. */
export const LITTER_SPOT_OFFSET_Y = 3;
/** Chance of zoomies after a box visit, the dashes they last, and how far a dash runs (tiles). */
export const LITTER_ZOOMIES_CHANCE = 0.35;
export const ZOOMIES_DASHES_MIN = 2;
export const ZOOMIES_DASHES_MAX = 3;
export const ZOOMIES_MIN_TILES = 4;
export const ZOOMIES_MAX_TILES = 9;
/** Random dash targets tried until one is reachable (many lie behind a wall). */
export const ZOOMIES_PICKS = 12;
/** Walk speed and walk-frame rate multiplier while a cat has the zoomies. */
export const ZOOMIES_SPEED_MUL = 2.6;
/** A cat passing a floor poop may grimace: how long, how often per cat, how likely. */
export const POOP_GRIMACE_SEC = 1.3;
export const POOP_GRIMACE_COOLDOWN_SEC = 25;
export const POOP_GRIMACE_CHANCE = 0.6;
/** Flies circling an overflowing box or a floor poop. */
export const LITTER_FLY_COUNT = 3;
/** Seconds a just-changed box glints, and the clean-up effects last. */
export const LITTER_FRESH_GLINT_SEC = 6;
export const CARE_CLEANUP_FX_SEC = 1.2;
/** Effect colors of the litter animations (sand kick, grimace face, speed lines). */
export const LITTER_FX_COLORS = {
  sand: '#e8d9a8',
  sandDark: '#b59a63',
  face: '#9ccc5a',
  faceDark: '#3f3740',
  tongue: '#ff8fa8',
  speed: '#f4f4f8',
} as const;
