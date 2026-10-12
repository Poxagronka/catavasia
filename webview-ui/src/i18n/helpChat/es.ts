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
  errReplaced: 'Otra ventana hizo una pregunta nueva. Pregunta de nuevo.',
  errNoAnswer: 'Sin respuesta.',
  errExited: 'Claude Code se detuvo con el código de salida {code}. Inténtalo de nuevo.',
  unavailableNotInstalled: 'Claude Code no está instalado. Instálalo y vuelve a intentarlo.',
  unavailableNotLoggedIn: 'Claude Code no ha iniciado sesión. Inicia sesión y vuelve a intentarlo.',
};
