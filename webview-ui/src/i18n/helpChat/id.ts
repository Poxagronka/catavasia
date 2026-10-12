import type { Translation } from '../core.js';
import type { helpChat } from './en.js';

export const messages: Translation<typeof helpChat> = {
  title: 'Bantuan',
  placeholder:
    'Tanyakan apa saja tentang Catavasia, atau minta bantuan menulis prompt untuk kucing.',
  close: 'Tutup',
  send: 'Kirim',
  stop: 'Berhenti',
  thinking: 'Berpikir…',
  newChat: 'Obrolan baru',
  greetingOnboarding:
    'Halo! Saya pemandu Catavasia Anda. Tanyakan cara kerja semuanya, atau minta saya membantu menulis prompt untuk kucing Anda.',
  greetingSettings:
    'Halo! Saya pemandu Catavasia Anda. Tanyakan apa saja tentang aplikasi ini, atau minta saya membantu menulis prompt untuk kucing.',
  errReplaced: 'Jendela lain mengajukan pertanyaan baru. Tanyakan lagi.',
  errNoAnswer: 'Tidak ada jawaban.',
  errExited: 'Claude Code berhenti dengan kode keluar {code}. Coba lagi.',
  unavailableNotInstalled: 'Claude Code belum terpasang. Pasang dulu, lalu coba lagi.',
  unavailableNotLoggedIn: 'Claude Code belum login. Login dulu, lalu coba lagi.',
};
