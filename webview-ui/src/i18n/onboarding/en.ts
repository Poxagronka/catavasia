import { defineNamespace } from '../core.js';

/**
 * Onboarding screens (language pick, how-it-works, cat creation, skip templates).
 * Owned by the onboarding agent. Add keys here, then add them to every other language file.
 */
export const messages = {
  title: 'Welcome to Catavasia',
  next: 'Next',
  back: 'Back',
  skip: 'Skip',
  help: 'Help',
  letsGo: "Let's go",
  stepOf: 'Step {n} of {total}',
  forLabel: 'What is it for?',
  writeLabel: 'What to write?',

  languageTitle: 'Choose your language',
  languageHint: 'You can change it later in Settings.',

  catTitle: 'What is a cat?',
  catBody:
    'A cat is an AI helper. You give it a job and it works on your computer. In the office you see it as a small cat. It types when it works and rests when it is done.',
  ceoTitle: 'The CEO',
  ceoBody:
    'The CEO is the cat you talk to. You write what you want in the chat on the right. The CEO decides who does the work and brings you the result.',
  teamTitle: 'The boss and the workers',
  teamBody:
    'Every team has one boss and some workers. The boss splits a big job into small parts. Each worker does one part. Then the boss checks the result.',
  tasksTitle: 'How a task flows',
  tasksBody:
    'You write a task. The CEO gives it to the boss. The boss gives the parts to the workers. The workers report back. The boss sends you the final result.',
  whereTitle: 'Where to type what',
  whereBody:
    'Write goals and questions in the CEO chat. Write the rules for one cat in the Cats menu, in its role and prompt. Press Help when you are not sure.',
  enginesTitle: 'Claude Code and Codex',
  enginesBody:
    'Cats run on Claude Code or Codex. Install at least one of them. Every cat can use either one.',

  buildIntroTitle: 'Make your first cats',
  buildIntroBody:
    'Now we make your team together. We start with the boss. Then you can add workers. I explain every field on the way.',
  bossLabel: 'Boss',
  workerLabel: 'Worker',
  nameTitleBoss: 'Name the boss cat',
  nameTitleWorker: 'Name the worker cat',
  nameFor:
    'The name is how you and the other cats call this cat. It also shows above the cat in the office.',
  nameWrite: 'Write a short name, like a name for a pet. One or two words.',
  nameMissing: 'Please write a name first.',
  lookTitle: 'Choose the look',
  lookFor: 'The look is only for fun. It helps you tell the cats apart in the office.',
  lookWrite: 'Pick a breed and a pattern. Change the colours if you like. Make each cat different.',
  roleTitle: 'Give it a role',
  roleFor: 'The role is a short label for the job. It shows in the Cats menu and in the task list.',
  roleWrite: 'Write one to three words, for example Team lead, Designer or Tester.',
  promptTitle: 'Write the instructions',
  promptFor:
    'The prompt tells the cat who it is and how to work. The cat reads it before every task. A clear prompt gives better results.',
  promptWriteBoss:
    'Say what the team does and how the boss splits the work. Keep it short and clear. You can change my suggestion.',
  promptWriteWorker:
    'Say what this cat is good at and how it should work. Keep it short and clear. You can change my suggestion.',
  promptHelp: 'Not sure what to write? Ask the helper.',
  savedTitle: '{name} joined your team!',
  savedBody: 'You can add another worker now, or continue.',
  addWorker: 'Add a worker',
  continue: 'Continue',

  templateTitle: 'Pick a ready team',
  templateBody:
    'Each team has one boss and three workers with ready prompts. You can change everything later in the Cats menu.',
  templateEngineer: 'Engineer',
  templateEngineerDesc: 'Writes, reviews and tests code.',
  templateDesigner: 'Designer',
  templateDesignerDesc: 'Plans brand, screens and user research.',
  templateProduct: 'Product manager',
  templateProductDesc: 'Finds problems, sets strategy and writes specs.',
  templateMarketer: 'Marketer',
  templateMarketerDesc: 'Plans campaigns and writes copy.',
  templateAnalyst: 'Data analyst',
  templateAnalystDesc: 'Cleans data, checks numbers and draws charts.',
  templateWriter: 'Writer',
  templateWriterDesc: 'Researches, writes and edits texts.',
  useTeam: 'Use this team',
  startEmpty: 'Start without cats',
  startEmptyHint: 'You can add cats later in the Cats menu.',
  templateFailed: 'This team could not be saved: {error}',

  installHooks: 'Install Hooks',
  installing: 'Installing...',
  notNow: 'Not Now',
  dontAskAgain: "Don't Ask Again",

  doneTitle: "You're all set!",
  doneFailedTitle: "Hooks couldn't be installed",
  doneBody: 'Your office is ready. Write your first task to the CEO in the chat on the right.',
  doneFailedBody:
    'Something went wrong writing to your Claude Code settings, so the office will watch your sessions the slower way instead. Everything still works, and you can retry from Settings at any time.',
  doneIssues: 'Found a bug or have an idea? Report it on GitHub.',
} as const;

export const onboarding = defineNamespace('onboarding', messages);
