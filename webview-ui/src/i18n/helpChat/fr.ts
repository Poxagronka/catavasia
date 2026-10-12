import type { Translation } from '../core.js';
import type { helpChat } from './en.js';

export const messages: Translation<typeof helpChat> = {
  title: 'Aide',
  placeholder:
    "Posez n'importe quelle question sur Catavasia, ou demandez de l'aide pour le prompt d'un chat.",
  close: 'Fermer',
  send: 'Envoyer',
  stop: 'Arrêter',
  thinking: 'Réflexion…',
  newChat: 'Nouvelle discussion',
  greetingOnboarding:
    'Bonjour ! Je suis votre guide Catavasia. Demandez-moi comment tout fonctionne, ou demandez-moi de vous aider à écrire le prompt de votre chat.',
  greetingSettings:
    "Bonjour ! Je suis votre guide Catavasia. Posez-moi n'importe quelle question sur l'application, ou demandez-moi de vous aider à écrire le prompt d'un chat.",
  errReplaced: 'Une autre fenêtre a posé une nouvelle question. Demandez à nouveau.',
  errNoAnswer: 'Pas de réponse.',
  errExited: 'Claude Code s’est arrêté avec le code de sortie {code}. Réessayez.',
  unavailableNotInstalled: 'Claude Code n’est pas installé. Installez-le, puis réessayez.',
  unavailableNotLoggedIn: 'Claude Code n’est pas connecté. Connectez-vous, puis réessayez.',
};
