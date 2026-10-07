# Office UI, Layout Editor and Assets

## Office UI

**Rendering**: Game state in imperative `OfficeState` class (not React state). Pixel-perfect: zoom = integer device-pixels-per-sprite-pixel (1x–10x). No `ctx.scale(dpr)`. Default zoom = `Math.round(2 * devicePixelRatio)`. Z-sort all entities by Y. Pan via middle-mouse drag (`panRef`). **Camera follow**: `cameraFollowId` (separate from `selectedAgentId`) smoothly centers camera on the followed agent; set on agent click, cleared on deselection or manual pan.

**UI styling**: Pixel art aesthetic — sharp corners (`borderRadius: 0`), solid backgrounds (`#1e1e2e`), `2px solid` borders, hard offset shadows (`2px 2px 0px #0a0a14`, no blur). CSS variables in `index.css` `:root` (`--pixel-bg`, `--pixel-border`, `--pixel-accent`, ...). Pixel font: FS Pixel Sans (`webview-ui/src/fonts/`), loaded via `@font-face`, applied globally.

Custom ESLint rules (`eslint-rules/pixel-agents-rules.mjs`) enforce: `no-inline-colors` (hex/rgb/rgba/hsl/hsla literals only in `constants.ts`), `pixel-shadow` (must use `var(--pixel-shadow)` or `2px 2px 0px`), `pixel-font` (must reference FS Pixel Sans). All `error`-level — they block PRs.

**Characters**: FSM states — active (pathfind to seat, typing/reading animation by tool type), idle (wander randomly with BFS, return to seat after `wanderLimit` moves). 4-directional sprites, left = flipped right. Tool animations: typing (Write/Edit/Bash/Task) vs reading (Read/Grep/Glob/WebFetch). Sitting offset: characters shift down 6 px in TYPE state. Z-sort uses `ch.y + TILE_SIZE/2 + 0.5` so characters render in front of same-row furniture but behind lower-row furniture. **Chair z-sorting**: non-back chairs use `zY = (row+1)*TILE_SIZE` (capped to first row); back-facing chairs use `zY = (row+1)*TILE_SIZE + 1` so the chair back renders in front of the character. Chair tiles are blocked for all characters except their own assigned seat (per-character pathfinding via `withOwnSeatUnblocked`).

**Diverse palette assignment**: `pickDiversePalette()` counts palettes of current non-sub-agent characters; picks randomly from least-used palette(s). First 13 agents each get a unique cat; beyond 13, skins repeat with a random hue shift (45–315°) via `adjustSprite()`. Character stores `palette` (0-12) + `hueShift` (degrees). Sprite cache keyed by `"palette:hueShift"`.

**Spawn/despawn effect**: Matrix-style digital rain animation (0.3 s). 16 vertical columns sweep top-to-bottom with staggered timing. Spawn: green rain reveals character pixels. Despawn: character pixels consumed by green rain trails. `matrixEffect` field on Character (`'spawn'`/`'despawn'`/`null`). Normal FSM is paused during effect. Restored agents (`existingAgents`) use `skipSpawnEffect: true` to appear instantly.

**Sub-agents**: Negative IDs (from -1 down). Created on `agentToolStart` with "Subtask:" prefix, or lazily by `subagentToolStart` when missing (watched background spawns, post-reload recreation). Same palette + hueShift as parent. Click focuses parent terminal. Not persisted. Spawn at the closest free walkable tile to the parent (`closestFreeWalkableTile`) — around it, never in a seat. Idle (stop typing) when every tracked sub-tool row is done; overlay shows the latest non-done sub-tool status, falling back to the Subtask label.

**Speech bubbles**: Permission ("..." amber dots) stays until clicked/cleared. Waiting (green checkmark) auto-fades 2 s. Sprites in `spriteData.ts`.

**Cat social scenes** (`engine/catSocial.ts`, API documented at the top): idle cats near each other talk in pictogram bubbles, play chase, or (about 1 in 15) square off for a fight. `CatSocial.update` runs after the FSM in `OfficeState.update`. A cat whose agent gets work leaves the scene at once. Social bubbles yield to permission / waiting bubbles. Tunables are the `SOCIAL_*` constants. Art (talk frames per breed + shared overlays) is generated into `sprites/cat-social.json` by `scripts/cats/social.mjs`: edit the generator, not the JSON.

