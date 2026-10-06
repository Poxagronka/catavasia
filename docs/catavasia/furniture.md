# Furniture: rotation, states and orientation-safe cat activities

**The rule (user, 2026-10-06):** every furniture item must rotate, carry its
states, and have cat animations that do not break with different object
positions. The guard test `webview-ui/test/furnitureRotation.test.ts`
enforces it for every catalog item, new ones included. To add an item end to
end, use the project skill `.claude/skills/add-furniture/SKILL.md`.

## 1. How R turns an item

Every catalog item is rotatable (`isRotatable` is true for any catalog type).
`buildDynamicCatalog()` (`webview-ui/src/office/layout/furnitureCatalog.ts`)
gives each item one of three schemes (`getRotationScheme`):

| Scheme      | When                                                 | What R does                                                                          |
| ----------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `views`     | the manifest is a `rotation` group                   | cycles the drawn views: front → right (`side`) → back → left (`side` + `mirrorSide`) |
| `mirror`    | default for every other item                         | toggles the front and a virtual `<ID>:left` that draws the front sprite flipped      |
| `symmetric` | `"rotationScheme": "symmetric"` on the manifest root | accepted, nothing changes, the banner says "Looks the same turned"                   |

- Pick `symmetric` only when the art looks the same flipped, or when it must
  not flip (lettering: `CEO_PLAQUE`, `CLOCK`, `WHITEBOARD`).
- `rotateFurniture()` (`editor/editorActions.ts`) checks `canPlaceFurniture`
  with the turned type. If the turned footprint overlaps something or leaves
  the room, the item stays and the banner says "No room to turn it here".
- A `views` group may have fewer views (`2-way`: front and side). The R order
  is front, right, back, left over the views that exist.

## 2. Identity: compare by kind, never by `type`

A placed `type` changes with R (`SOFA_FRONT`, `SOFA_SIDE:left`, `PET_BOWL`,
`LITTER_BOX_HOODED:left`). Engine code that asks "is this a litter box / a
bowl / the CEO chair" uses `furnitureKind(type)`: the manifest id, the same for
every view, state, frame and mirror. `itemsOfType(ctx, kinds)` in
`engine/activitySpots.ts` matches kinds or exact view types.

## 3. itemFrame: how a placed item is turned

`webview-ui/src/office/layout/itemFrame.ts`:

- `itemFrame(type)` → `{ kind, view, mirrored, w, h }`. `view` is where the
  item's front points (`front` = toward the viewer). `mirrored` is true for a
  `:left` type (drawn flipped).
