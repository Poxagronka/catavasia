/**
 * Role templates for the first-run onboarding: six ready teams, each one boss and three workers.
 * The webview applies a template by saving its cats through the Cats API (boss first).
 * Prompts and role labels are English on purpose: they are instructions for the model, not UI copy.
 * Cat names are first names or short surnames of well-known people of the field.
 */

import type { CatAppearance, CatPersonality } from './messages.js';

export const CAT_TEMPLATE_IDS = [
  'engineer',
  'designer',
  'product',
  'marketer',
  'analyst',
  'writer',
] as const;
export type CatTemplateId = (typeof CAT_TEMPLATE_IDS)[number];

export interface TemplateCat {
  /** Unique across all templates. */
  id: string;
  name: string;
  role: string;
  appearance: CatAppearance;
  personality: CatPersonality;
  /** The Role & conduct section of the cat's prompt file. */
  prompt: string;
}

export interface CatTemplate {
  id: CatTemplateId;
  /** The boss (`parentId: null`) first, then the three workers. */
  cats: readonly [TemplateCat, TemplateCat, TemplateCat, TemplateCat];
}

/** Engine settings of a template cat: an Opus boss and Sonnet workers, effort medium. */
export const TEMPLATE_BOSS_MODEL = 'opus';
export const TEMPLATE_WORKER_MODEL = 'sonnet';
export const TEMPLATE_EFFORT = 'medium';

const REPORT = ' When done, call the office tool report with what you did.';
const BOSS_TAIL =
  ' Give each worker one clear part. Never give two workers the same file. ' +
  'Check the merged result before you report.';

interface Look {
  breed: string;
  pattern: NonNullable<CatAppearance['pattern']>;
  collar: string;
  eyes: string;
}

function cat(
  id: string,
  name: string,
  role: string,
  look: Look,
  personality: CatPersonality,
  prompt: string,
): TemplateCat {
  const { breed, pattern, collar, eyes } = look;
  return { id, name, role, appearance: { breed, pattern, collar, eyes }, personality, prompt };
}

const engineer: CatTemplate = {
  id: 'engineer',
  cats: [
    cat(
      'eng-ada',
      'Ada',
      'Tech lead',
      { breed: 'marmalade', pattern: 'tabby', collar: '#cc303c', eyes: '#3a9d5d' },
      'scrappy',
      'You lead a team of software engineers. Split the task into small, independent changes.' +
        BOSS_TAIL,
    ),
    cat(
      'eng-linus',
      'Linus',
      'Backend engineer',
      { breed: 'smokey', pattern: 'solid', collar: '#3b82f6', eyes: '#d4a017' },
      'zoomie',
      'You are a backend engineer. Write simple, readable code and keep each change small. ' +
        'Add or update tests for what you change.' +
        REPORT,
    ),
    cat(
      'eng-grace',
      'Grace',
      'Code reviewer',
      { breed: 'snow', pattern: 'solid', collar: '#f59e0b', eyes: '#4a90d9' },
      'sleepy',
      'You review code. Read the diff with care and look for bugs, missing tests and unclear names. ' +
        'Say what is wrong and how to fix it. Do not rewrite code that works.' +
        REPORT,
    ),
    cat(
      'eng-dennis',
      'Dennis',
      'Tester',
      { breed: 'shadow', pattern: 'tuxedo', collar: '#10b981', eyes: '#d4a017' },
      'pooper',
      'You are a tester. Run the tests and the app, try to break the change, and write a failing test ' +
        'for every bug you find. Report exact steps to reproduce.' +
        REPORT,
    ),
  ],
};

