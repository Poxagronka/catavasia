import type { Translation } from '../core.js';
import type { narrator } from './en.js';

export const messages: Translation<typeof narrator> = {
  planning: 'شکار کا منصوبہ بنا رہا ہے',
  exploring: 'ادھر اُدھر سونگھ رہا ہے',
  building: 'کوڈ گوندھ رہا ہے',
  testing: 'بگ پر پنجہ مار رہا ہے',
  reviewing: 'کوڈ سنوار رہا ہے',
  delivering: 'آپ کے لیے چوہا لا رہا ہے',
  skill: 'بلی کی کتاب پڑھ رہا ہے',
  briefing: 'بلیوں کی میٹنگ جاری ہے',
  delegating: 'بلیوں کو سنبھال رہا ہے',
  teammate: 'ساتھی کو سونگھ رہا ہے',
  input: 'آپ کے لیے میاؤں کر رہا ہے',
  permission: 'دروازہ کھرچ رہا ہے',
  done: 'خُرخُر، سب مکمل',
  error: 'بگ پر پھنکار رہا ہے',
};
