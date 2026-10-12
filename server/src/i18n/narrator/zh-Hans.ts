import type { Translation } from '../core.js';
import type { narrator } from './en.js';

export const messages: Translation<typeof narrator> = {
  planning: '策划狩猎',
  exploring: '四处嗅探',
  building: '揉捏代码',
  testing: '扑打 bug',
  reviewing: '给代码梳毛',
  delivering: '给你叼只老鼠',
  skill: '在读猫咪手册',
  briefing: '开猫咪会议',
  delegating: '赶猫入群',
  teammate: '用鼻子碰队友',
  input: '喵喵找你',
  permission: '用爪子挠门',
  done: '呼噜呼噜，完成了',
  error: '对 bug 哈气',
};
