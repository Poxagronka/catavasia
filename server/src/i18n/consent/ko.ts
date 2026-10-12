import type { Translation } from '../core.js';
import type { consent } from './en.js';

export const messages: Translation<typeof consent> = {
  headline: '하나 더요: hooks!',
  what: '에이전트를 실시간으로 움직이게 하려고 catavasia가 Claude Code 이벤트 {count}개용 hooks를 {file}에 추가합니다. 기존 설정은 그대로 유지되고, 한 번만 {backup} 이름으로 백업이 저장됩니다.',
  data: 'Claude Code는 도구 이름과 도구 입력을 포함한 이 이벤트들을 이 컴퓨터의 catavasia 서버로 보냅니다. 모든 것이 로컬에 머뭅니다. 서버는 127.0.0.1에서만 수신하며, 직접 --host로 시작해 네트워크에 공개하지 않는 한 그렇습니다.',
  reversible: 'hooks는 언제든 Settings → Instant Detection (Hooks)에서 제거할 수 있습니다.',
};
