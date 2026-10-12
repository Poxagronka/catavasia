import type { Translation } from '../core.js';
import type { helpChat } from './en.js';

export const messages: Translation<typeof helpChat> = {
  title: 'مساعدة',
  placeholder: 'اسأل أي شيء عن Catavasia، أو اطلب المساعدة في كتابة موجّه للقطة.',
  close: 'إغلاق',
  send: 'إرسال',
  stop: 'إيقاف',
  thinking: 'جارٍ التفكير…',
  newChat: 'محادثة جديدة',
  greetingOnboarding:
    'مرحبًا! أنا دليلك في Catavasia. اسألني كيف يعمل كل شيء، أو اطلب مني مساعدتك في كتابة موجّه لقطتك.',
  greetingSettings:
    'مرحبًا! أنا دليلك في Catavasia. اسألني أي شيء عن التطبيق، أو اطلب مني مساعدتك في كتابة موجّه لقطة.',
};
