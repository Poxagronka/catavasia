import type { Translation } from '../core.js';
import type { consent } from './en.js';

export const messages: Translation<typeof consent> = {
  headline: 'Mais uma coisa: hooks!',
  what: 'Para dar vida aos seus agentes em tempo real, o catavasia adiciona hooks para {count} eventos do Claude Code em {file}. Suas configurações atuais são mantidas, e um backup único é salvo como {backup}.',
  data: 'O Claude Code vai enviar esses eventos, incluindo nomes e entradas das ferramentas, para um servidor catavasia nesta máquina. Tudo fica local: o servidor escuta apenas em 127.0.0.1, a menos que você o inicie com --host para abri-lo à sua rede.',
  reversible:
    'Você pode remover os hooks a qualquer momento em Settings → Instant Detection (Hooks).',
};
