import type { Translation } from '../core.js';
import type { pets } from './en.js';

export const messages: Translation<typeof pets> = {
  owner: '주인',
  ownerNone: '없음',
  ownerHint:
    '펫이 주인 곁에 더 자주 머뭅니다. 따라다니고, 책상 위에서 쉬고, 가까이에서 낮잠을 잡니다.',
};