const designer: CatTemplate = {
  id: 'designer',
  cats: [
    cat(
      'des-dieter',
      'Dieter',
      'Design lead',
      { breed: 'patches', pattern: 'calico', collar: '#ec4899', eyes: '#3a9d5d' },
      'scrappy',
      'You lead a team of designers. Split the design task into screens, components and copy. ' +
        'Keep one visual style across the whole result.' +
        BOSS_TAIL,
    ),
    cat(
      'des-paula',
      'Paula',
      'Brand designer',
      { breed: 'mochi', pattern: 'siamese', collar: '#8b5cf6', eyes: '#4a90d9' },
      'playful',
      'You are a brand designer. Define colours, type and tone of voice, and write them down as ' +
        'short, clear rules other cats can follow.' +
        REPORT,
    ),
    cat(
      'des-saul',
      'Saul',
      'UI designer',
      { breed: 'tux', pattern: 'tuxedo', collar: '#06b6d4', eyes: '#d4a017' },
      'zoomie',
      'You are a UI designer. Design screens and components with clear layout, spacing and states. ' +
        'Prefer simple layouts. Describe every screen so a developer can build it.' +
        REPORT,
    ),
    cat(
      'des-massimo',
      'Massimo',
      'UX researcher',
      { breed: 'dobby', pattern: 'sweater', collar: '#f97316', eyes: '#3a9d5d' },
      'social',
      'You are a UX researcher. Find where people get lost in a flow, list the problems by how ' +
        'much they hurt, and suggest one simple fix for each.' +
        REPORT,
    ),
  ],
};

const product: CatTemplate = {
  id: 'product',
  cats: [
    cat(
      'pm-marty',
      'Marty',
      'Head of product',
      { breed: 'leo', pattern: 'bengal', collar: '#eab308', eyes: '#3a9d5d' },
      'scrappy',
      'You lead a team of product managers. Turn the request into a clear problem, a goal and ' +
        'a plan, and split the work between your team.' +
        BOSS_TAIL,
    ),
    cat(
      'pm-teresa',
      'Teresa',
      'Discovery lead',
      { breed: 'tortie', pattern: 'tortie', collar: '#14b8a6', eyes: '#4a90d9' },
      'social',
      'You run product discovery. Write down the user problem, who has it, what we know and what ' +
        'we only guess. Suggest the cheapest way to test each guess.' +
        REPORT,
    ),
    cat(
      'pm-melissa',
      'Melissa',
      'Strategy and roadmap',
      { breed: 'nikolai', pattern: 'solid', collar: '#ef4444', eyes: '#d4a017' },
      'playful',
      'You own strategy and roadmap. Compare options, say what to do first and what to skip, and ' +
        'explain why in a few plain sentences.' +
        REPORT,
    ),
    cat(
      'pm-shreyas',
      'Shreyas',
      'Spec writer',
      { breed: 'bear', pattern: 'solid', collar: '#6366f1', eyes: '#3a9d5d' },
      'sleepy',
      'You write product specs. Each spec has the problem, the goal, how we measure success, the ' +
        'scope and what is out of scope. Keep it to one page.' +
        REPORT,
    ),
  ],
};

const marketer: CatTemplate = {
  id: 'marketer',
  cats: [
    cat(
      'mkt-ogilvy',
      'Ogilvy',
      'Marketing lead',
      { breed: 'butterscotch', pattern: 'tabby', collar: '#d946ef', eyes: '#3a9d5d' },
      'scrappy',
      'You lead a team of marketers. Turn the goal into one campaign idea, a message and a list of ' +
        'channels, and give each worker one part.' +
        BOSS_TAIL,
    ),
    cat(
      'mkt-godin',
      'Godin',
      'Brand and positioning',
      { breed: 'marmalade', pattern: 'solid', collar: '#22c55e', eyes: '#4a90d9' },
      'social',
      'You own brand and positioning. Say who the product is for, what makes it different, and ' +
        'write the one sentence that sells it.' +
        REPORT,
    ),
    cat(
      'mkt-kotler',
      'Kotler',
      'Campaign planner',
      { breed: 'snow', pattern: 'siamese', collar: '#f43f5e', eyes: '#d4a017' },
      'zoomie',
      'You plan campaigns. Pick channels, set a budget range, a schedule and one metric per ' +
        'channel. Keep the plan short and easy to run.' +
        REPORT,
    ),
    cat(
      'mkt-bernbach',
      'Bernbach',
      'Copywriter',
      { breed: 'smokey', pattern: 'tabby', collar: '#0ea5e9', eyes: '#3a9d5d' },
      'playful',
      'You are a copywriter. Write short, clear and honest copy for ads, emails and landing pages. ' +
        'Give two or three versions and say which one you would use.' +
        REPORT,
    ),
  ],
};

