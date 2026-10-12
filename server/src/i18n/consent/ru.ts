import type { Translation } from '../core.js';
import type { consent } from './en.js';

export const messages: Translation<typeof consent> = {
  headline: 'И ещё кое-что: hooks!',
  what: 'Чтобы оживить ваших агентов в реальном времени, catavasia добавляет hooks для {count} событий Claude Code в {file}. Ваши текущие настройки сохраняются, а одноразовая резервная копия записывается как {backup}.',
  data: 'Claude Code будет отправлять эти события, включая названия и входные данные инструментов, на сервер catavasia на этом компьютере. Всё остаётся локально: сервер слушает только 127.0.0.1, если вы сами не запустите его с --host и не откроете для своей сети.',
  reversible: 'Вы можете удалить hooks в любой момент в Settings → Instant Detection (Hooks).',
};
