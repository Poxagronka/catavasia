import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * A folder with a fake `claude` CLI, to put first on the host's PATH: logged in or logged out
 * (the engines step and its banner). Never the real CLI.
 */
export function fakeClaude(loggedIn: boolean): string {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-fake-claude-'));
  const auth = loggedIn
    ? `echo '{"loggedIn": true, "authMethod": "claude.ai"}'; exit 0`
    : `echo '{"loggedIn": false}'; exit 1`;
  fs.writeFileSync(
    path.join(bin, 'claude'),
    `#!/bin/sh
case "$1" in
  --version) echo "2.1.291 (Claude Code)"; exit 0 ;;
  --help) printf "  --effort <level>   Effort level (low, medium, high)\\n  --model <model>   Model alias (e.g. 'fable', 'opus', or 'sonnet') or a model's full name.\\n"; exit 0 ;;
  auth) ${auth} ;;
esac
exit 2
`,
    { mode: 0o755 },
  );
  return bin;
}
