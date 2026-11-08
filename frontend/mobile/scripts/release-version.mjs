/**
 * Picks the next app version from the commits since the last release, the way semantic-release
 * does: Conventional Commits mapped onto SemVer.
 *
 *   breaking change ("feat!:", "fix(x)!:" or a "BREAKING CHANGE:" footer)  → major  1.4.2 → 2.0.0
 *   any "feat:"                                                             → minor  1.4.2 → 1.5.0
 *   anything else                                                           → patch  1.4.2 → 1.4.3
 *   no commits                                                              → null   (nothing to release)
 */

const HEADER = /^(?<type>[a-z]+)(?:\((?<scope>[^)]*)\))?(?<bang>!)?:\s*(?<subject>.+)$/i;

/** One commit message (subject + body) as Conventional Commits reads it; non-conforming ones count as a patch. */
export function parseCommit(message) {
  const [header = '', ...rest] = message.trim().split('\n');
  const match = header.match(HEADER);
  const breaking = !!match?.groups.bang || /^BREAKING[ -]CHANGE:/m.test(rest.join('\n'));
  return {
    type: match?.groups.type.toLowerCase() ?? 'other',
    subject: (match?.groups.subject ?? header).trim(),
    breaking,
  };
}

const RANK = { patch: 1, minor: 2, major: 3 };

/** The strongest bump the commits call for, or null when there are none. */
export function bumpFor(commits) {
  if (commits.length === 0) return null;
  let bump = 'patch';
  for (const commit of commits) {
    const level = commit.breaking ? 'major' : commit.type === 'feat' ? 'minor' : 'patch';
    if (RANK[level] > RANK[bump]) bump = level;
  }
  return bump;
}

export function nextVersion(current, bump) {
  const parts = current.split('.').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0)) {
    throw new Error(`"${current}" isn't a version like 1.4.2`);
  }
  const [major, minor, patch] = parts;
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/** "What's new" lines from the features and fixes: their subjects, capitalised, newest first, at most `limit`. */
export function releaseNotes(commits, limit = 5) {
  const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1).replace(/\s*\(#\d+\)$/, '');
  const pick = (type) => commits.filter((c) => c.type === type).map((c) => capitalise(c.subject));
  return [...new Set([...pick('feat'), ...pick('fix')])].slice(0, limit);
}
