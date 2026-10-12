import type { Translation } from '../core.js';
import type { narrator } from './en.js';

export const messages: Translation<typeof narrator> = {
  planning: 'prépare la chasse',
  exploring: 'renifle partout',
  building: 'pétrit le code',
  testing: 'griffe les bugs',
  reviewing: 'toilette le code',
  delivering: "t'apporte une souris",
  skill: 'lit le manuel des chats',
  briefing: 'réunion de chats',
  delegating: 'rassemble les chats',
  teammate: 'flaire un coéquipier',
  input: 'miaule pour toi',
  permission: 'gratte à la porte',
  done: 'ronronne, tout est fini',
  error: 'crache sur un bug',
};
