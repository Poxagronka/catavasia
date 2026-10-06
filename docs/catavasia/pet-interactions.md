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

## After

Filled in by the implementing change (see the section below the decisions).