**Fight standoff** (`engine/socialScenes.ts`): a fight scene first walks both cats head to tail on adjacent rows (`standoffTiles`; same-row face-to-face when no pair of tiles is free). They puff up side-on (`socStandoffIn1..3`), sway in anti-phase (`socStandoffSwayA/B`) for `SOCIAL_STANDOFF_MIN_SEC..MAX_SEC`, then roll `SOCIAL_STANDOFF_FIGHT_CHANCE` × the pair's `fight` multiplier. A fight deflates into the dust cloud. Otherwise the less scrappy cat (or the lost spot contest's loser, `SocialContext.loser`) backs down and walks off. The scene kind stays `fight`, so contest prizes and the pair avoidance work as before.

**Sound notifications**: Ascending two-note chime (E5 → E6) via Web Audio API plays when waiting bubble appears (`agentStatus: 'waiting'`). `notificationSound.ts` manages AudioContext lifecycle; `unlockAudio()` on canvas mousedown resumes the context (webviews start suspended). Toggled via Settings modal. Persisted per-namespace in `~/.pixel-agents/config.json`.

**Cat life (spot reservations)**: `engine/catLife.ts` ties idle activities, pet care, social scenes and seat assignment to ONE reservation service (`engine/spotReservations.ts`, glue in `spotClaims.ts`). Tripwires: a cat reserves at walk START, never at arrival; release happens only in the per-frame `reconcile` (do not release by hand). Two cats claiming one fresh spot roll a fight (`SPOT_CONTEST_*`). Pets join scenes via stand-in actors (`petActors.ts`). Decisions: docs/catavasia/ROADMAP.md, "Integration decisions".

**Pet care (tamagotchi)**: pets whose manifest says `"species": "cat"` (Gitcat today) get six needs (hunger, thirst, affection, fun, hygiene, energy; 100 = content) that decay in office time. `office/petCare/` holds it: `petNeeds.ts` (decay, mood, requests, offline catch-up), `petCareWorld.ts` (pure data + snapshot), `petCareSystem.ts` (runtime: seek bowl/litter, care poses, meows, radial-menu actions; documents the activity-provider seam for idle/social systems at its top), `petCareRender.ts` (fill-state furniture swap + overlays). Furniture `PET_BOWL` and the litter boxes (`LITTER_BOX` + `LITTER_BOX_<variant>`, walkable via `backgroundTiles`); a bowl click refills it, a box or floor-poop click opens `components/CareRadialMenu.tsx`. **Litter boxes** (all cats, agent cats via `engine/litterLife.ts`): fill stages, refusal at flies, zoomies, poop-avoiding paths; tripwire: the pile lands only when the cat starts covering (outro), and `setAvoidTiles` is global per frame. Decisions: docs/catavasia/ROADMAP.md, "Litter boxes". Clicking a cat opens `components/PetRadialMenu.tsx`. Care poses are derived from each cat's own sheet (`sprites/petCareFrames.ts`); the rest of the art comes from `node scripts/generate-pet-care-sprites.mjs` (edit `scripts/petCare/art.mjs`). Persisted via `savePetCare` / `petCareLoaded` to `~/.pixel-agents/pets-state.json`; closed-office time decays at 10 %, capped at 2 h. Debug: `?petSpeed=600` speeds needs up.

**Self-update (standalone)**: `server/src/update/` checks `Poxagronka/catavasia` main (raw `package.json`, at start + every 6 h, Settings toggle `autoUpdateCheck`), and on the user's approval clones, builds, packs and `npm install -g`s it, then restarts on the same port. Token-gated routes `/api/update*`; webview `webview-ui/src/update/`. Tripwires: the token passes to the new process ONLY in the `CATAVASIA_RESTART_TOKEN` env (never argv, child stdout discarded because it prints the tokened URL); the only repo URL is `UPDATE_REPO`. Decisions: docs/catavasia/ROADMAP.md, "Self-update".

