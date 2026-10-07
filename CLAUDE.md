# Catavasia (Pixel Agents fork) — Pointers

Pixel art office where AI agents (Claude Code terminals today, any tool tomorrow) become animated cat characters. Ships as a **VS Code extension** and an **`npx pixel-agents` standalone CLI** from the same source tree.

This file holds pointers and tripwires only. Read the linked doc before you work in its area. `CONTEXT.md` is the canonical glossary (Agent, Sub-agent, Teammate, Lead, Adopt, Headless agent): use its vocabulary in code, comments and docs.

## Repo and workflow

- Send pull requests and pushes only to `Poxagronka/catavasia`. Never push or open a PR to upstream `pixel-agents-hq/pixel-agents`. See [CONTRIBUTING.md](CONTRIBUTING.md).
- Gate before a push: `npm run lint`, `npm run check-types`, `npm test`, `npm run format:check`, `npm run knip`. Add `npm run e2e` for UI changes. See [CONTRIBUTING.md](CONTRIBUTING.md).
- Every merge to `main` sets the version to the previous `main` version +1 in `package.json` and both root fields of `package-lock.json`. See [CONTRIBUTING.md → Maintainer release checklist](CONTRIBUTING.md#maintainer-release-checklist).
- CI fails on drift: regenerate and commit `core/src/messages.ts` (`npm run asyncapi:generate`) and `e2e/README.md` (`npm run e2e:inventory`). See [testing-build.md → CI](docs/architecture/testing-build.md#ci).
- Product decisions and plans live in [docs/catavasia/ROADMAP.md](docs/catavasia/ROADMAP.md). Consent decisions live in [docs/adr/0001](docs/adr/0001-consent-choices-send-immediately-and-revise-as-absolute-state.md).

## Architecture — [source-tree.md](docs/architecture/source-tree.md), [runtime.md](docs/architecture/runtime.md), [key-decisions.md](docs/architecture/key-decisions.md)

- Strict layers: `core/` depends on nothing, `server/` and `webview-ui/` only on `core/`, `adapters/vscode/` on `core/` + `server/`. The standalone CLI never imports `adapters/vscode/` and vice versa.
- `core/asyncapi.yaml` is the wire contract, pinned to AsyncAPI 3.0.0 (Modelina limit). `core/src/messages.ts` is generated: never edit it by hand.
- `createTransport()` is the only transport branch in the UI. No module under `server/` calls a transport method directly: mutate `AgentStateStore`.
- A new CLI integration is one folder under `server/src/providers/hook/<id>/`. The runtime dispatches on `AgentEvent.kind`, never on CLI tool names.
- Teams: never link a teammate by the implicit team's `leadSessionId`. `removeTeammate` must not unregister a sidecar teammate's session (it shares the lead's). Detail: [runtime.md → TeamProvider](docs/architecture/runtime.md#teamprovider-lead--teammates).
- `/ws` privileged messages need the server token, never a network position (peer, `Host`, `Origin`). See [runtime.md → HTTP + WebSocket Server](docs/architecture/runtime.md#http--websocket-server).
- Persist the hooks preference only after the install or uninstall settled and the disk agrees.
- Hooks installer: hook identity is the anchored, case-insensitive `/.pixel-agents/hooks/claude-hook.js` suffix of the first token. Never rewrite a settings shape we did not author. See [key-decisions.md](docs/architecture/key-decisions.md).
- Job store: a task always needs an explicit `cwd`, never `process.cwd()`. `.gitignore` ignores every `tasks/` folder, so folders are named `taskBoard`.
- Cat office: office MCP tools must return at once (60 s MCP timeout). Worker branches are `task/<id>-<cat>`.
- Narrator WS messages are not in `core/asyncapi.yaml` yet. Every Haiku sentence must pass the server-side evidence check.
- Self-update: the token reaches the new process only in the `CATAVASIA_RESTART_TOKEN` env, never argv. The only repo URL is `UPDATE_REPO`.

## Agent tracking — [agent-tracking.md](docs/architecture/agent-tracking.md)

- Context usage is a snapshot of the newest turn (input + both cache counters + output) against the provider's `contextWindowForModel`, never a sum of turns.
- In the webview, `agentToolStart` with `runInBackground=true` makes a Subtask only when the parent has no `teamName`. `subagentToolStart` creates a missing sub lazily.
- A heuristic permission bubble lands 7 s after the sub-tool, not the parent Task. Give tests at least a 10 s budget.

## Office UI and assets — [office-ui.md](docs/architecture/office-ui.md)

- Furniture rule (user, 2026-10-06): every item rotates, carries its states and has orientation-safe cat activities. `webview-ui/test/furnitureRotation.test.ts` guards it. Add items with `.claude/skills/add-furniture/SKILL.md`. Detail: [docs/catavasia/furniture.md](docs/catavasia/furniture.md).
- Engine code compares furniture by `furnitureKind(type)`, never by `type`. Spots are declared in the front view and resolved through `itemFrame`.
- Spot reservations: a cat reserves at walk start, never at arrival. Release happens only in the per-frame `reconcile`.
- Litter boxes: the pile lands only when the cat starts covering (outro). `setAvoidTiles` is global per frame.
- Sprites are generated: edit `scripts/cats/`, `scripts/petCare/art.mjs` and the other generators, never the PNG or JSON output. Code names a pose (`pose('napOut')`), never a frame index.
- Keep older `assets/default-layout-N.json` files: they are the upgrade fingerprints.
- Pixel style ESLint rules are `error` level: no inline colors outside `constants.ts`, `var(--pixel-shadow)`, FS Pixel Sans.

## Testing, build and conventions — [testing-build.md](docs/architecture/testing-build.md)

- Local e2e skips the specs that open VS Code. CI runs them. Set `E2E_VSCODE=1` only on a machine where a VS Code window is fine.
- Before a new e2e spec, read [e2e/README.md → Mocking model & rules](e2e/README.md#mocking-model--rules). Tests never invoke real `claude`.
- TypeScript: no `enum` (use `as const`), `import type` for types, `.js` extensions on relative imports in extension + server.
- All magic numbers and strings live in the `constants.ts` files and `index.css` `:root`. Never inline them.
- `npm run watch` does not run the Vite dev server. Run `cd webview-ui && npm run dev` separately.
- Manual hook testing with `server/manual-hook-events.http` (REST-Client format): see [CONTRIBUTING.md → Manual Hook Testing](CONTRIBUTING.md#manual-hook-testing).
