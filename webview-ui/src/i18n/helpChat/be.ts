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
  errReplaced: 'Іншае акно задало новае пытанне. Спытайце яшчэ раз.',
  errNoAnswer: 'Адказу няма.',
  errExited: 'Claude Code спыніўся з кодам {code}. Паспрабуйце яшчэ раз.',
  unavailableNotInstalled: 'Claude Code не ўсталяваны. Усталюйце яго і паспрабуйце яшчэ раз.',
  unavailableNotLoggedIn: 'У Claude Code няма ўваходу. Увайдзіце і паспрабуйце яшчэ раз.',
};
