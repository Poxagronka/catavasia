import type { Translation } from '../core.js';
import type { helpChat } from './en.js';

export const messages: Translation<typeof helpChat> = {
  title: 'ヘルプ',
  placeholder: 'Catavasia について何でも聞いてください。猫のプロンプト作りも手伝います。',
  close: '閉じる',
  send: '送信',
  stop: '停止',
  thinking: '考え中…',
  newChat: '新しいチャット',
  greetingOnboarding:
    'こんにちは！私は Catavasia のガイドです。使い方を聞いたり、猫のプロンプト作りを頼んだりしてください。',
  greetingSettings:
    'こんにちは！私は Catavasia のガイドです。アプリについて何でも聞いてください。猫のプロンプト作りも手伝います。',
};
