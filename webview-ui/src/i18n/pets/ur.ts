import type { Translation } from '../core.js';
import type { pets } from './en.js';

export const messages: Translation<typeof pets> = {
  owner: 'مالک',
  ownerNone: 'کوئی نہیں',
  ownerHint:
    'پالتو اپنے مالک کے قریب زیادہ رہتا ہے: اس کے پیچھے چلتا ہے، اس کی میز پر آرام کرتا ہے اور پاس ہی سوتا ہے۔',
};
