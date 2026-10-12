import type { Translation } from '../core.js';
import type { consent } from './en.js';

export const messages: Translation<typeof consent> = {
  headline: 'Bir şey daha: hooks!',
  what: "Ajanlarını gerçek zamanlı canlandırmak için catavasia, {count} Claude Code olayı için hooks'ları {file} dosyasına ekler. Mevcut ayarların korunur ve tek seferlik bir yedek {backup} olarak kaydedilir.",
  data: 'Claude Code bu olayları, araç adları ve araç girdileri dahil, bu makinedeki bir catavasia sunucusuna gönderir. Her şey yerel kalır: sunucu yalnızca 127.0.0.1 üzerinde dinler, ta ki sen onu --host ile başlatıp ağına açana kadar.',
  reversible:
    "Hooks'ları istediğin zaman Settings → Instant Detection (Hooks) bölümünden kaldırabilirsin.",
};
