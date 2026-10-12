import type { Translation } from '../core.js';
import type { pets } from './en.js';

export const messages: Translation<typeof pets> = {
  owner: '主人',
  ownerNone: '无',
  ownerHint: '宠物会更常待在主人身边：跟着主人、趴在主人的桌上、在附近打盹。',
};
