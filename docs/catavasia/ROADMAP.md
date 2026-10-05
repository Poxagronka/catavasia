# catavasia roadmap (user requirements, 2026-10-05)

Design research and evidence: [orchestration-spec.md](orchestration-spec.md).

## Integration step (after feat/idle-activities, feat/cat-playroom, feat/cat-social, feat/pet-care land)
1. Wire the social layer (talk, joint play, fights) into the idle-activity registry: coffee spot, playroom toys.
2. Pets join the idle pool: playroom toys, sofa sleep, fights. Pets never drink coffee.
3. Furniture: pet beds (round cushion, basket, radiator hammock, donut blanket) and cat houses (cardboard house with window, felt igloo cave, wooden house with roof, two-storey condo). Sleeping inside shows only ears or tail. Pets get a new need "sleep/energy" and walk to the nearest free bed/house. Agent cats may sleep there too, as an idle variant.
4. Spot reservation (requirement): a cat (agent or pet) reserves a spot (seat, bed, house, toy, bowl) when it STARTS walking to it. No other cat may target a reserved or occupied spot.
5. Contention (requirement): when two cats claim the same spot at the same moment (idle choice or need), there is a probability of a fight, using the social-layer fight scene. The loser picks another spot.

## Orchestration (spec: orchestration-spec.md). User decisions
- Engine: own orchestrator. Each cat is a long-lived `claude -p` stream-json session owned by the catavasia server. An HTTP MCP server in Fastify gives the tools brief, delegate, report, ask, reply, list_team. The server enforces the hierarchy.
- Worktrees: one worktree per worker cat. The boss merges the workers' branches into the task branch.
- Models: boss Opus, workers Sonnet, narrator Haiku 4.5. Each can be changed per cat.
- Lifecycle: sessions run on demand, sleep after 1 hour of idle, and resume. Rationale (user): by then the prompt cache has expired anyway, so a live process gives no saving. Tie the threshold to the session's real cache TTL: read it from the stream-json usage fields (ephemeral 5m vs 1h cache creation) and verify. Default 1 h as a constant with --resume. The cat stays visible in the game.
- Defaults I chose: ask goes up/down the tree plus siblings. The narrator batches every 10 s. Permissions are skipped, as for tasks. Reuse upstream PR #347 (PTY + xterm.js) in the fork.
- Terminal: a chat console by default. "Take the wheel" opens a real `claude --resume` PTY when the cat is idle. A per-cat lock prevents two processes on one session.
- Narrator: one always-on Haiku session while the office runs. Short Russian text. The server validates its output against a schema.
- Office shows ONLY own cats from the Cats menu. External claude sessions appear as guests, behind a Settings toggle that is OFF by default.
- One session = one cat. Subagents are not shown (fix/one-cat-per-session in progress).
- The Cats menu: Agents tab (look, name, prompt, role, model, effort: passed as `--model` / `--effort`; list the values the installed `claude --help` accepts, do not hardcode from memory), Hierarchy tab (tree editor), Pets tab (create, name, colour/pattern from the shared editor with more colours).
- A task flows boss → briefing meeting (all cats gather in one room) → delegation down → work → reports up → result to the user. Cats walk to each other for every conversation. Speech bubbles appear, and hover shows the narrator summary.

## Resource budget (RAM) — plan to reach the goal cheaper
Measured 2026-10-05 on this Mac: one-shot `claude -p --model haiku` = ~305 MB peak RSS, 15.6 s wall time incl. the model reply. The research measured 300–850 MB per long-lived session.
1. PROPOSAL, needs user OK: process per turn, not per cat. The prompt cache lives on Anthropic's side, not in the local process. A cat process can exit right after its turn and `--resume` on the next message without losing the cache while the TTL holds. RAM is used only by cats that are working right now. The "sleep after 1 h" rule then only affects the game look, not RAM.
   Cost: a few seconds of startup per turn. Verify the cache-hit rate after a resume in the usage fields before relying on it.
2. Concurrency cap (user, 2026-10-05): at most N cats run a turn at the same time. Default 6. Settings offer 1 to 6 or more. Other cats queue. The game shows them waiting in line, for example at the coffee machine.
3. PROPOSAL, needs user OK (the user asked for an always-on narrator session): narrator without a resident process: templates in the server for routine events (read file, run tests, edit). Haiku only for conversation summaries and the task brief, in batched one-shot calls. A long-lived narrator process is not needed.
4. Leaf workers as subagents (optional): a worker that never delegates can run as a subagent inside its parent's process. That uses less RAM, but the user cannot open its own terminal. Off by default.
Expected peak: about N × 300–850 MB while N cats work, near 0 when the office is idle.

## Team modes — light team is a BACKLOG option (user, 2026-10-05)
Full team is the default. Light team stays in the backlog as a fallback switch, to build if the computer starts to hang (RAM).
- **Full team:** each cat is its own `claude` session (per-turn process, see the RAM plan). Hierarchy of any depth. Each cat has its own terminal in the game.
- **Light team:** only the boss is a `claude` session. Every other cat is a subagent of the boss, with its own prompt, model and skills from its cat profile (generated as subagent definitions). Low RAM: one process. Limits to verify before building: subagent nesting depth, whether a subagent definition can carry its own skills/model/effort, and how subagent events reach the game. A worker has no own terminal in this mode. Its activity shows through the parent session's subagent events (reuse the hidden subagent path from fix/one-cat-per-session: map each subagent to its cat instead of spawning a new character).
