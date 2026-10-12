import type { Translation } from '../core.js';
import type { helpChat } from './en.js';

export const messages: Translation<typeof helpChat> = {
  title: 'Hilfe',
  placeholder: 'Frag alles über Catavasia oder bitte um Hilfe bei einem Katzen-Prompt.',
  close: 'Schließen',
  send: 'Senden',
  stop: 'Stopp',
  thinking: 'Denke nach…',
  newChat: 'Neuer Chat',
  greetingOnboarding:
    'Hallo! Ich bin dein Catavasia-Guide. Frag mich, wie alles funktioniert, oder bitte mich, dir beim Prompt für deine Katze zu helfen.',
  greetingSettings:
    'Hallo! Ich bin dein Catavasia-Guide. Frag mich alles über die App oder bitte mich, dir beim Prompt für eine Katze zu helfen.',
  errReplaced: 'Ein anderes Fenster hat eine neue Frage gestellt. Frage noch einmal.',
  errNoAnswer: 'Keine Antwort.',
  errExited: 'Claude Code wurde mit Exit-Code {code} beendet. Versuche es noch einmal.',
  unavailableNotInstalled:
    'Claude Code ist nicht installiert. Installiere es und versuche es noch einmal.',
  unavailableNotLoggedIn:
    'Claude Code ist nicht angemeldet. Melde dich an und versuche es noch einmal.',
};