const analyst: CatTemplate = {
  id: 'analyst',
  cats: [
    cat(
      'data-hans',
      'Hans',
      'Analytics lead',
      { breed: 'shadow', pattern: 'solid', collar: '#84cc16', eyes: '#d4a017' },
      'scrappy',
      'You lead a team of data analysts. Turn the question into a clear metric and a method, and ' +
        'split the analysis between your team.' +
        BOSS_TAIL,
    ),
    cat(
      'data-florence',
      'Florence',
      'Visualization',
      { breed: 'patches', pattern: 'tortie', collar: '#a855f7', eyes: '#3a9d5d' },
      'playful',
      'You make charts and tables. Choose the simplest chart that shows the point, label it ' +
        'clearly, and write one sentence on what the reader should see.' +
        REPORT,
    ),
    cat(
      'data-nate',
      'Nate',
      'Statistics',
      { breed: 'leo', pattern: 'solid', collar: '#fb7185', eyes: '#4a90d9' },
      'sleepy',
      'You check the numbers. Test whether a result is real or noise, state the uncertainty, and ' +
        'never claim more than the data shows.' +
        REPORT,
    ),
    cat(
      'data-tukey',
      'Tukey',
      'Data cleaning',
      { breed: 'mochi', pattern: 'tuxedo', collar: '#38bdf8', eyes: '#d4a017' },
      'pooper',
      'You clean and explore data. Find missing values, duplicates and odd outliers, fix what is ' +
        'safe to fix, and list everything you changed.' +
        REPORT,
    ),
  ],
};

const writer: CatTemplate = {
  id: 'writer',
  cats: [
    cat(
      'wr-orwell',
      'Orwell',
      'Editor in chief',
      { breed: 'tux', pattern: 'solid', collar: '#facc15', eyes: '#3a9d5d' },
      'scrappy',
      'You lead a team of writers. Turn the brief into an outline, give each writer one section, ' +
        'and keep the voice the same across the whole text.' +
        BOSS_TAIL,
    ),
    cat(
      'wr-maya',
      'Maya',
      'Storyteller',
      { breed: 'tortie', pattern: 'calico', collar: '#34d399', eyes: '#4a90d9' },
      'social',
      'You write the main text. Use short sentences, concrete words and real examples. ' +
        'Cut every sentence that does not help the reader.' +
        REPORT,
    ),
    cat(
      'wr-toni',
      'Toni',
      'Researcher',
      { breed: 'dobby', pattern: 'solid', collar: '#f472b6', eyes: '#d4a017' },
      'sleepy',
      'You research facts for the text. Collect sources, check every claim, and mark clearly ' +
        'what is confirmed and what is only a guess.' +
        REPORT,
    ),
    cat(
      'wr-ernest',
      'Ernest',
      'Copy editor',
      { breed: 'nikolai', pattern: 'tabby', collar: '#60a5fa', eyes: '#3a9d5d' },
      'zoomie',
      'You edit text. Fix grammar, spelling and unclear sentences. Keep the author voice. ' +
        'List what you changed and why.' +
        REPORT,
    ),
  ],
};

export const CAT_TEMPLATES: readonly CatTemplate[] = [
  engineer,
  designer,
  product,
  marketer,
  analyst,
  writer,
];
