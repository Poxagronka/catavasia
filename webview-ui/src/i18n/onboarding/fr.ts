import type { Translation } from '../core.js';
import type { onboarding } from './en.js';

export const messages: Translation<typeof onboarding> = {
  title: 'Bienvenue dans Catavasia',
  next: 'Suivant',
  back: 'Retour',
  skip: 'Passer',
  help: 'Aide',
  letsGo: 'C’est parti',
  stepOf: 'Étape {n} sur {total}',
  forLabel: 'À quoi ça sert ?',
  writeLabel: 'Que faut-il écrire ?',
  languageTitle: 'Choisissez votre langue',
  languageHint: 'Vous pourrez la changer plus tard dans les Réglages.',
  catTitle: 'Qu’est-ce qu’un chat ?',
  catBody:
    'Un chat est un assistant IA. Vous lui donnez un travail et il travaille sur votre ordinateur. Dans le bureau, vous le voyez comme un petit chat. Il tape quand il travaille et se repose quand il a fini.',
  ceoTitle: 'Le CEO',
  ceoBody:
    'Le CEO est le chat à qui vous parlez. Écrivez ce que vous voulez dans le chat à droite. Le CEO décide qui fait le travail et vous rapporte le résultat.',
  teamTitle: 'Le chef et les ouvriers',
  teamBody:
    'Chaque équipe a un chef et des ouvriers. Le chef coupe un gros travail en petites parties. Chaque ouvrier fait une partie. Ensuite le chef vérifie le résultat.',
  tasksTitle: 'Comment avance une tâche',
  tasksBody:
    'Vous écrivez une tâche. Le CEO la donne au chef. Le chef distribue les parties aux ouvriers. Les ouvriers font leur rapport. Le chef vous envoie le résultat final.',
  whereTitle: 'Où écrire quoi',
  whereBody:
    'Écrivez les objectifs et les questions dans le chat du CEO. Écrivez les règles d’un chat dans le menu Chats, dans son rôle et son prompt. Appuyez sur Aide si vous hésitez.',
  enginesTitle: 'Claude Code et Codex',
  enginesBody:
    'Les chats fonctionnent avec Claude Code ou Codex. Installez au moins l’un des deux. Chaque chat peut utiliser l’un ou l’autre.',
  buildIntroTitle: 'Créez vos premiers chats',
  buildIntroBody:
    'Nous créons votre équipe ensemble. On commence par le chef. Ensuite vous pouvez ajouter des ouvriers. J’explique chaque champ.',
  bossLabel: 'Chef',
  workerLabel: 'Ouvrier',
  nameTitleBoss: 'Donnez un nom au chat chef',
  nameTitleWorker: 'Donnez un nom au chat ouvrier',
  nameFor:
    'Avec ce nom, vous et les autres chats appelez ce chat. Il s’affiche aussi au-dessus du chat dans le bureau.',
  nameWrite: 'Écrivez un nom court, comme pour un animal. Un ou deux mots.',
  nameMissing: 'Écrivez d’abord un nom.',
  lookTitle: 'Choisissez l’apparence',
  lookFor: 'L’apparence sert juste à s’amuser. Elle aide à distinguer les chats dans le bureau.',
  lookWrite:
    'Choisissez une race et un motif. Changez les couleurs si vous voulez. Rendez chaque chat différent.',
  roleTitle: 'Donnez un rôle',
  roleFor:
    'Le rôle est une courte étiquette du travail. Il s’affiche dans le menu Chats et dans la liste des tâches.',
  roleWrite: 'Écrivez un à trois mots, par exemple Chef d’équipe, Designer ou Testeur.',
  promptTitle: 'Écrivez les instructions',
  promptFor:
    'Le prompt dit au chat qui il est et comment travailler. Le chat le lit avant chaque tâche. Un prompt clair donne de meilleurs résultats.',
  promptWriteBoss:
    'Dites ce que fait l’équipe et comment le chef répartit le travail. Restez court et clair. Vous pouvez changer ma suggestion.',
  promptWriteWorker:
    'Dites ce que ce chat sait faire et comment il doit travailler. Restez court et clair. Vous pouvez changer ma suggestion.',
  promptHelp: 'Vous ne savez pas quoi écrire ? Demandez à l’assistant.',
  savedTitle: '{name} rejoint votre équipe !',
  savedBody: 'Vous pouvez ajouter un autre ouvrier maintenant, ou continuer.',
  addWorker: 'Ajouter un ouvrier',
  continue: 'Continuer',
  templateTitle: 'Choisissez une équipe prête',
  templateBody:
    'Chaque équipe a un chef et trois ouvriers avec des prompts prêts. Vous pourrez tout changer plus tard dans le menu Chats.',
  templateEngineer: 'Ingénieur',
  templateEngineerDesc: 'Écrit, relit et teste le code.',
  templateDesigner: 'Designer',
  templateDesignerDesc: 'Prépare la marque, les écrans et les recherches utilisateurs.',
  templateProduct: 'Chef de produit',
  templateProductDesc: 'Trouve les problèmes, fixe la stratégie et écrit les spécifications.',
  templateMarketer: 'Marketeur',
  templateMarketerDesc: 'Prépare les campagnes et écrit les textes.',
  templateAnalyst: 'Analyste de données',
  templateAnalystDesc: 'Nettoie les données, vérifie les chiffres et dessine des graphiques.',
  templateWriter: 'Rédacteur',
  templateWriterDesc: 'Fait des recherches, écrit et corrige les textes.',
  useTeam: 'Prendre cette équipe',
  startEmpty: 'Commencer sans chats',
  startEmptyHint: 'Vous pourrez ajouter des chats plus tard dans le menu Chats.',
  templateFailed: 'Cette équipe n’a pas pu être enregistrée : {error}',
  installHooks: 'Installer les hooks',
  installing: 'Installation...',
  notNow: 'Pas maintenant',
  dontAskAgain: 'Ne plus demander',
  doneTitle: 'Tout est prêt !',
  doneFailedTitle: 'Les hooks n’ont pas pu être installés',
  doneBody: 'Votre bureau est prêt. Écrivez votre première tâche au CEO dans le chat à droite.',
  doneFailedBody:
    'Une erreur est survenue en écrivant dans les réglages de Claude Code. Le bureau suivra donc vos sessions de façon plus lente. Tout fonctionne encore et vous pouvez réessayer depuis les Réglages à tout moment.',
  doneIssues: 'Vous avez trouvé un bug ou vous avez une idée ? Dites-le sur GitHub.',
};
