import type { Translation } from '../core.js';
import type { consent } from './en.js';

export const messages: Translation<typeof consent> = {
  headline: '还有一件事：hooks！',
  what: '为了让你的智能体实时活起来，catavasia 会把 {count} 个 Claude Code 事件的 hooks 添加到 {file}。你现有的设置会保留，并会一次性备份为 {backup}。',
  data: 'Claude Code 会把这些事件（包括工具名称和工具输入）发送到本机上的 catavasia 服务器。所有数据都留在本地：服务器只监听 127.0.0.1，除非你主动用 --host 启动它并向你的网络开放。',
  reversible: '你可以随时在 Settings → Instant Detection (Hooks) 中移除 hooks。',
};
