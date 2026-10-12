import type { Translation } from '../core.js';
import type { helpChat } from './en.js';

export const messages: Translation<typeof helpChat> = {
  title: 'مدد',
  placeholder: 'Catavasia کے بارے میں کچھ بھی پوچھیں، یا بلی کا پرامپٹ لکھنے میں مدد مانگیں۔',
  close: 'بند کریں',
  send: 'بھیجیں',
  stop: 'روکیں',
  thinking: 'سوچ رہا ہوں…',
  newChat: 'نئی چیٹ',
  greetingOnboarding:
    'السلام علیکم! میں آپ کا Catavasia گائیڈ ہوں۔ پوچھیں کہ سب کچھ کیسے کام کرتا ہے، یا اپنی بلی کا پرامپٹ لکھنے میں مجھ سے مدد لیں۔',
  greetingSettings:
    'السلام علیکم! میں آپ کا Catavasia گائیڈ ہوں۔ ایپ کے بارے میں کچھ بھی پوچھیں، یا بلی کا پرامپٹ لکھنے میں مجھ سے مدد لیں۔',
};
