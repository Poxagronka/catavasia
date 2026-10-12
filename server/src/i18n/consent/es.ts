import type { Translation } from '../core.js';
import type { consent } from './en.js';

export const messages: Translation<typeof consent> = {
  headline: 'Una cosa más: ¡hooks!',
  what: 'Para dar vida a tus agentes en tiempo real, catavasia añade hooks para {count} eventos de Claude Code en {file}. Tus ajustes actuales se conservan y se guarda una copia de seguridad única como {backup}.',
  data: 'Claude Code enviará esos eventos, incluidos los nombres y las entradas de las herramientas, a un servidor catavasia en esta máquina. Todo se queda en local: el servidor solo escucha en 127.0.0.1, salvo que lo inicies tú con --host para abrirlo a tu red.',
  reversible: 'Puedes quitar los hooks cuando quieras desde Settings → Instant Detection (Hooks).',
};
