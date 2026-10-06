/**
 * Semver ordering for catavasia versions (`1.4.1-cats.N`).
 *
 * Follows semver 2.0 precedence: core numbers first, then a release outranks
 * any prerelease, then prerelease identifiers left to right (numeric ones
 * numerically, so `cats.10` > `cats.9`). Build metadata (`+…`) is ignored.
 */

const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/** True when `value` parses as a semver version. */
export function isVersion(value: unknown): value is string {
  return typeof value === 'string' && VERSION_RE.test(value.trim());
}

function compareIdentifiers(a: string, b: string): number {
  const aNum = /^\d+$/.test(a);
  const bNum = /^\d+$/.test(b);
  if (aNum && bNum) return Math.sign(Number(a) - Number(b));
  if (aNum) return -1; // numeric identifiers sort before alphanumeric ones
  if (bNum) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** -1 when a < b, 0 when equal, 1 when a > b. Throws on an invalid version. */
export function compareVersions(a: string, b: string): number {
  const pa = VERSION_RE.exec(a.trim());
  const pb = VERSION_RE.exec(b.trim());
  if (!pa || !pb) throw new Error(`Not a version: ${!pa ? a : b}`);
  for (let i = 1; i <= 3; i++) {
    const diff = Math.sign(Number(pa[i]) - Number(pb[i]));
    if (diff !== 0) return diff;
  }
  const preA = pa[4]?.split('.') ?? [];
  const preB = pb[4]?.split('.') ?? [];
  if (preA.length === 0 || preB.length === 0) return Math.sign(preB.length - preA.length);
  for (let i = 0; i < Math.max(preA.length, preB.length); i++) {
    if (preA[i] === undefined) return -1;
    if (preB[i] === undefined) return 1;
    const diff = compareIdentifiers(preA[i], preB[i]);
    if (diff !== 0) return diff;
  }
  return 0;
}
