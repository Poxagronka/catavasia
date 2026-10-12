import type { Translation } from '../core.js';
import type { consent } from './en.js';

export const messages: Translation<typeof consent> = {
  headline: 'Satu hal lagi: hooks!',
  what: 'Agar agen Anda hidup secara real time, catavasia menambahkan hooks untuk {count} event Claude Code ke {file}. Pengaturan Anda yang ada tetap dipertahankan, dan satu cadangan sekali pakai disimpan sebagai {backup}.',
  data: 'Claude Code akan mengirim event tersebut, termasuk nama dan input tool, ke server catavasia di mesin ini. Semuanya tetap lokal: server hanya mendengarkan di 127.0.0.1, kecuali Anda sendiri menjalankannya dengan --host untuk membukanya ke jaringan Anda.',
  reversible: 'Anda bisa menghapus hooks kapan saja lewat Settings → Instant Detection (Hooks).',
};
