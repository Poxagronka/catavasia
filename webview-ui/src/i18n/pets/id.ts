import type { Translation } from '../core.js';
import type { pets } from './en.js';

export const messages: Translation<typeof pets> = {
  owner: 'Pemilik',
  ownerNone: 'Tidak ada',
  ownerHint:
    'Hewan peliharaan lebih sering dekat pemiliknya: mengikuti, bersantai di meja, dan tidur di dekatnya.',
};
