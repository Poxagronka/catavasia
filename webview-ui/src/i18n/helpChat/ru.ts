import type { Translation } from '../core.js';
import type { helpChat } from './en.js';

export const messages: Translation<typeof helpChat> = {
  title: 'Помощь',
  placeholder: 'Спросите что угодно о Catavasia или попросите помочь с промптом для кота.',
  close: 'Закрыть',
  send: 'Отправить',
  stop: 'Остановить',
  thinking: 'Думаю…',
  newChat: 'Новый чат',
  greetingOnboarding:
    'Привет! Я ваш гид по Catavasia. Спросите, как всё работает, или попросите помочь написать промпт для вашего кота.',
  greetingSettings:
    'Привет! Я ваш гид по Catavasia. Спросите что угодно о приложении или попросите помочь написать промпт для кота.',
};
