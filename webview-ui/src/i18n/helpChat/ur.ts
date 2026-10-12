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
  errReplaced: 'کسی دوسری ونڈو نے نیا سوال پوچھا۔ دوبارہ پوچھیں۔',
  errNoAnswer: 'کوئی جواب نہیں ملا۔',
  errExited: 'Claude Code ایگزٹ کوڈ {code} کے ساتھ رک گیا۔ دوبارہ کوشش کریں۔',
  unavailableNotInstalled: 'Claude Code انسٹال نہیں ہے۔ اسے انسٹال کریں، پھر دوبارہ کوشش کریں۔',
  unavailableNotLoggedIn: 'Claude Code میں لاگ اِن نہیں ہے۔ لاگ اِن کریں، پھر دوبارہ کوشش کریں۔',
};
