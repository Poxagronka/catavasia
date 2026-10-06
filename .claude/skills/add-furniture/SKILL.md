---
name: add-furniture
description: |
  Add a new furniture or decor item to the catavasia office end to end: art
  generator, every view (rotation) and state, manifest, cat/pet activities that
  work in every view, guard test, previews per view, quality score, gate, PR.
  EN: "add a new furniture item", "new decor item", "new cat toy", "new cat bed",
  "add <thing> to the office", "make <item> rotatable", "draw a side view for <item>".
  NOT FOR: changing an activity that uses no furniture (groom, yawn), cat breeds
  or coats (scripts/cats/breeds.mjs), the default layout alone (use a layout PR).
---

# add-furniture

The rule this skill serves (user, 2026-10-06): **every furniture item must
rotate, carry its states, and have cat animations that do not break with
different object positions.** Mechanism and reference: `docs/catavasia/furniture.md`
(read it whole before ART). Enforcement: `webview-ui/test/furnitureRotation.test.ts`.

Kind: **loop** skill under `.claude/skill-loop/PROTOCOL.md` (read it whole
before START): one state at a time, and the JUDGE → IMPROVE → LEDGER tail
before the PR state. Write `state.md` before the first SPEC command and
rewrite it at each transition: the judge counts one write per Evidence line.

## State machine

| #   | STATE    | Exit criterion (observable, with its evidence)                                                                                                                                                                                                                                 | On fail                                                                      |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| 0   | START    | `state.md` exists with the header line and Facts `transcript:` (PROTOCOL §2, §6); Facts `worktree:` holds a fresh worktree off `origin/main`                                                                                                                                   | stop and report the error                                                    |
| 1   | SPEC     | Facts hold: item id (UPPER_SNAKE), name, category, footprint W×H, `backgroundTiles`, surface/wall flags, scheme (`views` / `mirror` / `symmetric`) with a reason, states (on/off, frames), and the cat/pet activities at it, each quoted from the user or decided in Decisions | BLOCKED: ask for the missing field                                           |
| 2   | ART      | `node scripts/generate-<group>-sprites.mjs` prints the item; `ls webview-ui/public/assets/furniture/<ID>/` lists a PNG per view × state × frame of the spec                                                                                                                    | fix the generator; twice → BLOCKED                                           |
| 3   | MANIFEST | the manifest shows the rotation group / `rotationScheme`, state and animation groups of the spec; `npx tsx scripts/preview-furniture.ts --sheet` lists `<ID>: <views in R order>` as specified                                                                                 | fix the generator, not the JSON                                              |
| 4   | ACTIVITY | each activity of the spec is an `IdleActivityDef` whose spots are item-local declarations (§ Activity); new poses render (`node scripts/generate-cat-sprites.mjs` exit 0)                                                                                                      | rework; twice → BLOCKED                                                      |
| 5   | GUARD    | `cd webview-ui && npx vitest run test/furnitureRotation.test.ts` passes, and a specific test for the item passes (`npx vitest run test/<file>`)                                                                                                                                | fix the item, never the guard                                                |
| 6   | PREVIEW  | `npx tsx scripts/preview-furniture.ts <ID> --out <run dir>/preview` wrote a GIF + strip for every view × activity; the file list is in Evidence                                                                                                                                | fix and rerun                                                                |
| 7   | SCORE    | `<run dir>/SCORES.md` holds a score per view × activity, each ≥ 8/10, each with the strip file it was read from                                                                                                                                                                | rework (back to ART or ACTIVITY); a score still < 8 after 3 rounds → BLOCKED |
| 8   | LAYOUT   | skipped (Decisions say why), or a new `default-layout-<n+1>.json` places the item and `server/__tests__/layoutMigration.test.ts` covers the upgrade                                                                                                                            | fix; twice → BLOCKED                                                         |
| 9   | GATE     | each command of § Gate printed its pass line, quoted in Evidence                                                                                                                                                                                                               | fix, rerun the whole gate                                                    |
| 10  | REVIEW   | one medium code review by ONE subagent; each finding fixed (a commit) or declined with a reason in Done; GATE rerun after fixes                                                                                                                                                | fix, rerun                                                                   |
| 11  | JUDGE    | see PROTOCOL §4                                                                                                                                                                                                                                                                |                                                                              |
| 12  | IMPROVE  | see PROTOCOL §4                                                                                                                                                                                                                                                                |                                                                              |
| 13  | LEDGER   | see PROTOCOL §4                                                                                                                                                                                                                                                                |                                                                              |
| 14  | PR       | `gh pr create` printed the PR URL; the body holds the scores and the preview images; nothing merged                                                                                                                                                                            | fix the body, retry once                                                     |
| 15  | END      | the user has the outcome, and the state file says `state: END`                                                                                                                                                                                                                 |                                                                              |

## 1. SPEC — decide the scheme

- `views` when the item has a working face, text, or a shape that reads wrong
  mirrored: draw front, side (right) and back; `mirrorSide` gives the left.
  A long item (bench, table, tunnel) needs a side view with the turned
  footprint (W×H swapped).
