import type { Translation } from '../core.js';
import type { helpChat } from './en.js';

export const messages: Translation<typeof helpChat> = {
  title: 'Допомога',
  placeholder: 'Запитайте що завгодно про Catavasia або попросіть допомогти з промптом для кота.',
  close: 'Закрити',
  send: 'Надіслати',
  stop: 'Зупинити',
  thinking: 'Думаю…',
  newChat: 'Новий чат',
  greetingOnboarding:
    'Привіт! Я ваш гід по Catavasia. Запитайте, як усе працює, або попросіть допомогти написати промпт для вашого кота.',
  greetingSettings:
    'Привіт! Я ваш гід по Catavasia. Запитайте що завгодно про застосунок або попросіть допомогти написати промпт для кота.',
};
