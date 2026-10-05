# Cat Office: multi-agent orchestration research and spec sketch

Date: 2026-10-05. Scope: read-only research for catavasia (`~/catavasia`, fork of pixel-agents v1.4.1).
Installed CLI: `claude --version` → `2.1.289 (Claude Code)`. Agent SDK on npm: `@anthropic-ai/claude-agent-sdk` `0.3.289` (`npm view`).
Docs were downloaded as markdown from `https://code.claude.com/docs/en/<page>.md` and grepped. Every claim below cites a doc page, a command output, or code.

## 0. Recommendation in one paragraph

Build the office on **our own orchestrator** (option A3). Each cat is one long-lived `claude -p --input-format stream-json --output-format stream-json` process that the catavasia server owns. The persona comes from `--append-system-prompt` (or `--system-prompt`) and `--model`. A catavasia-hosted HTTP MCP server gives every cat the tools `delegate`, `report`, `ask`, `reply`, `brief`. The server holds the hierarchy tree, checks every call against it, and injects each message into the target cat's stdin as a stream-json user message. Every message passes through the server, so the game gets a clean, structured event for every conversation. The cat panel is a chat console over the stream-json events plus an input box (A). A "take the wheel" button gives a real TUI: it pauses the driver and opens `claude --resume <id>` in a PTY. That PTY reuses upstream PR #347 (B). The narrator is one more stream-json process on Haiku 4.5 with tools off and thinking off. It gets batched events every 5–10 s and rotates its session at a token cap (C). Agent Teams do not fit: they are experimental, interactive-only, one level deep, and the lead is fixed.

## A. Inter-session communication options

### A0. Facts verified from the CLI and docs

