import type { Translation } from '../core.js';
import type { consent } from './en.js';

export const messages: Translation<typeof consent> = {
  headline: 'एक बात और: hooks!',
  what: 'आपके एजेंट्स को रीयल टाइम में जीवंत करने के लिए, catavasia {count} Claude Code इवेंट्स के hooks को {file} में जोड़ता है। आपकी मौजूदा सेटिंग्स सुरक्षित रहती हैं, और एक बार का बैकअप {backup} के रूप में सहेजा जाता है।',
  data: 'Claude Code ये इवेंट्स, जिनमें टूल के नाम और टूल इनपुट भी शामिल हैं, इसी मशीन पर चल रहे catavasia सर्वर को भेजेगा। सब कुछ स्थानीय रहता है: सर्वर सिर्फ़ 127.0.0.1 पर सुनता है, जब तक आप उसे --host के साथ चालू करके अपने नेटवर्क पर खुला न कर दें।',
  reversible: 'आप hooks को कभी भी Settings → Instant Detection (Hooks) से हटा सकते हैं।',
};
