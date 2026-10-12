import type { Translation } from '../core.js';
import type { helpChat } from './en.js';

export const messages: Translation<typeof helpChat> = {
  title: 'Ayuda',
  placeholder: 'Pregunta lo que quieras sobre Catavasia o pide ayuda con el prompt de un gato.',
  close: 'Cerrar',
  send: 'Enviar',
  stop: 'Detener',
  thinking: 'Pensando…',
  newChat: 'Nuevo chat',
  greetingOnboarding:
    '¡Hola! Soy tu guía de Catavasia. Pregúntame cómo funciona todo o pídeme ayuda para escribir el prompt de tu gato.',
  greetingSettings:
    '¡Hola! Soy tu guía de Catavasia. Pregúntame lo que quieras sobre la aplicación o pídeme ayuda para escribir el prompt de un gato.',
};
