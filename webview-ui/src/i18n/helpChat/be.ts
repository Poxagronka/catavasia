import type { Translation } from '../core.js';
import type { helpChat } from './en.js';

export const messages: Translation<typeof helpChat> = {
  title: 'Дапамога',
  placeholder: 'Спытайце што заўгодна пра Catavasia або папрасіце дапамагчы з промптам для кота.',
  close: 'Закрыць',
  send: 'Адправіць',
  stop: 'Спыніць',
  thinking: 'Думаю…',
  newChat: 'Новы чат',
  greetingOnboarding:
    'Прывітанне! Я ваш гід па Catavasia. Спытайце, як усё працуе, або папрасіце дапамагчы напісаць промпт для вашага кота.',
  greetingSettings:
    'Прывітанне! Я ваш гід па Catavasia. Спытайце што заўгодна пра праграму або папрасіце дапамагчы напісаць промпт для кота.',
};
