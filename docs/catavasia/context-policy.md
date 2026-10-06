# Cat context policy: sessions, compaction, prompt files

Date: 2026-10-06. Status: design, not built. Installed CLI: `claude --version` → `2.1.290 (Claude Code)`.
User questions: agents never clear their chats; `/clear` or `/compact` after each task? The role prompt must never burn.
Related: [task-state-machine.md](task-state-machine.md) (`JoinMember` effect), [cat-ceo-judge.md](cat-ceo-judge.md) (who edits Rules and Lessons).

## 1. Decisions in short

- **A new session per cat per task.** This is a clear by construction. Phase 1 already does it. v2 keeps it and writes it down as a rule.
- **No `/compact` between tasks** and no session that lives across tasks. Cross-task memory lives in the cat's prompt file (`Rules`, `Lessons`), not in chat history.
- **The role never burns.** It is in the system prompt on every request. The system prompt survives compaction (docs + probe below).
- **Auto-compact only inside very long tasks**, at a 200K window per cat turn (`CLAUDE_CODE_AUTO_COMPACT_WINDOW=200000`).
- **One prompt file per cat**: `~/.pixel-agents/prompts/<catId>.md` with a locked `Role & conduct` section (user only) and `Rules` + `Lessons` sections (Cat CEO may edit). The server composes it into the per-task persona file at join time.
- **Prompt edits apply from the cat's next session.** The CLI records the system prompt once per session (snapshot on, the default). We do not turn the snapshot off.

## 2. Verified facts

All probes ran on 2026-10-06 with CLI 2.1.290, model `claude-haiku-4-5-20251001`, `-p --input-format stream-json --output-format stream-json`, scratch scripts `probe.sh` and `probe2.sh` (session scratchpad, not committed).

