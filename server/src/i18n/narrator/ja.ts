import type { Translation } from '../core.js';
import type { narrator } from './en.js';

export const messages: Translation<typeof narrator> = {
  planning: '狩りの作戦中',
  exploring: 'あちこちクンクン',
  building: 'コードをふみふみ',
  testing: 'バグに猫パンチ',
  reviewing: 'コードを毛づくろい',
  delivering: 'ネズミを届け中',
  skill: '猫のマニュアルを読書中',
  briefing: '猫の会議中',
  delegating: '猫たちをまとめ中',
  teammate: '仲間をクンクン',
  input: 'あなたにニャーと呼びかけ',
  permission: 'ドアをカリカリ',
  done: 'ゴロゴロ、全部完了',
  error: 'バグにシャーッ',
};
