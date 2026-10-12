import type { Translation } from '../core.js';
import type { onboarding } from './en.js';

export const messages: Translation<typeof onboarding> = {
  title: 'Willkommen bei Catavasia',
  next: 'Weiter',
  back: 'Zurück',
  skip: 'Überspringen',
  help: 'Hilfe',
  letsGo: 'Los geht’s',
  stepOf: 'Schritt {n} von {total}',
  forLabel: 'Wofür ist das?',
  writeLabel: 'Was schreibe ich?',
  languageTitle: 'Wähle deine Sprache',
  languageHint: 'Du kannst sie später in den Einstellungen ändern.',
  catTitle: 'Was ist eine Katze?',
  catBody:
    'Eine Katze ist ein KI-Helfer. Du gibst ihr eine Aufgabe, und sie arbeitet auf deinem Computer. Im Büro siehst du sie als kleine Katze. Sie tippt, wenn sie arbeitet, und ruht sich aus, wenn sie fertig ist.',
  ceoTitle: 'Der CEO',
  ceoBody:
    'Der CEO ist die Katze, mit der du sprichst. Schreibe im Chat rechts, was du willst. Der CEO entscheidet, wer die Arbeit macht, und bringt dir das Ergebnis.',
  teamTitle: 'Der Chef und die Arbeiter',
  teamBody:
    'Jedes Team hat einen Chef und einige Arbeiter. Der Chef teilt eine große Aufgabe in kleine Teile. Jeder Arbeiter macht einen Teil. Dann prüft der Chef das Ergebnis.',
  tasksTitle: 'Wie eine Aufgabe läuft',
  tasksBody:
    'Du schreibst eine Aufgabe. Der CEO gibt sie an den Chef. Der Chef verteilt die Teile an die Arbeiter. Die Arbeiter melden sich zurück. Der Chef schickt dir das Endergebnis.',
  whereTitle: 'Was kommt wohin',
  whereBody:
    'Schreibe Ziele und Fragen in den CEO-Chat. Schreibe die Regeln für eine Katze im Menü Katzen, in ihrer Rolle und ihrem Prompt. Drücke auf Hilfe, wenn du unsicher bist.',
  enginesTitle: 'Claude Code und Codex',
  enginesBody:
    'Die Katzen laufen mit Claude Code oder Codex. Installiere mindestens eines davon. Jede Katze kann beide nutzen.',
  buildIntroTitle: 'Erstelle deine ersten Katzen',
  buildIntroBody:
    'Jetzt bauen wir dein Team zusammen. Wir beginnen mit dem Chef. Danach kannst du Arbeiter hinzufügen. Ich erkläre jedes Feld.',
  bossLabel: 'Chef',
  workerLabel: 'Arbeiter',
  nameTitleBoss: 'Gib der Chef-Katze einen Namen',
  nameTitleWorker: 'Gib der Arbeiter-Katze einen Namen',
  nameFor:
    'Mit dem Namen rufst du und rufen die anderen Katzen diese Katze. Er steht auch über der Katze im Büro.',
  nameWrite: 'Schreibe einen kurzen Namen, wie für ein Haustier. Ein oder zwei Wörter.',
  nameMissing: 'Bitte schreibe zuerst einen Namen.',
  lookTitle: 'Wähle das Aussehen',
  lookFor: 'Das Aussehen ist nur zum Spaß. Es hilft dir, die Katzen im Büro zu unterscheiden.',
  lookWrite:
    'Wähle eine Rasse und ein Muster. Ändere die Farben, wenn du willst. Mache jede Katze anders.',
  roleTitle: 'Gib eine Rolle',
  roleFor:
    'Die Rolle ist ein kurzes Etikett für die Arbeit. Sie steht im Menü Katzen und in der Aufgabenliste.',
  roleWrite: 'Schreibe ein bis drei Wörter, zum Beispiel Teamleiter, Designer oder Tester.',
  promptTitle: 'Schreibe die Anweisungen',
  promptFor:
    'Der Prompt sagt der Katze, wer sie ist und wie sie arbeitet. Die Katze liest ihn vor jeder Aufgabe. Ein klarer Prompt bringt bessere Ergebnisse.',
  promptWriteBoss:
    'Schreibe, was das Team tut und wie der Chef die Arbeit aufteilt. Halte es kurz und klar. Du kannst meinen Vorschlag ändern.',
  promptWriteWorker:
    'Schreibe, was diese Katze gut kann und wie sie arbeiten soll. Halte es kurz und klar. Du kannst meinen Vorschlag ändern.',
  promptHelp: 'Du weißt nicht, was du schreiben sollst? Frag den Helfer.',
  savedTitle: '{name} ist jetzt in deinem Team!',
  savedBody: 'Du kannst jetzt einen weiteren Arbeiter hinzufügen oder weitermachen.',
  addWorker: 'Arbeiter hinzufügen',
  continue: 'Weiter',
  templateTitle: 'Wähle ein fertiges Team',
  templateBody:
    'Jedes Team hat einen Chef und drei Arbeiter mit fertigen Prompts. Du kannst später alles im Menü Katzen ändern.',
  templateEngineer: 'Entwickler',
  templateEngineerDesc: 'Schreibt, prüft und testet Code.',
  templateDesigner: 'Designer',
  templateDesignerDesc: 'Plant Marke, Bildschirme und Nutzerforschung.',
  templateProduct: 'Produktmanager',
  templateProductDesc: 'Findet Probleme, legt die Strategie fest und schreibt Spezifikationen.',
  templateMarketer: 'Marketer',
  templateMarketerDesc: 'Plant Kampagnen und schreibt Texte.',
  templateAnalyst: 'Datenanalyst',
  templateAnalystDesc: 'Bereinigt Daten, prüft Zahlen und zeichnet Diagramme.',
  templateWriter: 'Autor',
  templateWriterDesc: 'Recherchiert, schreibt und lektoriert Texte.',
  useTeam: 'Dieses Team nehmen',
  startEmpty: 'Ohne Katzen starten',
  startEmptyHint: 'Du kannst später Katzen im Menü Katzen hinzufügen.',
  templateFailed: 'Dieses Team konnte nicht gespeichert werden: {error}',
  installHooks: 'Hooks installieren',
  installing: 'Installiere...',
  notNow: 'Jetzt nicht',
  dontAskAgain: 'Nicht mehr fragen',
  doneTitle: 'Alles bereit!',
  doneFailedTitle: 'Die Hooks konnten nicht installiert werden',
  doneBody: 'Dein Büro ist bereit. Schreibe deine erste Aufgabe an den CEO im Chat rechts.',
  doneFailedBody:
    'Beim Schreiben in die Einstellungen von Claude Code ist etwas schiefgegangen. Das Büro beobachtet deine Sitzungen deshalb auf dem langsameren Weg. Alles funktioniert weiter, und du kannst es jederzeit in den Einstellungen erneut versuchen.',
  doneIssues: 'Einen Fehler gefunden oder eine Idee? Melde sie auf GitHub.',
};
