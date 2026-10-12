import type { Translation } from '../core.js';
import type { narrator } from './en.js';

export const messages: Translation<typeof narrator> = {
  planning: 'плануе паляванне',
  exploring: 'абнюхвае ўсё вакол',
  building: 'месіць код',
  testing: 'лапай б’е багі',
  reviewing: 'вылізвае код',
  delivering: 'нясе табе мышку',
  skill: 'чытае каціную інструкцыю',
  briefing: 'кацінае паседжанне',
  delegating: 'пасе катоў',
  teammate: 'абнюхвае калегу',
  input: 'мяўкае табе',
  permission: 'драпае дзверы',
  done: 'мурлыча, усё гатова',
  error: 'шыпіць на баг',
};
