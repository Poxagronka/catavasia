import type { Translation } from '../core.js';
import type { narrator } from './en.js';

export const messages: Translation<typeof narrator> = {
  planning: '사냥을 계획하는 중',
  exploring: '여기저기 킁킁대는 중',
  building: '코드를 꾹꾹 주무르는 중',
  testing: '버그를 냥냥 펀치로 잡는 중',
  reviewing: '코드를 그루밍하는 중',
  delivering: '쥐를 물어다 주는 중',
  skill: '고양이 매뉴얼을 읽는 중',
  briefing: '고양이 회의 중',
  delegating: '고양이들을 모으는 중',
  teammate: '동료를 킁킁대는 중',
  input: '당신을 부르며 야옹하는 중',
  permission: '문을 긁는 중',
  done: '그르릉, 모두 끝났어요',
  error: '버그에게 하악질하는 중',
};
