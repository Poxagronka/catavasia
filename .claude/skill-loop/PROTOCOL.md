# Skill-run protocol

Every skill in `.claude/skills/` runs as a state machine under this protocol.
A skill states only its own states. This file holds everything the skills
share. Read it whole before the first state of a run.

## 1. Why

- **The state machine makes each step checkable.** A state ends only when its
  exit evidence is in the state file. A reader, the judge or a resumed session
  can see what was proved and what was only said.
- **The judge and the ledger make each run improve the skill.** An independent
  judge reads the transcript and names the skill edit behind each defect. The
  run applies the edits and writes one ledger line. The next run must beat that
  line: a hill climb on the skill text.

| Kind    | Skills          | Tail                                                                                      |
| ------- | --------------- | ----------------------------------------------------------------------------------------- |
| loop    | `add-furniture` | JUDGE → IMPROVE → LEDGER after EVERY run                                                  |
| utility | none yet        | none, and no state file. The tail runs only when the user asks ("judge this run"), see §3 |

## 2. The state file

```bash
MAIN=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")  # main checkout, also from a worktree
RUN=$(date -u +%Y-%m-%d-%H%M)                                                # run id, UTC
DIR="$MAIN/.skill-runs/<skill>/$RUN"                                         # run dir; .skill-runs/ is gitignored
SHA=$(git rev-parse --short HEAD)                                            # run in the checkout the skill was read from
[ -n "$(git status --porcelain -- .claude/skills/<skill> .claude/skill-loop)" ] && SHA="$SHA+dirty" \
  && mkdir -p "$DIR/skill" && cp -R .claude/skills/<skill> .claude/skill-loop "$DIR/skill/"
```

A loop skill writes the state file `$DIR/state.md`, by absolute path, never a
worktree copy. Rewrite it whole at every transition, as the last act of the
state that ends. A compacted or resumed session continues from the file, never
from memory. Keep it under ~80 lines: one line per fact. A `+dirty` sha tells
the judge to read the START copy in `$DIR/skill/`: the working tree changes
after the run.

```markdown
skill: add-app · run: 2026-09-24-0944 · state: VERIFY · skill@64b72f6

## Facts

- transcript: ~/.claude/projects/-Users-poxagronka-catavasia/<session>.jsonl
- skill checkout: /Users/poxagronka/catavasia
- branch: feat/add-app-bwa (worktree .claude/worktrees/add-app-bwa) | none
- input: <what the user asked, quoted>
- retries: RESEARCH×1
- questions: 2

## Decisions

- D1 · <assumption taken> · <why: file:line or the user's words>

## Evidence

- GATHER → RESEARCH · `grep -n BWA modals/adset_modal.py` → no hit
- RESEARCH → EDIT · campaign/list: 4 campaigns, itunes 6780872690

## Gaps

- G1 · SKILL.md step 3 · the command misses `--platform` · add it

## Done

- commit a1b2c3d · PR #43 draft
```

- **Facts** hold inputs, paths and counters. **Decisions** hold each assumption
  taken instead of a question, with its reason.
- **Evidence** holds one line per transition: the command, file:line, URL or
  tool result that meets the exit criterion.
- **Gaps** hold skill corrections seen during the run. Apply them only in
  IMPROVE, never mid-run.
- **Done** holds what landed: commits, PR, files, messages sent.
- At START, look for an older run dir of the same skill whose state is not
  `END`. Ask through AskUserQuestion: resume it or start new.

## 3. How a skill declares its machine

Each SKILL.md holds ONE table in this shape:

```markdown
| #   | STATE   | Exit criterion (observable, with its evidence)                                   | On fail                            |
| --- | ------- | -------------------------------------------------------------------------------- | ---------------------------------- |
| 0   | START   | `state.md` exists with the header line and Facts `transcript:` (PROTOCOL §2, §6) | stop and report the error          |
| 1   | GATHER  | app key, prefix and platforms in Facts, each quoted from the user or a file:line | BLOCKED: ask for the missing field |
| …   | …       | …                                                                                | …                                  |
| n   | JUDGE   | see PROTOCOL §4                                                                  |                                    |
| n+1 | IMPROVE | see PROTOCOL §4                                                                  |                                    |
| n+2 | LEDGER  | see PROTOCOL §4                                                                  |                                    |
| n+3 | END     | the user has the outcome, and the state file says `state: END`                   |                                    |
```