**Seats**: Derived from chair furniture. `layoutToSeats()` creates a seat at every footprint tile of every chair. Multi-tile chairs produce multiple seats keyed `uid` / `uid:1` / `uid:2`. Facing direction priority: 1) chair `orientation` from catalog (front→DOWN, back→UP, left→LEFT, right→RIGHT), 2) adjacent desk direction, 3) forward (DOWN). Click character → select (white outline) → click available seat → reassign.

## Layout Editor

Toggle via "Layout" button. Tools: SELECT (default), Floor paint, Wall paint, Erase (set tiles to VOID), Furniture place, Furniture pick (eyedropper for furniture type), Eyedropper (floor).

**Floor**: 7 patterns from `floors.png` (grayscale 16×16), colorizable via HSBC sliders (Photoshop Colorize). Color baked per-tile on paint. Eyedropper picks pattern+color.

**Walls**: Separate Wall paint tool. Click/drag to add walls; click/drag existing walls to remove (toggle direction set by first tile of drag, tracked by `wallDragAdding`). HSBC color sliders (Colorize mode) apply to all wall tiles at once. Eyedropper on a wall tile picks its color and switches to Wall tool. Furniture cannot be placed on wall tiles, but background rows may overlap walls.

**Furniture**: Ghost preview (green/red validity). R key rotates, T key toggles on/off state. Drag-to-move in SELECT. Delete button (red X) + rotate button (blue arrow) on selected items. Any selected furniture shows HSBC color sliders (Color toggle + Clear button); color stored per-item in `PlacedFurniture.color?`. Single undo entry per color-editing session (tracked by `colorEditUidRef`). Pick tool copies type+color from placed item. Surface items preferred when clicking stacked furniture.

**Undo/Redo**: 50-level, Ctrl+Z/Y. EditActionBar (top-center when dirty): Undo, Redo, Save, Reset.

**Multi-stage Esc**: exit furniture pick → deselect catalog → close tool tab → deselect furniture → close editor.

**Erase tool**: Sets tiles to `TileType.VOID` (transparent, non-walkable, no furniture). Right-click in floor/wall/erase tools also erases to VOID (drag-erasing supported). Context menu suppressed in edit mode.

**Grid expansion**: In floor/wall/erase tools, a ghost border (dashed outline) appears 1 tile outside the grid. Clicking a ghost tile calls `expandLayout()` to grow the grid by 1 tile in that direction. New tiles are VOID. Furniture positions and character positions shift when expanding left/up. Max: `MAX_COLS`×`MAX_ROWS` (64×64). Default: `DEFAULT_COLS`×`DEFAULT_ROWS` (20×11). Characters outside bounds after resize relocated to random walkable tiles.

**Default layout upgrades**: the newest `assets/default-layout-N.json` is the default. A saved `layout.json` that equals an older bundled default (fingerprint ignores key order, `layoutRevision`, empty optional fields) is upgraded at load; an edited one is kept, and the editor's "Default" button and Settings "Reset layout to default" (both `resetLayoutToDefault`, shared `DefaultLayoutReset` confirm) replace it on request. Settings "Reset everything" (`resetAllToDefault`, server/src/resetAll.ts) also resets cats, prompts and pet care after a backup to `~/.pixel-agents/backups/` (docs/catavasia/ROADMAP.md). Keep older default files: they are the fingerprints.

**Cat CEO office**: the `EXECUTIVE_CHAIR` seat is the Cat CEO's desk and is reserved (`OfficeState.ceoChairSeat` / `reservedFor`: every seat picker skips it for other cats). No executive chair: the old "head" Area rule. Art: `node scripts/generate-executive-sprites.mjs`. Decisions: docs/catavasia/ROADMAP.md, "Cat CEO office".

**Layout model**: `{ version: 1, cols, rows, tiles: TileType[], furniture: PlacedFurniture[], tileColors?: ColorValue[] }`. Grid dimensions are dynamic. Persisted via debounced saveLayout message → `writeLayoutToFile()` → `~/.pixel-agents/layout.json`.