- `mirror` (default, no field) when the flipped front is a believable other
  placement: a plant, a toy, a house with a door on one side.
- `symmetric` when it looks the same flipped, or must not flip (lettering).
- Every view carries every state: an item with `on` art has `on` in every view.
- An existing item that gains views needs in Facts only its id, the new scheme
  with a reason, and its states. It keeps its front id (saved layouts); a
  saved `<ID>:left` loads as the front (`layoutSerializer.ts`).

## 2. ART — the generator

- Art is code in `scripts/<group>/<item>Art.mjs`, written by
  `scripts/generate-<group>-sprites.mjs` (copy the closest generator:
  `toys/toyArt.mjs` for a plain item, `coffee/coffeeViews.mjs` for views and
  frames, `executive/` for state groups). Pass `rotationScheme` through.
- A sprite taller than its footprint is bottom-anchored (`furnitureSpriteTop`):
  draw the base low in the canvas, like the coffee machines (16x32 on 1x1, base
  6 px into the tile).
- Every frame of an animation keeps the frame-0 size. Light from the upper left.
- Palette colors live in the art module (the ESLint color rule covers
  `webview-ui/src`, not `scripts/`).

## 3. MANIFEST

- Fields: `docs/catavasia/furniture.md` §5. A `views` item is a `rotation`
  group with `rotationScheme` `2-way` (front + side) or `3-way-mirror`
  (front, side, back, mirrored left). A state lives in a `state` group per view.
- Check the R order on the sheet: `npx tsx scripts/preview-furniture.ts --sheet --out <run dir>`.

## 4. ACTIVITY — item-local spots

Write every spot for the FRONT view; the builders turn it (furniture.md §4).

- Beside: `adjacentSpots(ctx, items, { itemSides: ['front'], nudgePx })`;
  `sides: 'horizontal'` only for side-view-only poses.
- On: `onItemSpots(items, { front: { offsetX, offsetY }, side?, back?, facing? })`;
  give `side` / `back` numbers for each drawn view.
- Inside: a `HousePeek` with x through `spriteX(itemFrame(type), x)` and `mirrored`.
- Through: `throughSpots` (long axis).
- Match items by kind: `itemsOfType(ctx, ['<ID>'])`; compare by
  `furnitureKind(type)`, never by `type`.
- Poses: a new pose goes in `scripts/cats/<group>Poses.mjs`, steps in
  `engine/*Anims.ts`. A step `dir` is front-view relative (it flips at a
  mirrored item).
- Weight: 1 unless the user asked for more; pets use it only through
  `engine/petActivities.ts` id lists.

## 5. GUARD

- The guard needs no edit for a new item. A guard failure names the view,
  activity and spot: fix the declaration.
- Add one specific test for what numbers cannot show: the side the cat uses,
  the turned footprint, a mirrored peek (`webview-ui/test/mirroredItems.test.ts`
  is the pattern).

## 6. PREVIEW and 7. SCORE

- No idle activity (desk, table, PC): `--work` on the desk (seat CUSHIONED_CHAIR:
  EXECUTIVE_CHAIR and LEAD_CHAIR are reserved), `--states` for an on-state.
- Read every strip (Read the PNG). Score 0-10 per view × activity:
  silhouette reads as the item (2), the cat's pose meets the item (paws on it,
  sits in it, no float or overlap) (3), the pose faces the right way in this
  view (2), cute and alive (2), no artifact (stray pixel, wrong z) (1).
- Below 8: name the defect in Evidence, rework, re-record, then Read the new
  strip. A score stands only on a Read after its last re-record. Three rounds max.
- Put the final strips, `orientation-sheet.png` and SCORES.md in the PR body.

## 8. LAYOUT (optional)

Only when the user wants the item in the default office: a new
`webview-ui/public/assets/default-layout-<n+1>.json`, bump the revision
pattern of the newest layout PR, add the upgrade case to
`server/__tests__/layoutMigration.test.ts`. Untouched older revisions upgrade;
an edited office is kept.

## 9. Gate

Run from the worktree root, root `npm ci` only. If the base moved, merge it
first, and list each merge and push in Done:

```bash
npm run check-types && npm run lint && npm run format:check && npm run knip \
  && npm run build && npm test
```

Lint errors block (warnings that existed on main do not). Do not bump the
version unless the user asked for a release.

## 14. PR

- Conventional title: `feat(<group>): <item> that turns with R`.
- Push with an explicit refspec: `git push origin <branch>:<branch>`. Never
  push to upstream `pixel-agents-hq`, never force-push, never `--no-verify`,
  never `--amend`.
- Body: what the item is, its scheme and views, activities, SCORES.md table,
  the orientation sheet and one strip per view, gate results, known limits.
  Do not merge.

## Files

- `ledger.md` — run lines, newest first (PROTOCOL §4, §5).
- `docs/catavasia/furniture.md` — the mechanism this skill applies.
