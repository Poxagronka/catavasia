import type { Translation } from '../core.js';
import type { consent } from './en.js';

export const messages: Translation<typeof consent> = {
  headline: 'І ще дещо: hooks!',
  what: 'Щоб оживити ваших агентів у реальному часі, catavasia додає hooks для {count} подій Claude Code до {file}. Ваші поточні налаштування зберігаються, а одноразова резервна копія записується як {backup}.',
  data: 'Claude Code надсилатиме ці події, зокрема назви та вхідні дані інструментів, на сервер catavasia на цьому комп’ютері. Усе лишається локально: сервер слухає лише 127.0.0.1, якщо ви самі не запустите його з --host і не відкриєте для своєї мережі.',
  reversible: 'Ви можете вимкнути hooks будь-коли в Settings → Instant Detection (Hooks).',
};