- `sideDirection(frame, side)` maps an item-local side (`front`, `back`,
  `left`, `right`, as seen in the front view, `left` = the viewer's left) to a
  screen direction. A turned view rotates every side. A mirror image swaps
  left and right.
- `spriteX(frame, x)` maps a px column of the unflipped art to the screen.
- `artView(frame)` says which art the numbers of a view come from: `front`,
  `side` (right view; the left view mirrors it) or `back`.

## 4. Spot declarations (item-local, resolved through itemFrame)

Write every spot for the item's FRONT view. The builders turn it.

- **Beside the item** — `adjacentSpots(ctx, items, opts)`:
  `itemSides: ['left']` (sides the cat may use, item-local; they turn and
  mirror), `sides: 'horizontal'` (screen filter for side-view-only poses),
  `nudgePx` (pose moves toward the item). Each spot faces the item.
- **On the item** — `onItemSpots(items, pose)` with an `OnItemPose`:
  `{ front: { offsetX, offsetY }, side?, back?, facing? }`. Offsets are px
  from the centre of the bottom-left blocked tile, measured on the unflipped
  art of that view. A mirrored view flips `offsetX`. `facing` is item-local
  (default `front`).
- **Through the item** — `throughSpots` runs along the footprint's long axis
  (a tunnel taller than wide runs up and down; `runThrough.ts` moves in x or y).
- **Inside the item** — a `HousePeek` (house, hooded litter box) takes its x
  through `spriteX` and carries `mirrored`; the peek sprite flips with it.
- **Steps** — an `AnimStep.dir` is written for the front view. At a mirrored
  item the spot carries `mirrored: true`, and `stepDirection()` swaps LEFT and
  RIGHT (the litter dig turns with the box).
- **Overlays** drawn over the item (the litter box front wall) copy
  `itemFrame(type).mirrored` onto their `FurnitureInstance`.

Examples: teaser (`itemSides: ['left']`), cat tree / box / beds (`OnItemPose`),
houses and hooded litter (`HOUSE_PEEKS`, `HOOD_DOOR`), open litter (facing the
item's `right`), shelves (book column flips), coffee machines (working face by
view, `coffeeActivities.ts`).

## 5. Manifest fields

| Field                          | Where             | Meaning                                                             |
| ------------------------------ | ----------------- | ------------------------------------------------------------------- |
| `type: "asset"` / `"group"`    | root              | one sprite, or a group tree                                         |
| `groupType: "rotation"`        | root group        | drawn views; members carry `orientation`: `front` / `side` / `back` |
| `rotationScheme`               | root              | `2-way`, `3-way-mirror` for groups; `symmetric` for a no-op R       |
| `mirrorSide: true`             | the `side` member | the left view is the side sprite flipped                            |
| `groupType: "state"`           | a view            | `on` / `off` members (`state`); every view should carry both        |
| `groupType: "animation"`       | a view or a state | members with `frame` 0..n; frame 0 is the idle look                 |
| `footprintW/H`, `width/height` | each asset        | tiles blocked, sprite px; a sprite may be taller than its footprint |
| `backgroundTiles`              | root              | top footprint rows cats walk through and items may overlap          |
| `canPlaceOnSurfaces/Walls`     | root              | on a desk top / on the wall row                                     |

The asset loaders (`server/src/assetLoader.ts`, `core/src/assets/build.ts`)
pass `rotationScheme` through for single-asset manifests too.

## 6. Sprite rules

- **Tall sprites are bottom-anchored.** The sprite's bottom meets the
  footprint's bottom (`furnitureSpriteTop`). Draw a tall item (a coffee
  machine 16x32 on 1x1) with its base low in the canvas, so it stands on a
  table top and rises into the tiles behind.
- Every frame of an animation keeps the size of frame 0 (no jumping base).
- A side view of an item with a working face shows that face to the right;
  `mirrorSide` makes the left view.
- Lighting: the art is lit from the upper left. A mirror image moves the
  highlight; prefer drawn views for items where that reads wrong.

## 7. States and frames

- `getToggledType` pairs `on` / `off` per view. Give every view both states,
  else that view cannot switch on.
- `itemFrameSprite(type, frame)` (`engine/furnitureFrames.ts`) picks a frame of
  the view's animation group for an activity step (`item: n`). A mirrored item
  draws the frame flipped (the instance keeps `mirrored`).

## 8. Generators

Art is code: `scripts/generate-*-sprites.mjs` with art modules in
`scripts/<group>/` (toys, beds, coffee, executive, petCare). Each writes the
PNGs and `manifest.json` of its items. Pass `rotationScheme` and views through
the generator, never by hand-editing generated manifests. Cat poses for a new
activity go in `scripts/cats/*Poses.mjs` and are rendered by
`node scripts/generate-cat-sprites.mjs`. Upstream items without a generator
(`DESK`, `PLANT`, ...) keep hand-written manifests; new views of an upstream
item come from a script that reads its PNG (`generate-table-sprites.mjs`,
`generate-pc-sprites.mjs`).

## 9. Previews

- `npx tsx scripts/preview-furniture.ts <TYPE> [--out DIR]` — a GIF and a
  frame strip per view × cat activity, three coats side by side.
- `npx tsx scripts/preview-furniture.ts <DESK> --work [--chair ID]` — a cat typing
  at a desk or table in every view (the chair on the item's working side).
- `npx tsx scripts/preview-furniture.ts <TYPE> --states` — each view's off
  sprite and its on animation.
- `npx tsx scripts/preview-furniture.ts --sheet [--out DIR]` — every catalog
  item in every view on one sheet.

## 10. What the guard test checks

For every palette item × every view, alone in a fixture room:

1. it is rotatable; `symmetric` has one view, others two or more of one kind;
2. the sprite, the mirror flag, every animation frame and the on-state resolve;
3. every activity that has spots in the front view has spots in this view;
4. every spot is walkable floor (or on the item / a seat), within one tile of
   the footprint (two rows below a wall item), and a spot next to the item
   faces it; a pose on the item stays over its sprite; a tunnel exit too.

A specific test per item covers what the guard cannot see in numbers (which
side a wand bends to): `webview-ui/test/mirroredItems.test.ts`.
