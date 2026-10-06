# Pet interactions: every object a cat uses, for pets too

**The rule (user, 2026-10-06):** pets (the pet cats) have custom animations
for every object, toy and bed the agent cats use, in every orientation.

## Audit (before, main at 1.4.1-cats.43)

Agent cats: idle activities in `engine/idleActivities.ts` (toys, beds, litter,
coffee). Pets: `engine/petActivities.ts` claims plus the care loop in
`petCare/petCareSystem.ts`. Pet poses: `sprites/petCareFrames.ts` (derived
from the pet's own sheet, no extra art).

| Object kinds                         | Agent activity      | Agent animation                          | Pet before                                  |
| ------------------------------------ | ------------------- | ---------------------------------------- | ------------------------------------------- |
| `SCRATCHING_POST`                    | `scratch`           | rear up, claws, fur, claw marks          | generic hop (`play`)                        |
| `YARN_BALL`                          | `yarn`              | stalk, wiggle, bat, the ball rolls       | generic hop, ball sways freely              |
| `TOY_MOUSE`                          | `mouse`             | stalk, wiggle, leap, pin, sparkle        | generic hop, mouse darts freely             |
| `FEATHER_TEASER`                     | `teaser`            | watch up, rear, swat, hop                | generic hop, wand sways freely              |
| `CARDBOARD_BOX`                      | `box`               | hop in, sink, peek, look left/right      | not supported                               |
| `CAT_TREE`                           | `catTree`           | climb, loaf on top, look, drop down      | not supported                               |
| `PLAY_TUNNEL`                        | `tunnel`            | wiggle, run through hidden, pop out      | not supported                               |
| `CAT_BED`                            | `catBed`            | curled nap, Zzz                          | front loaf (`sleep`)                        |
| `BED_CUSHION/BASKET/HAMMOCK/DONUT`   | `bed`               | curled nap, Zzz                          | front loaf (`sleep`)                        |
| `HOUSE_CARDBOARD/IGLOO/WOODEN/CONDO` | `house`             | inside, ears or tail peek                | inside, ears or tail peek (same)            |
| `SOFA` (all views)                   | `sleep`             | nap on a seat, floor fallback            | front loaf on a seat / floor                |
| `PET_BOWL`                           | none                | none                                     | eat, drink (care loop)                      |
| `LITTER_BOX*` (5 kinds)              | `litter*`           | dig, squat, cover, peek, refuse, zoomies | dig, squat, cover, zoomies (care)           |
| `COFFEE`, coffee machines            | `coffee`, `brew`... | brew, sip, carry                         | refused by design (pets never drink coffee) |
| `BOOKSHELF`, `DOUBLE_BOOKSHELF`      | `skillRead` (work)  | pull a book and read                     | n/a (work only, never idle)                 |
| desks, chairs, PC, laptop            | typing (work)       | type at the seat                         | n/a (agents' work)                          |

Joint play (`engine/activitySocial.ts`): pets joined talks and turns at
yarn, mouse and teaser, but each pet turn was the generic hop. Box, cat
tree and tunnel were not pet claims, so pets never met agents there.

Orientation: pet claims already use the agent spot sets, which `itemFrame`
turns. The guard test did not check pet ids or pet poses.

## After (feat/pet-interactions)

| Object kinds               | Pet activity   | Pet animation (steps in `engine/petPlayAnims.ts`)                  |
| -------------------------- | -------------- | ------------------------------------------------------------------ |
| `SCRATCHING_POST`          | `scratch`      | rear up on the post, paws rake (claw marks), fur flies, reach      |
| `YARN_BALL`                | `yarn`         | crouch, wiggle, wind up, bat: the ball rolls out and back, sparkle |
| `TOY_MOUSE`                | `mouse`        | stalk, wiggle, pounce, pin (dust), proud sparkle; the mouse moves  |
| `FEATHER_TEASER`           | `teaser`       | rear up, reach and bat at the feather, hops                        |
| `CARDBOARD_BOX`            | `box`          | hop in, only the head above the rim, look left/right, hop out      |
| `CAT_TREE`                 | `catTree`      | climb the post (back view), loaf on top, look around, drop (dust)  |
| `PLAY_TUNNEL` (both views) | `tunnel`       | wiggle, run through six passes hidden (fabric rustles), sparkle    |
| `CAT_BED`, `BED_*`         | `catBed`/`bed` | curled on the side, breathing, Zzz                                 |
| `HOUSE_*`                  | `house`        | inside, ears or tail peek (unchanged)                              |
| `SOFA` (all views)         | `sleep`        | front loaf on a seat or the floor (unchanged)                      |
| `PET_BOWL`, `LITTER_BOX*`  | care loop      | eat, drink, dig, squat, cover, zoomies (unchanged)                 |
| coffee, bookshelf, desks   | none           | by design (see the audit)                                          |

Joint play: a pet's turn at yarn, mouse or teaser plays the toy's own pose
and moves the toy. Box, cat tree and tunnel claims put pets in the
playroom group, so they talk to and chase agent cats there too.

New derived poses (`sprites/petPlayFrames.ts`, from the pet's own sheet):
`crouch`, `wiggle`, `pounce`, `bat`, `windup`, `rear`, `scratchA/B`,
`reach`, `pin`, `curlA/B`, `boxLow`, `boxPeek`, `boxLookL/R`, `climbA/B`,
`perch`, `perchL/R` (plus `stand`). Each has a side view; most have a front
and a back view.

Orientation: the guard test claims every pet activity at every catalog
item in every view and draws each step. Preview: `npx tsx scripts/preview-pets.ts`.
Decisions: `ROADMAP.md`, "Pet interactions".