## Asset System

**Loading**: `esbuild.js` copies `webview-ui/public/assets/` → `dist/assets/`. Loader checks bundled path first, falls back to workspace root. PNG → pngjs → SpriteData (2D hex array, alpha≥2 = visible, `#RRGGBBAA` for semi-transparent). `loadDefaultLayout()` reads `assets/default-layout.json` as fallback for new workspaces.

**Catalog**: `furniture-catalog.json` with `id, name, label, category, footprint, isDesk, canPlaceOnWalls, groupId?, orientation?, state?, canPlaceOnSurfaces?, backgroundTiles?`. String-based type system. Categories: desks, chairs, storage, electronics, decor, wall, misc. Wall-placeable items use the `wall` category and appear in a dedicated "Wall" tab. Asset naming convention: `{BASE}[_{ORIENTATION}][_{STATE}]` (e.g., `MONITOR_FRONT_OFF`).

**Per-furniture manifests**: Each furniture item lives in its own folder under `assets/furniture/` with a `manifest.json` that declares its sprites, rotation groups, state groups (on/off), and animation frames. Floor tiles are individual PNGs in `assets/floors/`; wall tile sets in `assets/walls/`.

**Furniture rule (user, 2026-10-06)**: every furniture item must rotate, carry its states, and have orientation-safe cat activities. The guard test `webview-ui/test/furnitureRotation.test.ts` enforces it for every catalog item; add an item with the project skill `.claude/skills/add-furniture/SKILL.md`. Tripwires: engine code compares furniture by `furnitureKind(type)`, never by `type` (R changes it: `<ID>:left`, `_SIDE`, `_BACK`); spots are declared in the item's front view and resolved through `itemFrame` (`layout/itemFrame.ts`). Schemes (drawn `views`, default `mirror`, `symmetric`), manifest fields, spot declarations and previews: `docs/catavasia/furniture.md`.

**State groups**: Items with `state: "on"` / `"off"` sharing the same `groupId` + `orientation` form toggle pairs. `stateGroups` Map enables `getToggledType()` lookup. Editor palette hides on-state variants. State groups are mirrored across orientations.

**Auto-state**: `officeState.rebuildFurnitureInstances()` swaps electronics to ON sprites when an active agent faces a desk with that item nearby (3 tiles deep in facing direction, 1 tile to each side). Operates at render time without modifying the saved layout.

**Tall sprites**: a sprite's bottom meets its footprint's bottom (`furnitureSpriteTop`), so a sprite taller than its footprint rises into the tiles behind. The coffee items use this: 16x32 on a 1x1 footprint, base 6 px into the tile like the PC, so they stand on a table top.

**Background tiles**: `backgroundTiles?: number` — top N footprint rows allow other furniture to be placed on them AND characters to walk through. Z-sort places bg-row items behind the host furniture.

**Surface placement**: `canPlaceOnSurfaces?: boolean` — items like laptops, monitors, mugs can overlap with all tiles of `isDesk` furniture. `canPlaceFurniture()` builds a desk-tile set and excludes it from collision checks. Z-sort: surface items get `zY = max(spriteBottom, deskZY + 0.5)`.

**Wall placement**: `canPlaceOnWalls?: boolean` — items like paintings, windows, clocks can only be placed on wall tiles. `canPlaceFurniture()` requires the bottom row of the footprint to be on wall tiles; upper rows may extend above the map. `getWallPlacementRow()` offsets placement so the bottom row aligns with the hovered tile.

**Colorize module**: `colorize.ts` with two modes selected by `ColorValue.colorize?` flag. **Colorize mode** (Photoshop-style): grayscale → luminance → contrast → brightness → fixed HSL; always used for floor tiles. **Adjust mode** (default for furniture and character hue shifts): shifts original pixel HSL. `adjustSprite()` exported for character hue shifts. Cache keyed by arbitrary string (includes colorize flag).

**Floor tiles**: `floors.png` (112×16, 7 patterns). Cached by (pattern, h, s, b, c).

