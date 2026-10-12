import type { Translation } from '../core.js';
import type { helpChat } from './en.js';

export const messages: Translation<typeof helpChat> = {
  title: 'Ajuda',
  placeholder: 'Pergunte qualquer coisa sobre o Catavasia ou peça ajuda com o prompt de um gato.',
  close: 'Fechar',
  send: 'Enviar',
  stop: 'Parar',
  thinking: 'Pensando…',
  newChat: 'Nova conversa',
  greetingOnboarding:
    'Olá! Eu sou o seu guia do Catavasia. Pergunte como tudo funciona ou peça ajuda para escrever o prompt do seu gato.',
  greetingSettings:
    'Olá! Eu sou o seu guia do Catavasia. Pergunte qualquer coisa sobre o app ou peça ajuda para escrever o prompt de um gato.',
};
