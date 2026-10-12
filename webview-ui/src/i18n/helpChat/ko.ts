import type { Translation } from '../core.js';
import type { helpChat } from './en.js';

export const messages: Translation<typeof helpChat> = {
  title: '도움말',
  placeholder: 'Catavasia에 대해 무엇이든 물어보거나 고양이 프롬프트 작성을 도와달라고 하세요.',
  close: '닫기',
  send: '보내기',
  stop: '중지',
  thinking: '생각 중…',
  newChat: '새 채팅',
  greetingOnboarding:
    '안녕하세요! 저는 Catavasia 안내자예요. 모든 것이 어떻게 작동하는지 물어보거나, 고양이 프롬프트 작성을 도와달라고 하세요.',
  greetingSettings:
    '안녕하세요! 저는 Catavasia 안내자예요. 앱에 대해 무엇이든 물어보거나, 고양이 프롬프트 작성을 도와달라고 하세요.',
};