**Wall tiles**: `walls.png` (64×128, 4×4 grid of 16×32 pieces). 4-bit auto-tile bitmask (N=1, E=2, S=4, W=8). Sprites extend 16 px above tile (3D face). `wallTiles.ts` computes bitmask at render time. Colorizable via HSBC sliders. Wall sprites z-sorted with furniture/characters (`getWallInstances()` builds `FurnitureInstance[]`).

**Character sprites**: 13 pre-colored cat PNGs (`assets/characters/char_0.png`–`char_12.png`), one per palette, generated by `node scripts/generate-cat-sprites.mjs` (edit `scripts/cats/`, not the PNGs). 3 direction rows × 32 px tall, frames 16 px wide. Row 0 = down, Row 1 = up, Row 2 = right. Frames 0-6: walk1, walk2, walk3, type1, type2, read1, read2 (the original 112×96 sheet). Frames 7+: activity poses in `POSES` order (`scripts/cats/poses.mjs`; one module per group: idle, toys, rest, work, social). Code names a pose, never an index: `pose('napOut')` / `st(name, sec)` in `engine/activityAnim.ts` (a typo throws at load). Append new poses; custom coats render them at runtime (`cats/catArt.ts`). The decoder reads any width ≥ 7 frames; a 7-frame sheet (external assets) falls back to the standing frame for activities.

**Idle activities** (`webview-ui/src/office/engine/idleActivities.ts`): a cat that is not working (idle, waiting for input, finished task) picks a weighted-random activity — wander/sit, coffee at a `COFFEE` mug, nap on a sofa seat (floor near a sofa when all are taken) — never the same twice in a row, never a spot another cat holds. New activities plug in as one `IDLE_ACTIVITIES` entry with spot builders by furniture type (`activitySpots.ts`); the cat toys (`toyActivities.ts`, category `toys`, art from `node scripts/generate-toy-sprites.mjs`) are such entries. Each activity plays intro / loop / outro steps with per-step holds, offsets, toy nudges, furniture frames and effects (`activityAnim.ts`, `activityFx.ts`); the loop ends only on its last step. Work interrupts at once (`setAgentActive(true)` clears the activity), except a `work` activity (skill reading, `skillReading.ts`) that plays to its end. Coffee is a chain brew → sip → return (`coffeeActivities.ts`). Decisions: docs/catavasia/ROADMAP.md, "Cute animations". Activity state is webview-local, like wandering. Left = flipped right at runtime. When `hueShift !== 0`, `hueShiftSprites()` applies `adjustSprite()` to all frames before caching.

**Cat personalities** (`engine/personality.ts`): an agent cat, the Cat CEO or a pet may carry one of six presets (`CatPersonality` in `core/asyncapi.yaml`, ids in `core/src/catPersonality.ts`). A preset multiplies idle tuning knobs (`CAT_PERSONALITY_TUNING` in `constants.ts`): activity weights, social and spot-fight chances, litter timing, pet bowel fill. A pair of cats takes the stronger trait (`pairMul`). No preset = every knob is 1. Agent cats persist it in `cats.json`, the CEO in its `catCeo` block, pets in `layout.pets` (never inside `appearance`: that is a sprite cache key).

**Load order**: `characterSpritesLoaded` → `floorTilesLoaded` → `wallTilesLoaded` → `furnitureAssetsLoaded` → `layoutLoaded`.

## Asset Pipeline (legacy tileset import)

7-stage pipeline in `scripts/` for importing third-party tilesets (the bundled assets don't need this):

1. `0-import-tileset.ts` — Interactive CLI wrapper
2. `1-detect-assets.ts` — Flood-fill asset detection
3. `2-asset-editor.html` — Browser UI for position/bounds editing
4. `3-vision-inspect.ts` — Claude vision auto-metadata
5. `4-review-metadata.html` — Browser UI for metadata review
6. `5-export-assets.ts` — Export PNGs + `furniture-catalog.json`
7. `asset-manager.html` — Unified editor (stages 2+4 combined), Save/Save As via File System Access API

Supporting: `wall-tile-editor.html` (wall sprite editing), `jsonl-viewer.html` (transcript inspector).