Loop skills copy the START, JUDGE, IMPROVE, LEDGER and END rows exactly as
shown. The tail rows stay pointers: §4 is the one source of their exit criteria
and on-fail text. Utility skills write no state file. They copy these two rows
instead, and no tail rows:

```markdown
| #   | STATE | Exit criterion (observable, with its evidence)                                       | On fail                   |
| --- | ----- | ------------------------------------------------------------------------------------ | ------------------------- |
| 0   | START | the transcript holds one line `goal: <what the user asked>` before the first command | BLOCKED: ask for the goal |
| n   | END   | the user has the outcome                                                             |                           |
```

In a utility skill, Facts, Evidence, Decisions and Done name transcript lines.
To judge a utility run on request, the main session first writes the state
file (§2) from the transcript, then runs the tail (§4).

Rules for every machine:

- **One state at a time.** The header names it. Work of a later state does not
  start before the current state's exit evidence is in the file.
- **A transition needs its exit evidence written.** "Tests pass" is not
  evidence. The command and its result line are.
- **Every exit criterion is observable.** A row whose exit cannot be shown by a
  command, a file:line, a URL or a quoted user answer is a skill defect.
- **Any state may go to BLOCKED.** Write the exact question into Facts, ask it
  through AskUserQuestion (up to 4 per call, the recommended option first),
  then return to the state that blocked. A question the code or a file can
  answer is not asked: read it.
- **A state never re-runs silently.** Each retry adds to `retries:` in Facts
  with its reason in Evidence. A state that fails twice goes to BLOCKED.
- **The outcome is `done`, `blocked` or `abandoned`.** Report success only for
  `done` (CLAUDE.md: never report success for an incomplete result). A loop
  skill runs its tail whatever the outcome.
