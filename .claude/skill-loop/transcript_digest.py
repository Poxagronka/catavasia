"""Print Claude Code session transcript records as one line each (skill-loop judge input).

transcript_digest.py <file.jsonl> [--since RUN_ID|ISO]
transcript_digest.py --latest <session start dir> [--since RUN_ID|ISO]
"""

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path

parser = argparse.ArgumentParser(
    description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
)
parser.add_argument("transcript", nargs="?", help="a session or subagent .jsonl file")
parser.add_argument(
    "--since",
    default="",
    help="skip records older than this UTC run id (YYYY-MM-DD-HHMM) or ISO time",
)
parser.add_argument(
    "--latest",
    metavar="DIR",
    help="print the newest session transcript of the session start dir and its subagent transcripts",
)
args = parser.parse_args()
# a run id 2026-09-24-0944 becomes 2026-09-24T09:44, which compares as a prefix of the ISO timestamps.
since = re.sub(r"^(\d{4}-\d\d-\d\d)-(\d\d)(\d\d)$", r"\1T\2:\3", args.since)

if args.latest:
    # Claude Code names the project dir after the start directory, every non-alphanumeric character as "-".
    slug = re.sub(r"[^A-Za-z0-9]", "-", str(Path(args.latest).expanduser().resolve()))
    sessions = sorted(
        (Path.home() / ".claude/projects" / slug).glob("*.jsonl"),
        key=lambda p: p.stat().st_mtime,
    )
    if not sessions:
        raise SystemExit(
            f"no transcripts for {slug}: pass the directory the session STARTED in"
        )
    print(sessions[-1])
    # a subagent file last written before the run started is not part of the run.
    start = datetime.fromisoformat(since or "1970-01-01").replace(tzinfo=timezone.utc)
    for agent in sorted(
        (sessions[-1].parent / sessions[-1].stem / "subagents").glob("agent-*.jsonl")
    ):
        if agent.stat().st_mtime >= start.timestamp():
            print(agent)
    raise SystemExit(0)
if not args.transcript:
    parser.error("give a transcript file or --latest DIR")


def short(value: object) -> str:
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    # redact before the cut, so a cut never leaves a credential prefix behind.
    text = re.sub(
        r"(?i)(key|token|secret|password|authorization)(\W{1,4})[\w./+=-]{12,}",
        r"\1\2<redacted>",
        text,
    )
    text = re.sub(r"(?i)\b(bearer\s+)[\w./+=-]{12,}", r"\1<redacted>", text)
    text = re.sub(r"://[^:/\s]+:[^@\s]+@", "://<redacted>@", text)
    text = re.sub(r"\bxox[abprs]-[\w-]+", "<redacted>", text)
    text = re.sub(
        r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*", "<redacted private key>", text, flags=re.S
    )
    return " ".join(text.split())[:240]


def sender(text: object) -> str:
    # a subagent's report and a message from another session arrive as user turns.
    agent = ("<task-notification", "<agent-message", "Another Claude session")
    return "AGENT" if str(text).startswith(agent) else "USER"


blob = Path(args.transcript).read_bytes()
# a record still being written has no newline yet: leave it for the next read.
whole = blob[: blob.rfind(b"\n") + 1]

for raw in whole.splitlines():
    record = json.loads(raw)
    if since and str(record.get("timestamp", "")) < since:
        continue
    stamp = str(record.get("timestamp", ""))[11:19]
    if record.get("type") == "attachment":
        # a mid-turn owner message and a hook's text reach the model here, not as a turn.
        attachment = record.get("attachment") or {}
        text = attachment.get("content", "")
        if isinstance(text, list):
            text = " ".join(str(item) for item in text)
        if attachment.get("type") == "queued_command":
            prompt = attachment.get("prompt", "")
            print(f"{stamp} {sender(prompt):<9} {short(prompt)}")
        elif attachment.get("type") == "hook_additional_context":
            print(f"{stamp} HOOK      {short(text)}")
        continue
    if record.get("type") not in ("user", "assistant"):
        continue
    content = record["message"].get("content")
    if isinstance(content, str):
        role = sender(content) if record["type"] == "user" else "ASSISTANT"
        print(f"{stamp} {role:<9} {short(content)}")
        continue
    for part in content:
        kind = part.get("type")
        if kind == "text":
            print(f"{stamp} SAYS      {short(part['text'])}")
        elif kind == "tool_use":
            print(f"{stamp} CALLS     {part['name']} {short(part['input'])}")
        elif kind == "tool_result":
            flag = "ERROR" if part.get("is_error") else "RESULT"
            print(f"{stamp} {flag:<9} {short(part.get('content', ''))}")