| # | Fact | Source |
| :- | :- | :- |
| F1 | `--append-system-prompt-file` and `--system-prompt-file` exist. The file form loads text from a file. | [cli-reference, CLI flags](https://code.claude.com/docs/en/cli-reference); `claude --help` (`--bare` entry lists `--system-prompt[-file], --append-system-prompt[-file]`) |
| F2 | By default the CLI builds the system prompt on the session's first request, records it, and reuses the record on every later request **and on `--resume`**, until the conversation is compacted. Different flag text on a later launch takes effect after compaction or in a new conversation. | [cli-reference § System prompt flags in resumed conversations](https://code.claude.com/docs/en/cli-reference#system-prompt-flags-in-resumed-conversations); `claude --help` `--system-prompt-snapshot <on\|off>` |
| F3 | Probe: turn 1 with `sysA.md` (codeword APPLE), turn 2 `--resume` with `sysB.md` (PEAR) → answer `APPLE`. The record wins. | probe.sh T1, T2 |
| F4 | Probe: `--resume` with `sysB.md --system-prompt-snapshot off` → `PEAR`, and the request had `cache_read_input_tokens: 0`, `cache_creation_input_tokens: 10605`. A changed system prompt rebuilds the whole cache. | probe.sh T3 |
| F5 | Probe: snapshot off with the **same** text on both turns keeps the cache: turn 2 read 10,212 and wrote 242. | probe2.sh |
| F6 | The system prompt survives compaction ("System prompt and output style: Both still apply"). Project-root CLAUDE.md is re-injected from disk. | [context-window § What survives compaction](https://code.claude.com/docs/en/context-window#what-survives-compaction) |
| F7 | `/compact` works as a `-p` stream-json user message. Events: `system/status: compacting`, then `system/compact_boundary` with `compact_metadata {trigger: "manual", pre_tokens: 10809, post_tokens: 734}`, then `result/success` with an empty text. That call cost $0.0057 on a 10.8K-token Haiku session (delta of the cumulative `total_cost_usd`: $0.0446 → $0.0504). | probe.sh T4 |
| F8 | After that `/compact`, the next `--resume` with `sysB.md` answered `PEAR`: compaction re-renders the system prompt from the flags of the current launch. | probe.sh T5 |
| F9 | `/clear` works as a `-p` stream-json user message. It emits `{"type":"conversation_reset"}` and continues under a **new session id** (`init` and `result` carry the new id). The old id stays on disk. | probe.sh T6 |
| F10 | `-p` mode: user-invoked skills and custom commands work; built-in commands that only run in the terminal UI (for example `/login`) do not. The docs do not list `/compact` or `/clear`; F7 and F9 are measured, not documented. | [headless](https://code.claude.com/docs/en/headless) note "Command support differs in `-p` mode" |
| F11 | Auto-compact window settings: `/autocompact <n>`, `autoCompactWindow` setting, `--autocompact <auto\|tokens>` flag ("100k–1M tokens"), env `CLAUDE_CODE_AUTO_COMPACT_WINDOW` (plain integer 100000–1000000, wins over all others, capped at the model window). `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` (1–100) can only lower the trigger. `DISABLE_AUTO_COMPACT=1` turns it off. | [model-config § Set the auto-compact window](https://code.claude.com/docs/en/model-config#set-the-auto-compact-window); [env-vars](https://code.claude.com/docs/en/env-vars); `claude --help` |
| F12 | Default threshold without a window: compact at the model's context limit. Native-1M models compact at about 967K. Sonnet 4.6 / Opus 4.6 without extended context compact at 200K. | [model-config § Default auto-compact thresholds](https://code.claude.com/docs/en/model-config#default-auto-compact-thresholds) |
| F13 | `/compact` sends a summarization request with the same prefix plus the whole history. Warm cache: cheap reads. Cold cache (after the TTL): the full history is reprocessed uncached. "When you want a fresh start instead of continuity, `/clear` costs nothing." | [prompt-caching § Compacting the conversation](https://code.claude.com/docs/en/prompt-caching#compacting-the-conversation); [costs](https://code.claude.com/docs/en/costs) |
| F14 | `--resume <id>` finds a session from any directory since v2.1.223 (current project and its worktrees first). | [sessions § Resume a session](https://code.claude.com/docs/en/sessions) |
| F15 | The CLI writes the prompt cache with the 1 h TTL (`ephemeral_1h_input_tokens`), and a resumed turn reads the prefix. Boss Sonnet: turn 2 read 36,085 and wrote 263. | ROADMAP, Phase 1 decisions (measured 2026-10-06); probe.sh T1/T2 usage (`ephemeral_1h_input_tokens: 10216`, then read 10,216) |
| F16 | The CLI default prefix is shared across sessions: a brand-new session read 6,257 cached tokens on its first request. | probe2.sh turn 1 |
| F17 | Aliases on this machine: `opus` → `claude-opus-5-5`, `sonnet` → `claude-sonnet-5-5` (`init` event `model`). | probe runs 2026-10-06 |
| F18 | List prices per MTok (input / 1h cache write / cache read / output): Opus 5.5 $4 / $8 / $0.20 / $20; Sonnet 5.5 $2 / $4 / $0.20 / $10; Haiku 4.5 $1 / $2 / $0.10 / $5. | [pricing](https://platform.claude.com/docs/en/about-claude/pricing) |

**Phase 1 session reuse (code).** `Orchestrator.join()` makes `sessionId: crypto.randomUUID()` per cat **per task** and writes `orchestrator/<taskId>/<catId>.md` from `personaText(cat)`. Every turn of that cat in that task runs `--resume <id> --append-system-prompt-file <that file>` (`claudeAdapter.ts`). A new task gets a new member and a new session. So cats already start clean on every task. The chat that "never clears" is the one session of one task; it grows across that task's turns only. The cat console's follow-up messages resume that task session after the task.

Correction to ROADMAP phase 1: "a session is bound to its cwd" was true before v2.1.223 (F14). It no longer forces a session per task. The per-task session stays for the reasons in §3.

## 3. New session per task vs `/compact` per task

Base numbers: the cat's request prefix is about 36K tokens (F15), of which about 6K is the shared CLI default (F16). Assume a task ends with a 100K-token history.

| | New session per task (chosen) | One session per cat + `/compact` after each task |
| :- | :- | :- |
| Cost at the next task, cache warm | First request writes about 30K: Sonnet 5.5 $0.12, Opus 5.5 $0.24 (F18) | Summary request reads 100K ($0.02) + writes a summary of about 3K output (Sonnet $0.03, Opus $0.06), then the next request writes the new conversation layer (summary + task message). Comparable. |
| Cost, cache cold (> 1 h between tasks) | Same as warm: about $0.12 / $0.24 | Summary request reprocesses 100K uncached: Sonnet $0.40, Opus $0.80, plus the above (F13) |
| What the cat sees | Role + Rules + Lessons + the task. Nothing stale. | A model-made summary of an unrelated task, old branch names, old worktree paths |
| Prompt edits | The new session renders the current file | Compaction re-renders it too (F8) |
| Determinism for review | Each task = one transcript, one prompt version | Summaries mix tasks; the Cat CEO cannot tie a score to one prompt version |
| RAM | Same (process per turn) | Same |

Decision: new session per cat per task. `/clear` is not needed as a command: a new `--session-id` is the same thing (F9) and the server already owns the id. Memory that should outlive a task goes into `Lessons` through the Cat CEO ([cat-ceo-judge.md](cat-ceo-judge.md)).

## 4. Compaction inside a task

- Each cat turn sets env `CLAUDE_CODE_AUTO_COMPACT_WINDOW=200000` (F11). Reason: every tool call re-sends the prefix. At 900K context one Opus 5.5 request costs 900K × $0.20/MTok = $0.18 in cache reads alone; at 200K it costs $0.04. A turn with 40 tool calls: about $7.20 against $1.60.
- The role survives (F6, F8). CLAUDE.md is re-injected (F6).
- The office does not send `/compact` itself. A task that compacts is a signal: the stream shows `compact_boundary` with `trigger: "auto"`; the interpreter logs it as `CompactHappened{catId, preTokens, postTokens}` and the Cat CEO sees it in its digest.
- The constant lives in `server/src/constants.ts` as `CAT_AUTO_COMPACT_WINDOW = 200_000`. Settings do not expose it.

## 5. Per-cat prompt file

### 5.1 Location and source of truth

- `~/.pixel-agents/prompts/<catId>.md`, one file per cat, plus `cat-ceo.md` for the judge.
- The folder is a local git repo (`git init`, no remote). Every change is one commit ([cat-ceo-judge.md](cat-ceo-judge.md) §7).
- The file is the only source of the cat's prompt text. `cats.json` drops `systemPrompt`. The wire field `CatProfile.systemPrompt` stays and carries the `Role & conduct` body, so the Cats menu contract does not change.

### 5.2 Format

```markdown
<!-- catavasia cat prompt v1 · cat: murka · do not rename the headings -->

# Role & conduct
<!-- LOCKED: only the user edits this section (Cats menu). The Cat CEO never changes it. -->
You are a careful front-end worker. ...

# Rules
<!-- The Cat CEO may add, replace or remove items. One line per item. -->
- [R1] Run `npm test` in your folder before you report. (task 9f2c, 2026-10-07)
- [R2] ...

# Lessons
<!-- The Cat CEO may add, replace or remove items. One line per item. -->
- [L1] The webview tests need `npm run build:core` first. (task 9f2c, 2026-10-07)
```

Parser rules (`server/src/orchestrator/promptFile.ts`):

- Exactly three H1 headings, in this order: `Role & conduct`, `Rules`, `Lessons`. The HTML comments are fixed text that the server writes.
- Rules and Lessons hold only list items of the form `- [R<n>] text` / `- [L<n>] text`, optional suffix `(task <id>, <date>)`. Ids never repeat inside one file (the next id = max + 1).
- A file that fails to parse is not used. The server uses the last committed version and shows an error in the Cats menu.

### 5.3 Size caps

| Part | Cap | Reason |
| :- | :- | :- |
| Role & conduct | 20,000 chars (`CAT_SYSTEM_PROMPT_MAX_CHARS`, unchanged) | Same limit as today's `systemPrompt` |
| One Rules or Lessons item | 280 chars | One idea per line |
| Rules | 12 items | Rules stay a short checklist |
| Lessons | 20 items | The Cat CEO must replace or remove before it adds past the cap |
| Whole file | 32 KB | Hard stop for hand edits |

Rules + Lessons at the cap ≈ 32 × 280 = 9K chars ≈ 2.3K tokens. That is under 7 % of the 36K prefix (F15).

### 5.4 Who edits what

| Section | User (Cats menu) | Cat CEO | Hand edit on disk |
| :- | :- | :- | :- |
| Role & conduct | Yes | Never (validator rejects) | Allowed; committed as `user(<cat>): manual edit` at next load |
| Rules | Yes (delete an item, revert) | add / replace / remove items | Allowed, same commit rule |
| Lessons | Yes (delete an item, revert) | add / replace / remove items | Allowed, same commit rule |

## 6. How the prompt reaches the engine

At `JoinMember` (when a cat joins a task) the server composes the persona file `orchestrator/<taskId>/<catId>.md`:

1. Intro line (name, cat id, role) — `personaText` today.
2. The cat's prompt file: `Role & conduct`, then `Rules`, then `Lessons`, headings kept.
3. `## Office rules` (server text, `flowPrompts.ts`).

The member records `promptSha` = the prompts repo `HEAD` commit for that file at join time. The Cat CEO review ties scores to this sha ([cat-ceo-judge.md](cat-ceo-judge.md) §8).

**Claude Code.** Every turn passes `--append-system-prompt-file <persona file>` (unchanged). The first request of the session records it (F2). Later turns reuse the record. A Cat CEO edit made during the task does not reach the running session. It reaches the cat's next task. The Cat CEO reviews after `done`, so the cat's next work is a new session anyway; in practice the edit applies at once. Cat console follow-ups on an old task session keep the old prompt. We keep the snapshot on: turning it off mid-task rebuilds the whole cache (F4) and changes behaviour inside one task.

**Codex (later).** The Codex adapter passes the same composed text with `-c developer_instructions="<TOML string>"` on `codex exec` and on `codex exec resume`. Research (2026-10-06, `codex-adapter.md` in the session scratchpad, not committed): the value applied and persisted into a resumed turn. Not verified: whether a different value on resume replaces the stored one. The design does not depend on it, because the per-task text never changes inside a task. `AGENTS.md` in the cwd loads as project instructions on Codex, like CLAUDE.md on Claude.

## 7. Implementation plan

1. `server/src/orchestrator/promptFile.ts`: `parsePromptFile`, `renderPromptFile`, caps from §5.3. Test: `__tests__/promptFile.test.ts` (round trip, bad headings, item over cap, id reuse refused).
2. `server/src/orchestrator/promptRepo.ts`: `ensureRepo()` (`git init` in `~/.pixel-agents/prompts`, local `user.name catavasia`), `read(catId)`, `commit(catId, text, message)`, `log(catId)`, `diff(sha)`, `revert(sha)`. Uses `execFile('git')` like `taskBoard/gitWorktree.ts`. Test: temp HOME, commit, log, revert.
3. Migration in `catProfiles.ts` load: for each cat without a prompt file, write one with `Role & conduct` = old `systemPrompt`, empty Rules and Lessons, one commit `user(<cat>): import from cats.json`. Then save `cats.json` without `systemPrompt`. Test: old `cats.json` fixture → files + one commit each; second load makes no commit.
4. `orchestrator.ts join()`: compose the persona from the prompt file (§6), store `promptSha` on the member. Test: `catOfficeFlow.test.ts` asserts the persona file holds the three headings and the office rules.
5. `claudeAdapter.ts spawnTurn`: add `CLAUDE_CODE_AUTO_COMPACT_WINDOW` to the child env; parse `compact_boundary` into a log entry. Test: unit test on the args/env builder and on a recorded `compact_boundary` line.
6. Cats menu: Role edits go to `promptRepo.commit` as `user(<cat>): edit Role & conduct`; Rules and Lessons show read-only with a delete button per item. Test: webview unit test; server test that a Role edit through `saveCatProfile` commits once.

## 8. Open questions

None blocking. Recorded hypotheses, not decisions:

- H1: `--exclude-dynamic-system-prompt-sections` moves the cwd and git status out of the system prompt, so one cat's system prompt could be identical across tasks and its first request could read the cache. Confirm: two tasks of one cat within 1 h, compare `cache_read_input_tokens` of the first request with and without the flag.
- H2: The `/compact` and `/clear` stream-json behaviour (F7, F9) is measured, not documented. Nothing in v2 depends on it.
