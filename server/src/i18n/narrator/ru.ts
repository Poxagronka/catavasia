import type { Translation } from '../core.js';
import type { narrator } from './en.js';

export const messages: Translation<typeof narrator> = {
  planning: 'замышляет охоту',
  exploring: 'обнюхивает всё вокруг',
  building: 'месит код',
  testing: 'гоняет баги лапой',
  reviewing: 'вылизывает код',
  delivering: 'несёт тебе мышку',
  skill: 'читает кошачье руководство',
  briefing: 'кошачье совещание',
  delegating: 'пасёт котов',
  teammate: 'обнюхивает коллегу',
  input: 'мяукает тебе',
  permission: 'скребётся в дверь',
  done: 'мурлычет, всё готово',
  error: 'шипит на баг',
};
