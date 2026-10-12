import type { Translation } from '../core.js';
import type { consent } from './en.js';

export const messages: Translation<typeof consent> = {
  headline: 'Noch etwas: Hooks!',
  what: 'Damit deine Agenten in Echtzeit zum Leben erwachen, fügt catavasia Hooks für {count} Claude-Code-Ereignisse zu {file} hinzu. Deine bestehenden Einstellungen bleiben erhalten, und ein einmaliges Backup wird als {backup} gespeichert.',
  data: 'Claude Code sendet diese Ereignisse, auch Werkzeugnamen und Werkzeugeingaben, an einen catavasia-Server auf diesem Rechner. Alles bleibt lokal: Der Server lauscht nur auf 127.0.0.1, außer du startest ihn selbst mit --host und öffnest ihn für dein Netzwerk.',
  reversible: 'Du kannst die Hooks jederzeit unter Settings → Instant Detection (Hooks) entfernen.',
};
