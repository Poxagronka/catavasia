import type { Translation } from '../core.js';
import type { narrator } from './en.js';

export const messages: Translation<typeof narrator> = {
  planning: 'يخطط للصيد',
  exploring: 'يتشمّم في الأرجاء',
  building: 'يعجن الكود',
  testing: 'يضرب الأخطاء بمخلبه',
  reviewing: 'ينظّف الكود',
  delivering: 'يجلب لك فأرًا',
  skill: 'يقرأ كتاب القطط',
  briefing: 'اجتماع القطط',
  delegating: 'يجمع القطط',
  teammate: 'يتشمّم زميلًا',
  input: 'يموء من أجلك',
  permission: 'يخدش الباب',
  done: 'يخرخر، انتهى كل شيء',
  error: 'يفحّ في وجه خطأ',
};
