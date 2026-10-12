import type { Translation } from '../core.js';
import type { narrator } from './en.js';

export const messages: Translation<typeof narrator> = {
  planning: 'замишляє полювання',
  exploring: 'обнюхує все навколо',
  building: 'місить код',
  testing: 'лапою б’є баги',
  reviewing: 'вилизує код',
  delivering: 'несе тобі мишку',
  skill: 'читає котячий посібник',
  briefing: 'котяча нарада',
  delegating: 'пасе котів',
  teammate: 'обнюхує колегу',
  input: 'нявкає тобі',
  permission: 'дряпає двері',
  done: 'муркоче, все готово',
  error: 'шипить на баг',
};
