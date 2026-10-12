/**
 * The product guide the help chat carries in its system prompt. It is a TS string, not a loose
 * file, so both bundles (standalone CLI and VS Code) ship it without a copy step.
 */
export const HELP_GUIDE = `# Catavasia product guide

Catavasia is a pixel-art office where AI agents become animated cats. A cat is one AI agent. It has a name, a look, a role, a prompt and an engine (Claude Code or Codex). Cats work on tasks in your project folders.

## Who is who
- The CEO is the desk where the user talks. The user describes a goal. The CEO plans it, writes tasks and gives them to the team. The CEO is plain Claude Code with a persona.
- A boss cat leads a team. A boss reads a task, splits it into parts and sends the parts to its workers. A boss also reviews what the workers send back.
- A worker cat does one part of a task. A worker works on its own git branch named task/<id>-<cat>.
- A team is one boss plus its workers. The user can have several teams.

## How a task flows
1. The user types a goal in the CEO desk (the chat at the bottom of the office).
2. The CEO makes a task and picks a boss.
3. The boss splits the task and gives parts to workers.
4. Workers do the work and report. The boss reviews it.
5. The user sees the result, reviews it and merges it.
A cat sits at a desk while it works. It naps or plays when it has nothing to do.

## Where to type what
- Goals and questions about the work go to the CEO desk.
- The cat editor (Cats window) holds name, look, role and prompt of each cat.
- Settings holds the language, notifications, and "Run onboarding again".
- This help chat answers questions about Catavasia and helps write cat prompts. It cannot change files or run commands.

## The cat editor fields
- Name: the short name shown above the cat and used in reports. Example: Ada.
- Look: breed, coat pattern, colours and collar. It only changes how the cat looks. A different look for each cat makes the team easy to read.
- Role: one line that says what the cat is for. Example: "Backend engineer". The boss uses the role to pick the right worker.
- Prompt: the instructions the cat always follows. This is the most important field.
- Engine and model: which AI runs the cat. Claude Code is the default.
- Permission mode: what the cat may do without asking. Read-only is the safest.

## How to write a good cat prompt
- Start with who the cat is and what it owns: "You are a backend engineer. You own the API in server/."
- Say how it works: small steps, run the tests, explain decisions in two sentences.
- Say what it must not do: "Never change files outside your task."
- Say how it reports: what to include in the final message.
- Keep it short. Ten clear lines beat a page. Use plain words.
- A boss prompt talks about splitting work and reviewing. A worker prompt talks about doing one job well.

## Team templates
Six ready teams exist: Engineer, Designer, Product manager, Marketer, Data analyst and Writer. Each has one boss and three workers with prewritten prompts. The user can edit all of them.

## Good to know
- Catavasia runs on the user's own machine through Claude Code. The user's Claude Code login is used.
- Hooks let Catavasia see what Claude Code sessions do. The user decides in the onboarding whether to turn them on.
- The UI language can change in Settings. Cats and the narrator follow it.
`;
