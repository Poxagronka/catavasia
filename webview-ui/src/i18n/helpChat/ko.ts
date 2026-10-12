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
  errReplaced: '다른 창에서 새 질문을 했습니다. 다시 질문하세요.',
  errNoAnswer: '답변이 없습니다.',
  errExited: 'Claude Code가 종료 코드 {code}(으)로 중지되었습니다. 다시 시도하세요.',
  unavailableNotInstalled: 'Claude Code가 설치되어 있지 않습니다. 설치한 뒤 다시 시도하세요.',
  unavailableNotLoggedIn: 'Claude Code에 로그인되어 있지 않습니다. 로그인한 뒤 다시 시도하세요.',
};
