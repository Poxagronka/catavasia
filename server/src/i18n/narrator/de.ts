import type { Translation } from '../core.js';
import type { narrator } from './en.js';

export const messages: Translation<typeof narrator> = {
  planning: 'plant die Jagd',
  exploring: 'schnüffelt herum',
  building: 'knetet den Code',
  testing: 'patscht nach Bugs',
  reviewing: 'putzt den Code',
  delivering: 'bringt dir eine Maus',
  skill: 'liest das Katzenhandbuch',
  briefing: 'Katzenbesprechung',
  delegating: 'hütet Katzen',
  teammate: 'beschnuppert einen Kollegen',
  input: 'miaut nach dir',
  permission: 'kratzt an der Tür',
  done: 'schnurrt, alles fertig',
  error: 'faucht einen Bug an',
};
