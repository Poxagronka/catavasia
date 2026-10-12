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
  errReplaced: '別のウィンドウが新しい質問をしました。もう一度質問してください。',
  errNoAnswer: '回答がありません。',
  errExited: 'Claude Code が終了コード {code} で停止しました。もう一度お試しください。',
  unavailableNotInstalled:
    'Claude Code がインストールされていません。インストールしてから、もう一度お試しください。',
  unavailableNotLoggedIn:
    'Claude Code にログインしていません。ログインしてから、もう一度お試しください。',
};
