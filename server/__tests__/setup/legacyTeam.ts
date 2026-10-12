// Most office tests were written against the team older builds seeded on first run (boss + 3 workers).
// A fresh install now starts with no cats; these tests seed the legacy team. firstRunTeam.test.ts resets it.
import { legacyDefaultTeam, setFirstRunSeed } from '../../src/orchestrator/catProfiles.js';

setFirstRunSeed(legacyDefaultTeam);
