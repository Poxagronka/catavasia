import type { Translation } from '../core.js';
import type { helpChat } from './en.js';

export const messages: Translation<typeof helpChat> = {
  title: 'Yardım',
  placeholder:
    "Catavasia hakkında her şeyi sorun ya da bir kedi prompt'u yazmak için yardım isteyin.",
  close: 'Kapat',
  send: 'Gönder',
  stop: 'Durdur',
  thinking: 'Düşünüyor…',
  newChat: 'Yeni sohbet',
  greetingOnboarding:
    "Merhaba! Ben Catavasia rehberinizim. Her şeyin nasıl çalıştığını sorun ya da kedinizin prompt'unu yazmama yardım ettirin.",
  greetingSettings:
    "Merhaba! Ben Catavasia rehberinizim. Uygulama hakkında her şeyi sorun ya da bir kedi prompt'u yazmama yardım ettirin.",
};