- **A loop skill inside another loop skill** (a skill run inside another skill's state) writes no state file and runs no tail. Its evidence goes into
  the outer state file, and the outer tail covers it (§4).
- **Delegation.** The main loop plans and reads. Code edits go to a subagent.
  Review before a PR is ONE medium code review run by one subagent. Never message an in-flight subagent.

## 4. The tail of a loop skill

The tail starts after the skill's last work state. A skill that opens a PR
runs the tail BEFORE its PR state, so the skill edits and the ledger line ride
in the same PR. The judge sees the run up to LEDGER, not the PR creation. END
follows the last state: SHIP, or LEDGER in a skill with no PR state.

| #   | STATE   | Exit criterion (observable, with its evidence)                                                                                                                | On fail                                                         |
| --- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| n   | JUDGE   | `$DIR/judge/verdict.md` exists and holds the `## Numbers` line                                                                                                | retry once, then LEDGER with `judge none` (§5) and skip IMPROVE |
| n+1 | IMPROVE | each verdict edit scored 50+ is applied or declined with a reason in Done; REVERT edits are undone; each SKILL.md is under 400 lines                          | record the edit in Gaps, say so to the user                     |
| n+2 | LEDGER  | the new line is the first run line, directly below the format line, and it is committed on the run's branch, or left in the working tree and the user is told | say so to the user                                              |

**JUDGE.** Fill `.claude/skill-loop/judge-brief.md` (every `<…>` slot above
its `## Hard rules`, nothing else: no summary of the run). Name each inner loop
skill (§3) and each subagent this run dispatched in their slots. Dispatch ONE
`skill-judge` subagent with it. Wait for its completion notice. Then read
`$DIR/judge/verdict.md`.

**IMPROVE.** Work from the verdict, then from Gaps. Edit the skill files on the
run's branch (its worktree), never the main checkout's copy.

- Undo first each previous edit the verdict marks REVERT: restore the old text
  the previous verdict quotes for that J-id
  (`$MAIN/.skill-runs/<skill>/<previous run id>/judge/verdict.md`). Do not
  `git revert`: that also removes the ledger line.
- Apply each edit scored 50 or more, or decline it with a reason in Done.
  "The skill already says it" is a valid reason: the defect was the run's.
  Apply an edit under 50 only when it makes the text shorter.
- Every edit lands with a check that fails without it, where one can exist:
  an exit criterion the next state file must show, a rubric line in
  `judge-brief.md`, a script argument, or a test.
- May change: the skill's own SKILL.md, its references and scripts, its
  ledger, `judge-brief.md`. The one exception: a defect the verdict tags with
  an inner skill's name may edit that inner skill's files. The inner ledger
  gets no line. May NOT change: hard rules, gates, the judge's independence
  and read-only rule, CLAUDE.md boundaries, any other skill, `PROTOCOL.md` and
  `transcript_digest.py` (these change only in a task the user asked for).
- An IMPROVE change to a non-doc file (a test added as an edit's check) voids
  the pre-PR receipt. Rerun VERIFY and REVIEW before the PR state.
- **Budget.** Add a line only when a line elsewhere goes or gets shorter, and
  let no file grow by more than ~5% in bytes. Check with `wc -lc` before and
  after. Each SKILL.md stays under 400 lines.
- **Stall rule.** When the two newest ledger lines both say `climb no` and both
  hold judge defects > 0, this IMPROVE rewrites the weakest section (the one
  with the most verdict defects) instead of adding text.

**LEDGER.** `.claude/skills/<skill>/ledger.md` is the heading
`# <skill> ledger`, a blank line, the format line, then the run lines newest
first. Write the line (§5) directly below the format line. The first run
replaces `(no runs yet)`. A skill with no ledger (a judged utility run) creates
it in this shape. Keep the newest 20. Commit the IMPROVE edits and the line
together on the run's branch: `chore(skills): <skill> run <run id> judge edits`.
The commit body lists `J<n>: file:line` for each applied edit. If the branch
was pushed, push again under the CLAUDE.md before-push rule. A run with no
branch (an investigation) leaves the edits and the line in the working tree.
Say so to the user, with the file list. The next run then finds those edits
with `git diff`, not `git log`. A rebase conflict keeps both lines, newest first.

## 5. The hill

The ledger line, one per run, newest first:

```
<run id> · skill@<sha> · outcome <done|blocked|abandoned> · states <n> · retries <n> · questions <n> (needless <n>) · judge defects <n> (≥75: <n>) · unverified claims <n> · wall <min> · edits <J-ids|none> · reverted <ids|none> · climb <axes|no: why>
```

- Counts come from the verdict's `## Numbers` line, never from the run's memory.
  `states` is the number of state transitions the state file records.
- `wall` is minutes from the run id to the LEDGER state. It is information
  only, not an axis.
- Edit ids are the verdict ids (`J1`, `J3`). `<run id>/J1` names one across runs.
- **Climb** = the run beats the previous line on at least one axis and loses
  none: (1) fewer judge defects scored ≥75, (2) fewer unverified claims,
  (3) fewer retries, (4) fewer needless questions.
- A run that does not climb writes `climb no: <why>`. The first run writes
  `climb first`. A JUDGE failure writes `judge none` in place of the fields
  from `judge defects` to `unverified claims`, and `climb no: judge none`. The
  next run skips that line and compares with the newest line that has a verdict.

## 6. Transcripts

- Main session: `~/.claude/projects/<slug>/<session-id>.jsonl`.
- Subagents: `~/.claude/projects/<slug>/<session-id>/subagents/agent-<id>.jsonl`.
  `--latest` lists them all, unrelated concurrent agents too. The judge brief
  names only the agents this run dispatched.
- `<slug>` is the directory the session started in, with every character that
  is not a letter or a digit replaced by `-`.
  `/Users/poxagronka/catavasia` → `-Users-poxagronka-catavasia`.
  A session started in a worktree has its own slug (`…--claude-worktrees-<name>`).
- At START, record `transcript:` in Facts: the first line printed by
  `python3 .claude/skill-loop/transcript_digest.py --latest "<session start dir>"`.
  The start dir is where the session began, often the main checkout, not the
  run's worktree. Not sure of it → `grep -l "$DIR" ~/.claude/projects/*/*.jsonl`
  after the state file exists.
- The judge reads transcripts only through the digest, one line per record:
  `transcript_digest.py <file> --since <run id> > <run dir>/judge/digest-<name>.txt`,
  then Read in slices. Never read a raw `.jsonl` or dump one into the chat.
