import type { Translation } from '../core.js';
import type { helpChat } from './en.js';

export const messages: Translation<typeof helpChat> = {
  title: '帮助',
  placeholder: '问我任何关于 Catavasia 的问题，或让我帮你写猫的提示词。',
  close: '关闭',
  send: '发送',
  stop: '停止',
  thinking: '思考中…',
  newChat: '新对话',
  greetingOnboarding:
    '你好！我是你的 Catavasia 向导。你可以问我它是怎么运作的，也可以让我帮你给猫写提示词。',
  greetingSettings:
    '你好！我是你的 Catavasia 向导。你可以问我关于应用的任何问题，也可以让我帮你给猫写提示词。',
};
