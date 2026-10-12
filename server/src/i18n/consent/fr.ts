import type { Translation } from '../core.js';
import type { consent } from './en.js';

export const messages: Translation<typeof consent> = {
  headline: 'Encore une chose : les hooks !',
  what: 'Pour donner vie à vos agents en temps réel, catavasia ajoute des hooks pour {count} événements Claude Code dans {file}. Vos réglages existants sont conservés et une sauvegarde unique est enregistrée sous {backup}.',
  data: "Claude Code enverra ces événements, y compris les noms et les entrées des outils, à un serveur catavasia sur cette machine. Tout reste en local : le serveur n'écoute que sur 127.0.0.1, sauf si vous le démarrez avec --host pour l'ouvrir à votre réseau.",
  reversible:
    'Vous pouvez retirer les hooks à tout moment depuis Settings → Instant Detection (Hooks).',
};
