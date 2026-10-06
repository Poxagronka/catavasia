/**
 * Secret scan of the Cat CEO (cat-ceo-judge.md §7 check 6): an edit whose
 * text holds a hit is refused; in the review digest a hit becomes
 * `[redacted]`, so no token or home path reaches the judge.
 */

const PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]*/g,
  /sk-[A-Za-z0-9]{20,}/g,
  /ghp_[A-Za-z0-9]*/g,
  /github_pat_[A-Za-z0-9_]*/g,
  /xox[abp]-[A-Za-z0-9-]*/g,
  /AKIA[0-9A-Z]{16}/g,
  /-----BEGIN[^\n]*/g,
  /\b[0-9a-fA-F]{32,}\b/g,
  // Base64 runs: letters and digits both, so a long plain word is no hit.
  /(?=[A-Za-z0-9+/]*\d)(?=[A-Za-z0-9+/]*[A-Za-z])[A-Za-z0-9+/]{32,}={0,2}/g,
  /\/Users\/[^\s'"`)]*/g,
  /~\/\.pixel-agents[^\s'"`)]*/g,
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function patterns(extra: string[]): RegExp[] {
  const words = extra.filter((w) => w.length >= 8).map((w) => new RegExp(escape(w), 'g'));
  return [...PATTERNS, ...words];
}

/** The first secret-like run in `text`, or undefined. `extra`: exact strings to refuse too. */
export function findSecret(text: string, extra: string[] = []): string | undefined {
  for (const re of patterns(extra)) {
    re.lastIndex = 0;
    const hit = re.exec(text);
    if (hit) return hit[0];
  }
  return undefined;
}

/** Every secret-like run replaced by `[redacted]`. */
export function redact(text: string, extra: string[] = []): string {
  let out = text;
  for (const re of patterns(extra)) out = out.replace(re, '[redacted]');
  return out;
}
