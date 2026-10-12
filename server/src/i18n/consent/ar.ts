import type { Translation } from '../core.js';
import type { consent } from './en.js';

export const messages: Translation<typeof consent> = {
  headline: 'شيء أخير: الـ hooks!',
  what: 'لإحياء وكلائك في الوقت الفعلي، يضيف catavasia الـ hooks لـ {count} حدثًا من Claude Code إلى {file}. إعداداتك الحالية تبقى كما هي، وتُحفظ نسخة احتياطية واحدة باسم {backup}.',
  data: 'سيرسل Claude Code هذه الأحداث، ومنها أسماء الأدوات ومدخلاتها، إلى خادم catavasia على هذا الجهاز. كل شيء يبقى محليًا: الخادم يستمع فقط على 127.0.0.1، إلا إذا شغّلته أنت بالخيار --host ليكون متاحًا على شبكتك.',
  reversible: 'يمكنك إزالة الـ hooks في أي وقت من Settings → Instant Detection (Hooks).',
};