| Fact | Evidence |
|---|---|
| `-p` takes `--input-format stream-json` ("realtime streaming input") and `--output-format stream-json` | `claude --help` |
| One process serves several turns over stdin | Test in `scratchpad/narr/out.jsonl`: two user lines produced two `result` events with one `session_id` (`5a9882d7-…`). Context grew from 616 to 993 input tokens |
| A user message sent mid-turn can carry `priority: now / next / later` and `origin: {kind:"human"}` | [agent-sdk/typescript § SDKUserMessage](https://code.claude.com/docs/en/agent-sdk/typescript) |
| `shouldQuery:false` appends context without a model call | same page |
| `--append-system-prompt`, `--system-prompt`, `--model`, `--agents <json>`, `--agent`, `--mcp-config`, `--session-id`, `--name`, `--no-session-persistence`, `--max-budget-usd` exist | `claude --help` |
| The system prompt is recorded on the first request and reused on `--resume` until compaction | [cli-reference § System prompt flags in resumed conversations](https://code.claude.com/docs/en/cli-reference) |
| Two processes on one session ID interleave into one transcript | [sessions](https://code.claude.com/docs/en/sessions): "If you resume the same session in two terminals without forking, messages from both interleave into one transcript." |
| HTTP MCP requests time out after 60 s by default (`MCP_TOOL_TIMEOUT` or per-server `timeout` raises it). The network idle timeout is 5 min | [env-vars](https://code.claude.com/docs/en/env-vars) `MCP_TOOL_TIMEOUT`, `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT` |
| A Claude process uses about 300–850 MB RSS | `ps -axo rss,command` on this machine (2 live sessions: 311 MB, 851 MB) |

### A1. Claude Code Agent Teams

Source: [agent-teams](https://code.claude.com/docs/en/agent-teams), catavasia `CHANGELOG.md` v1.4.0, `server/src/providers/hook/claude/claudeTeamProvider.ts`, `server/src/teamUtils.ts`.

- **Status:** "Agent teams are experimental and disabled by default." You enable them with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.
- **Headless:** "Spawning teammates also requires an interactive session. In non-interactive mode with the `-p` flag, including Agent SDK sessions, Claude doesn't spawn teammates." (line 62)
- **Hierarchy:** "No nested teams: teammates cannot spawn their own teammates. Only the lead can manage the team." "One team per session." "Lead is fixed." The maximum depth is 2 (lead + flat teammates).
- **Persona:** a teammate can use a subagent definition. For an in-process teammate, the definition body "appends ... to its default system prompt". For a split-pane teammate, the body replaces it. `tools` and `model` apply. The lead chooses the names when it spawns.
- **Messages:** `SendMessage` writes to a mailbox file at `~/.claude/teams/{team}/inboxes/{agent}.json`. Idle teammates notify the lead.
- **Terminal:** in-process mode works in one TUI (arrow keys select a teammate). Split panes need tmux or iTerm2.
- **Resume:** "/resume and /rewind do not restore in-process teammates."
- **Visualization today:** catavasia already renders leads and teammates. It reads team config and sidecar `.meta.json`, and it maps `agent_id: <name>@<team>` from the Agent tool result (`claudeTeamProvider.ts`, CHANGELOG #218/#351).

| Need | Result |
|---|---|
| (1) Hierarchy of any depth | **No**: 2 levels |
| (2) Per-cat prompt | Partial: the lead must name a subagent definition. Prompt is appended in-process |
| (3) Observable messages | Partial: mailbox JSON files and transcripts. We must scrape them |
| (4) Real terminal | Yes, but only one TUI for the whole team (the lead's) |
| (5) Cost/complexity | Low code, high tokens ("significantly more tokens") |
| (6) Stability | Experimental flag. Documented limitations on resume, task status lag, shutdown |

**Verdict:** reject as the backbone. Keep the existing team rendering for users who run teams by hand.

### A2. Subagents and background agents

Source: [sub-agents](https://code.claude.com/docs/en/sub-agents), [agent-view](https://code.claude.com/docs/en/agent-view).

- Subagents nest "up to three layers below the main conversation" by default. `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` changes the limit. At most 20 run at the same time (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`).
- Per-subagent `prompt`, `model`, `tools` in `.claude/agents/*.md` or `--agents '<json>'`.
- All subagents live inside **one** parent process. The user cannot open a subagent as its own terminal. The model decides when to delegate, and the server cannot enforce who talks to whom.
- **Background sessions** (`claude --bg`, `claude attach <id>`, `claude logs`, `claude stop`, `claude agents --json`) are full interactive sessions under a supervisor. They outlive the terminal. Test result: `claude --bg --session-id <uuid> ...` printed `warning: --bg manages the session id; ignoring --session-id`. The real ID is in `claude agents --json` → `sessionId`. `--bg` cannot be combined with `-p`. The docs give no supported API to push a prompt into a bg session from a program. `claude --resume <id> "prompt"` forwards a prompt only from a TTY, and the docs refuse it with piped I/O.

| Need | Subagents | Background sessions |
|---|---|---|
| (1) Any depth | No (3 by default, model-driven) | Flat. No hierarchy |
| (2) Persona | Yes | Yes (`--agent`, `--append-system-prompt`) |
| (3) Observable messages | Transcripts only | Transcripts only |
| (4) Real terminal | No | **Yes** (`claude attach` in a PTY) |
| (5) Cost | Lowest tokens | Medium |
| (6) Stability | Stable | Stable, but the server cannot drive input |

**Verdict:** subagents are fine inside one cat for its own helpers. Do not use them as cats.

### A3. Our orchestrator: per-cat stream-json process + catavasia MCP server (recommended)

Each cat runs this command. The catavasia server spawns it in the cat's cwd. It extends `TaskManager.spawnRun` in `server/src/taskBoard/taskManager.ts`:

```
claude -p --input-format stream-json --output-format stream-json --verbose \
  --session-id <uuid> --name cat-<slug> --model <cat.model> \
  --append-system-prompt-file <persona.md> \
  --mcp-config '{"mcpServers":{"office":{"type":"http","url":"http://127.0.0.1:<port>/mcp/<catId>","headers":{"Authorization":"Bearer <token>"},"timeout":600000}}}' \
  --permission-mode <cat.permissionMode>   # today: --dangerously-skip-permissions
```

The MCP server lives in the Fastify server. Use HTTP type: a `url` with no `type` is a config error ([mcp](https://code.claude.com/docs/en/mcp)). Its tools stay **non-blocking**. Each tool records the event and returns at once, because HTTP requests time out after 60 s.

| Tool | Who may call | Server action |
|---|---|---|
| `brief(plan, assignments[{cat, goal}])` | root cat during BRIEFING | Saves the plan. The webview plays the meeting |
| `delegate(cat, task, context?)` | parent → direct child only | Creates a `TaskNode`. Injects `[Задача от <boss>] …` into the child's stdin |
| `report(taskId, status, result)` | child → its parent | Closes the node. Injects the result into the parent's stdin (`priority:"next"`) |
| `ask(cat, question)` / `reply(msgId, text)` | any cat → any cat (policy) | Peer help. Injected into the target and returned the same way |
| `list_team()` | any | Returns the subtree, roles and the status of each cat |

Hierarchy, policy, budget and loop limits all run in server code. There is no depth limit. Every message is a server event, so (3) needs no transcript scraping. Tool activity still comes from the JSONL watcher that `launchHeadlessAgent` already wires (`agentRuntime.ts:314`).

| Need | Result |
|---|---|
| (1) Any depth | **Yes** (server tree) |
| (2) Persona | **Yes**: `--append-system-prompt[-file]`, `--model`, `--effort`, tool allow/deny per cat |
| (3) Observable messages | **Yes**: structured, from/to/kind/text, before delivery |
| (4) Terminal | Chat console with input (exact). Real TUI only through a "take the wheel" handoff (see B) |
| (5) Cost/complexity | Medium code (MCP server, router, state machine). Tokens = sum of the cats' turns |
| (6) Stability | Only GA flags: `-p`, stream-json, `--mcp-config`, `--append-system-prompt` |

### A3-alt. Native cross-session messaging as the transport

Source: [cross-session-messaging](https://code.claude.com/docs/en/cross-session-messaging). Needs v2.1.224+ and has no flag. `-p` sessions bind an inbox socket ("a long-running `-p` worker can receive messages"). `--bare` sessions do not. Tools: `ListAgents`, `SendMessage`, plain text only. A session that bypasses permissions **holds** inbound messages unless the sender also bypasses, or unless `crossSessionInbound: "accept"` is set in `--settings`. The socket wire format is not documented beyond the auth line. The server cannot enforce the hierarchy and sees messages only in transcripts. **Verdict:** do not use it for the tree. You can allow it as an optional peer channel, or deny `SendMessage`/`ListAgents` to keep all traffic visible.

### A4. Claude Agent SDK (TypeScript) as the runtime

Source: [agent-sdk/overview](https://code.claude.com/docs/en/agent-sdk/overview), [typescript](https://code.claude.com/docs/en/agent-sdk/typescript). The SDK is "a library that runs the Claude Code binary". It uses the same stream-json protocol as A3, with types. Extras: `createSdkMcpServer()` (in-process tools, no HTTP, no 60 s limit), in-process hook callbacks, `interrupt()`, `setModel()`, `setPermissionMode()`, `streamInput()`, and `systemPrompt` as `{type:'preset', preset:'claude_code', append}`. Constraints: teams do not spawn under the SDK (agent-teams line 62). The overview says: "Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK. Use the API key." **Verdict:** same capability as A3. Prefer raw CLI spawning now, because catavasia already spawns `claude -p` and works on the user's login. Move to the SDK only if in-process MCP tools or typed control requests become worth a new dependency.

### A5. Channels (research preview), noted for completeness

[channels](https://code.claude.com/docs/en/channels): an MCP server with the `claude/channel` capability pushes events into a running session, interactive ones included. "Channels are in research preview". Custom channels need `--dangerously-load-development-channels`, and the flag does not show in `--help`. This is the only documented way to push into a live **interactive** TUI session. Keep it as a future path for "real TUI always" (each cat as a PTY TUI + office channel). It is not production-grade today.

## B. Live terminal in the browser

1. **Chat console over stream-json (default).** The server already parses stream-json (`server/src/taskBoard/streamJson.ts`). Render assistant text, tool calls (folded, with the narrator's plain-language line), and inbound office messages. The input box sends `{"type":"user","message":{...},"origin":{"kind":"human"},"priority":"now"}`. With `now`, Claude moves background-capable work aside and reads the message in the same turn (v2.1.286+). No PTY dependency. It is safe, because one process owns the session.
2. **Real TUI handoff ("take the wheel").** Upstream PR [#347](https://github.com/pixel-agents-hq/pixel-agents/pull/347) (`feat/standalone-terminal`, OPEN, 3 commits ahead of upstream `main` 3537e14, the exact base of catavasia) adds `server/src/terminal/ptySessionManager.ts` (`@lydell/node-pty`, headless-xterm mirror with replay), `terminalRoutes.ts` (token-auth WS `/terminal/:agentId`), `wsAuth.ts`, and webview `TerminalDrawer.tsx`/`TerminalPane.tsx`/`terminalClient.ts` (xterm.js), plus `--no-terminal`. Design doc: `docs/design/standalone-terminal.md` on that branch. Its README line about `--no-terminal` already exists in catavasia `README.md:117`, but the code is not on main. Reuse: cherry-pick the PR. Handoff flow: wait for the cat's `result` (idle), close its stdin and let it exit. Spawn `claude --resume <sessionId> --mcp-config … --model …` in a PTY. When the user closes the drawer, end the PTY and respawn the stream-json driver with `--resume`. The persona survives, because the system prompt record is reused on resume.
3. **Can an interactive session and a headless driver share one ID at the same time?** **No.** The docs say that two resumers interleave messages into one transcript. Nothing locks a foreground `-p` session (the "opens the running session" rule covers only **background** sessions). Run one owner at a time and let the server hold a per-cat mutex.
4. Background `--bg` + `claude attach` in a PTY gives a permanent real TUI. But the server then cannot inject delegations (A2). Reject it unless channels (A5) leave preview.

## C. Narrator (Haiku 4.5)

**Process.** `MAX_THINKING_TOKENS=0 claude -p --input-format stream-json --output-format stream-json --verbose --model haiku --tools "" --no-session-persistence --system-prompt-file narrator.md`. Optional: `--json-schema` for the output shape, `--safe-mode` or `--setting-sources ""` to skip user hooks and plugins. `--bare` would need an API key. Verified: the `haiku` alias resolved to `claude-haiku-4-5-20251001` (init event). `MAX_THINKING_TOKENS=0` disables thinking on Haiku ([env-vars](https://code.claude.com/docs/en/env-vars)). Without it, the measured turns spent 226 and 174 thinking tokens.

**Measured** (2 turns, tiny prompt):

| Setting | Turn input / output | Cost per turn |
|---|---|---|
| Thinking on | 616 in / 314 out (226 thinking) | $0.0022 |
| Thinking off | 588 in / 138 out | $0.0013 |

Haiku also invented a "file saved ✓" line that no event supported. The prompt must forbid claims that no event supports.

**Pricing** ([pricing](https://platform.claude.com/docs/en/about-claude/pricing)), Haiku 4.5 per MTok: input $1, 5-min cache write $1.25, 1-h cache write $2, cache hit $0.10, output $5. Context window 200K ([models overview](https://platform.claude.com/docs/en/about-claude/models/overview)). The minimum cacheable prompt is **4,096 tokens** on Haiku 4.5 ([prompt-caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)). Pad the static system prompt (rules + few-shot examples) past 4,096 tokens so that it caches.

**Batching.** The server reduces raw events to compact lines (`t=12.4 Мурка tool=Bash "npm test"`, `Барсик→Мурка delegate "…"`). It drops duplicates, collapses consecutive Read/Grep calls into one line, and truncates args to 120 characters. Flush every 5 s, or at once on a high-value event (delegate/report/brief/final). Skip the flush when nothing changed. Between flushes, the game uses the deterministic `formatToolStatus` that already exists.

**Cost estimate per hour of active office** (5 working cats, ~1 raw event/s, 1.5k event tokens per batch, 150 output tokens):

| Design | Per call | Calls/h | $/h |
|---|---|---|---|
| Stateless batch: cached 4.5k system prompt (hit $0.00045) + 2k fresh ($0.002) + out ($0.00075) | ≈$0.0032 | 720 (5 s) / 360 (10 s) | **≈$2.3 / ≈$1.2** |
| Rolling session, rotate at 30k: avg 13k cache hit ($0.0013) + 1.5k cache write ($0.0019) + out | ≈$0.004 | 720 / 360 | ≈$2.9 / ≈$1.4 |

For scale: the one finished catavasia task in `~/.pixel-agents/tasks.json` cost **$0.53** for a 3-turn, 18-s run on the default model. The narrator is a few percent of what the cats spend. On a Pro/Max login, these numbers count against plan limits, not dollars ([costs](https://code.claude.com/docs/en/costs)).

**Context growth.** Prefer the stateless pattern on the same long-lived process: every batch carries a server-made `state` block (cats, current task node, last 3 summaries). The model needs no history. Rotate the process (kill + respawn) at 30k input tokens or every 30 min. The `usage` field in each `result` gives the count. Do not depend on auto-compaction, because it is slower and less predictable (`--autocompact`, `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` exist).

**Output schema** (one JSON object per batch, validated server-side, and dropped when invalid):

```json
{ "cats": [{ "id": "c1", "state": "working|thinking|talking|waiting|idle|blocked|done",
             "bubble": "≤60 chars RU", "activity": "≤40 chars RU, present tense" }],
  "conversations": [{ "msgId": "m42", "summary": "≤140 chars RU: who asked what / what was answered" }],
  "task": { "phase": "briefing|delegating|working|reporting|final", "headline": "≤80 chars RU" } }
```

Rules in the prompt: Russian only. No commands, paths, flags or code. Mention only facts that are present in events. Bubbles ≤60 chars, and the server cuts at 60 with `…`.

## D. Data model and UI spec sketch

```ts
interface CatProfile { id: string; name: string; role: string;          // "тимлид", "тестировщик"
  persona: string;                     // appended system prompt (markdown)
  model: 'opus'|'sonnet'|'haiku'|string; effort?: 'low'|'medium'|'high';
  appearance: { base: BreedId; fur: RGB; shade: RGB; light: RGB; belly: RGB; stripe?: RGB;
                eye: RGB; collar?: RGB; pattern: 'solid'|'tabby'|'tuxedo'|'calico'|'tortie' };
  tools?: { allow?: string[]; deny?: string[] }; permissionMode: 'bypassPermissions'|'acceptEdits'|'plan';
  cwdPolicy: 'shared-task-worktree'|'own-worktree' }
interface OrgTree { rootId: string; parentOf: Record<catId, catId|null>; order: Record<catId, number> }
interface CatRuntime { catId; sessionId; pid?; owner: 'driver'|'pty'|'none'; agentId /* office char */;
  status: 'offline'|'idle'|'working'|'waiting'; costUsd; contextTokens }
interface OfficeTask { id; prompt; rootCat; phase: Phase; nodes: TaskNode[]; result?; costUsd }
interface TaskNode { id; parentNodeId?; from: catId; to: catId; goal; status: 'open'|'working'|'reported'|'failed'; result? }
interface OfficeMessage { id; taskId; from: catId|'user'; to: catId|'user'; kind: 'brief'|'delegate'|'report'|'ask'|'reply'|'final'|'human';
  text: string; summary?: string /* narrator */; ts }
```

Store `cats.json` and `org.json` in `~/.pixel-agents/` next to `tasks.json`. Reuse `fileStateAdapter.ts` and the atomic-write pattern in `layoutPersistence.ts`.

**Task flow state machine** (server-owned, one per OfficeTask):

| # | Phase | Enter | Exit criterion (observable) | On fail |
|---|---|---|---|---|
| 1 | GATHER | user submits task | every online cat seated in the meeting Area (webview ack) or 20 s | start anyway |
| 2 | BRIEFING | root cat gets task + team list | root calls `brief(...)` | 2 nudges, then the root delegates without a brief |
| 3 | DELEGATING | brief saved | each assignment becomes a `delegate` node | — |
| 4 | WORKING | nodes open | all child nodes `reported`/`failed` (recursive, any depth) | per-node timeout → parent is told |
| 5 | REPORTING | leaves reported | each parent reports up when its children close | — |
| 6 | FINAL | root `report(taskId=root)` | result shown to the user, cats return to desks | error state shown |

Guards: budget per task (cumulated `total_cost_usd` from each cat's `result`) and per-cat `--max-budget-usd`. Max messages per node. Loop detection on `ask` (A↔B ping-pong more than N times).

**New server → webview messages** (add to `core/asyncapi.yaml`, regenerate `messages.ts`): `catsUpdated`, `orgUpdated`, `officeTaskUpdated{phase,nodes}`, `meetingStart{areaLabel, seats[], speakerCatId}` / `meetingEnd`, `catWalkTo{catId, targetCatId|seat}`, `officeMessage{OfficeMessage}` (the cat walks to the target, then the bubble shows), `narration{cats[], conversations[], task}`, `catConsoleLine{catId, line}` (chat console), `terminalSessionOpened/Closed` (from PR #347). Client → server: `createCat/updateCat/deleteCat`, `setOrg`, `submitOfficeTask`, `catInput{catId,text}`, `takeWheel/releaseWheel{catId}`.

**What already exists to reuse:**

| Need | Existing code |
|---|---|
| Spawn headless cat + character + transcript watch | `AgentRuntime.launchHeadlessAgent/finishHeadlessAgent` (`server/src/agentRuntime.ts:314`), `TaskManager.spawnRun` |
| stream-json parsing, cost/turns | `server/src/taskBoard/streamJson.ts` (`parseStreamLine`, `StreamResult`) |
| Worktree per task | `server/src/taskBoard/gitWorktree.ts` |
| Tool activity text | `formatToolStatus` in `providers/hook/claude/claude.ts`, `ToolOverlay.tsx` (hover label) |
| Walking/pathfinding/seats | `findPath` (`office/layout/tileMap.ts`), `Seat`, `Character.path` (`office/types.ts`), seat logic in `characters.ts`/`officeState.ts` |
| Meeting room | Areas (`OfficeLayout.areas/areaTiles`, CHANGELOG #316). Add a label such as `meeting`, and seat cats on chairs inside it |
| Cat looks | `scripts/cats/breeds.mjs` (`BREEDS` = palette fields + `pattern` fn), `poses.mjs` `renderCatFrames`, pure JS label grids. Can run at runtime on the server (pngjs) for custom cats. Palette + `hueShift` already flow server→webview |
| Team visuals (lead badge, links) | v1.4.0 team rendering (`teamUtils.ts`, `leadAgentId`) can show boss→subordinate links |
| Bubbles | Only icon bubbles today (`bubbleType: 'permission'|'waiting'`). **New:** text bubble renderer |
| Embedded terminal | Upstream PR #347 (not merged) |

**UI.** "Коты" menu with two tabs. (1) Cats: list + editor (name, role, persona textarea, model, live sprite preview with colour pickers; `VisualColorPicker.tsx` exists). (2) Hierarchy: a tree with drag-to-reparent and one root. Click a cat → side panel with header (name, role, status, cost), chat console, input, "Взять управление" button. Hover a conversation bubble → narrator summary.

## E. Risks and open decisions

**Risks**
1. **Cost and rate limits:** N parallel Opus cats multiply spend. One sample task cost $0.53. Agent-teams docs advise Sonnet for teammates ([costs § agent team token costs](https://code.claude.com/docs/en/costs)).
2. **Memory:** 300–850 MB per Claude process (measured). With 8 cats + narrator, plan for 3–7 GB, or stop idle cats and `--resume` them on the next message (cold start + 5-min cache TTL loss).
3. **Session ownership:** concurrent driver + PTY on one ID corrupts the transcript. A per-cat mutex is required.
4. **Permissions:** today tasks run `--dangerously-skip-permissions`. Many cats with bypass in one repo is a large blast radius. Cross-session messages to bypass sessions are held by default.
5. **Model drift:** cats may ignore the tools and answer in prose. Mitigate with persona rules, server nudges, and a fallback that treats the final `result` text as a `report`.
6. **Narrator hallucination:** observed in the test. Validate the schema and keep facts grounded.
7. **Undocumented internals:** the team mailbox format and the inbox socket protocol are not stable interfaces. A3 does not depend on them.
8. **Upstream divergence:** PR #347 is open and may change. The cherry-pick touches `App.tsx`, `clientMessageHandler.ts` and `asyncapi.yaml`, which other agents in `~/catavasia` are editing now (`git status` shows modified `core/asyncapi.yaml`, `core/src/messages.ts`).
9. **Agent SDK auth note** if you later move to the SDK (A4).

**Open decisions for the user**
1. Transport: A3 custom MCP orchestrator (recommended), or Agent Teams for speed with a 2-level limit?
2. Cat terminal: chat console + "take the wheel" PTY (recommended), or PTY-first for every cat (needs channels preview)?
3. Workspace: all cats share one worktree per task, or one worktree per cat (no conflicts, harder merge)?
4. Peer talk: may any cat `ask` any cat, only siblings, or only up/down the tree?
5. Default models: boss Opus + workers Sonnet + narrator Haiku?
6. Cats always online (RAM, warm cache), or spawned on demand and stopped when idle?
7. Permission mode per cat: keep bypass, or `acceptEdits` + an allowlist?
8. Narrator cadence: 5 s (≈$2.3/h) or 10 s (≈$1.2/h)?
9. Cherry-pick upstream PR #347 now, or wait for the merge?
