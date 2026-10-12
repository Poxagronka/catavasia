// Constants of the first-run onboarding (webview-ui/src/onboarding/).

/** Stacking order of the onboarding overlay: above the office and its bubbles, BELOW the modal stack (50). */
export const ONBOARDING_Z_INDEX = 45;

/** Max width of the onboarding panel. */
export const ONBOARDING_PANEL_MAX_WIDTH_PX = 760;

/** Cat sprite zoom in the onboarding illustrations and the template cards. */
export const ONBOARDING_CAT_ZOOM = 3;
export const ONBOARDING_TEMPLATE_CAT_ZOOM = 2;

/** The plain explanation steps, in order. Each id has `<id>Title` and `<id>Body` keys in the dictionary. */
export const EXPLAIN_STEP_IDS = ['cat', 'ceo', 'team', 'tasks', 'where', 'engines'] as const;

/** Id prefix of a cat made in the onboarding builder. */
export const ONBOARDING_CAT_ID_PREFIX = 'cat';

/** The builder starts a new cat from these. They are English: instructions for the model, not UI copy. */
export const BOSS_ROLE_SUGGESTION = 'Team lead';
export const WORKER_ROLE_SUGGESTION = 'Developer';
export const BOSS_PROMPT_SUGGESTION =
  'You lead a team of cats. Split the user task into independent parts, one per worker, ' +
  'so that no two workers edit the same file. Check the merged result before you report.';
export const WORKER_PROMPT_SUGGESTION =
  'You are a careful cat. Do exactly the goal your boss gives you. ' +
  'Keep changes small. When done, call the office tool report with what you did.';
export const BOSS_NAME_PLACEHOLDER = 'Oliver';
export const WORKER_NAME_PLACEHOLDER = 'Luna';

/** Default look of a new cat before the user changes it. */
export const NEW_CAT_BREED = 'nikolai';

/** Install command of the Codex engine, shown in the engines step. */
export const CODEX_INSTALL_COMMAND = 'npm install -g @openai/codex';

/** Where the last step sends bug reports and ideas. */
export const ISSUES_URL = 'https://github.com/Poxagronka/catavasia/issues';
