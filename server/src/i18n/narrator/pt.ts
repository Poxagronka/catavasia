import type { Translation } from '../core.js';
import type { narrator } from './en.js';

export const messages: Translation<typeof narrator> = {
  planning: 'planejando a caça',
  exploring: 'farejando por aí',
  building: 'amassando o código',
  testing: 'caçando bugs na pata',
  reviewing: 'arrumando o código',
  delivering: 'trazendo um ratinho',
  skill: 'lendo o manual gatuno',
  briefing: 'reunião de gatos',
  delegating: 'pastoreando gatos',
  teammate: 'farejando um colega',
  input: 'miando para você',
  permission: 'arranhando a porta',
  done: 'ronronando, tudo pronto',
  error: 'bufando para um bug',
};
