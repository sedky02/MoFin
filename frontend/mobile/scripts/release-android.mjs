#!/usr/bin/env node
/**
 * Builds the production Android APK on EAS and publishes it, so the website and the app's update
 * banner offer it within ~5 minutes:
 *
 *   APP_RELEASE_TOKEN=… npm run release:android
 *
 * The version is worked out from the commits since the last release (see release-version.mjs):
 * a breaking change bumps major, a feat bumps minor, anything else bumps patch. The "What's new"
 * notes come from the same commits. After a successful publish the commit is tagged
 * `android-v<version>`, which is where the next release starts counting from.
 *
 * --dry-run       shows the version and notes it would use, and stops
 * --bump <level>  forces major, minor or patch;  --version 1.2.3 sets it outright
 * --note "…"      writes the notes yourself (repeatable) instead of using the commits
 * --force         releases even when nothing changed since the last release
 * --legacy        also builds the armeabi-v7a APK and offers it as the "older phone" download
 * --skip-publish  builds only; prints the publish command to run later
 *
 * It publishes through the backend (POST /app/releases), authenticated with APP_RELEASE_TOKEN, the
 * same value as the backend's env var. RELEASE_API_URL picks another backend (default: production).
 * The token is read from the shell or mobile/.env and never written anywhere.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { bumpFor, nextVersion, parseCommit, releaseNotes } from './release-version.mjs';

const mobileDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// The token can live in mobile/.env (gitignored, and not EXPO_PUBLIC_, so never in the app bundle).
// A value already set in the shell wins.
try {
  process.loadEnvFile(resolve(mobileDir, '.env'));
} catch {
  // No .env: the shell has to provide the token.
}
const DEFAULT_API_URL = 'https://mo-fin-backend.vercel.app/api/v1';
const apiUrl = (process.env.RELEASE_API_URL ?? DEFAULT_API_URL).replace(/\/+$/, '');
const configPath = resolve(mobileDir, 'app.config.ts');
const repoDir = resolve(mobileDir, '../..');
const TAG_PREFIX = 'android-v';
// Changes that ship in the app: the app itself, and the backend it talks to.
const RELEASE_PATHS = ['frontend/mobile', 'backend'];

const { values } = parseArgs({
  options: {
    version: { type: 'string' },
    bump: { type: 'string' },
    note: { type: 'string', multiple: true, default: [] },
    force: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    legacy: { type: 'boolean', default: false },
    'skip-publish': { type: 'boolean', default: false },
  },
});

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

function step(message) {
  console.log(`\n▸ ${message}`);
}

// Everything that can fail cheaply is checked before the build, which takes minutes.
const releaseToken = process.env.APP_RELEASE_TOKEN;
if (!values['skip-publish'] && !values['dry-run'] && !releaseToken) {
  fail('Set APP_RELEASE_TOKEN (the same value as on the backend) or pass --skip-publish.');
}
if (values.version && !/^\d+\.\d+\.\d+$/.test(values.version)) {
  fail(`--version must look like 1.0.3 (got "${values.version}").`);
}
if (values.bump && !['major', 'minor', 'patch'].includes(values.bump)) {
  fail(`--bump must be major, minor or patch (got "${values.bump}").`);
}

const git = (...args) =>
  execFileSync('git', args, { cwd: repoDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** The last release tag, or null before the first one. */
function lastReleaseTag() {
  try {
    return git('describe', '--tags', '--abbrev=0', `--match=${TAG_PREFIX}*`);
  } catch {
    return null;
  }
}

const lastTag = lastReleaseTag();
const log = git('log', '--format=%B%x00', ...(lastTag ? [`${lastTag}..HEAD`] : []), '--', ...RELEASE_PATHS);
const commits = log
  .split('\0')
  .map((m) => m.trim())
  .filter(Boolean)
  .map(parseCommit);

const config = readFileSync(configPath, 'utf8');
const versionLine = /version: '(\d+\.\d+\.\d+)'/;
const current = config.match(versionLine)?.[1];
if (!current) fail(`Couldn't find the version in ${configPath}.`);
// The last released version is the tag's; before the first release, the one in app.config.ts.
const released = lastTag ? lastTag.slice(TAG_PREFIX.length) : current;

const bump = values.bump ?? bumpFor(commits);
if (!values.version && !bump) {
  if (!values.force) fail(`Nothing changed since ${lastTag ?? 'the start'}: no release needed (use --force to release anyway).`);
}
const version = values.version ?? nextVersion(released, bump ?? 'patch');
const notes = values.note.length > 0 ? values.note : releaseNotes(commits);

step(
  `${released} → ${version}  (${values.version ? 'set by hand' : `${bump ?? 'patch'}, from ${commits.length} commit${commits.length === 1 ? '' : 's'} since ${lastTag ?? 'the start'}`})`,
);
console.log(notes.length ? notes.map((n) => `  • ${n}`).join('\n') : '  (no notes)');
if (values['dry-run']) process.exit(0);

if (version !== current) {
  writeFileSync(configPath, config.replace(versionLine, `version: '${version}'`));
  step(`Wrote version ${version} to app.config.ts`);
}

/** Runs one EAS build, waits for it, and returns what the publish step needs. */
function build(profile) {
  step(`Building ${profile} on EAS (this takes a while)…`);
  const run = spawnSync(
    'npx',
    ['eas-cli', 'build', '-p', 'android', '--profile', profile, '--non-interactive', '--wait', '--json'],
    { cwd: mobileDir, encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024 },
  );
  if (run.status !== 0) fail(`The ${profile} build failed (see the EAS output above).`);
  let result;
  try {
    [result] = JSON.parse(run.stdout);
  } catch {
    fail(`Couldn't read the ${profile} build result from EAS.`);
  }
  const url = result?.artifacts?.applicationArchiveUrl ?? result?.artifacts?.buildUrl;
  const buildNumber = Number(result?.appBuildVersion);
  if (!url || !Number.isInteger(buildNumber)) fail(`The ${profile} build finished without an APK link or build number.`);
  console.log(`  ${result.appVersion} (build ${buildNumber})\n  ${url}`);
  return { url, buildNumber, version: result.appVersion };
}

const main = build('production-arm64');
const legacy = values.legacy ? build('production-legacy') : null;

const release = {
  platform: 'ANDROID',
  version: main.version,
  build: main.buildNumber,
  url: main.url,
  ...(legacy ? { legacyUrl: legacy.url } : {}),
  notes,
};

if (values['skip-publish']) {
  step('Built, not published. To publish it:');
  console.log(
    `  curl -X POST ${apiUrl}/app/releases -H "Authorization: Bearer $APP_RELEASE_TOKEN" ` +
      `-H "Content-Type: application/json" -d '${JSON.stringify(release).replace(/'/g, "'\\''")}'`,
  );
  process.exit(0);
}

step(`Publishing it to ${apiUrl}…`);
let response;
try {
  response = await fetch(`${apiUrl}/app/releases`, {
    method: 'POST',
    headers: { authorization: `Bearer ${releaseToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(release),
  });
} catch (err) {
  fail(`The build is on EAS but the backend couldn't be reached (${err.message}). Rerun with --skip-publish to get the publish command.`);
}
if (!response.ok) {
  const detail = await response.text().catch(() => '');
  const why =
    response.status === 401
      ? 'the release token was refused'
      : response.status === 404
        ? 'publishing is off on that backend (APP_RELEASE_TOKEN isn\'t set there)'
        : `HTTP ${response.status}`;
  fail(`The build is on EAS but publishing failed: ${why}.${detail ? `\n  ${detail}` : ''}`);
}

// The next release counts its changes from here. Local only: push it with `git push origin <tag>`.
const tag = `${TAG_PREFIX}${main.version}`;
try {
  git('tag', '-a', tag, '-m', `Android ${main.version} (build ${main.buildNumber})`);
  step(`Tagged this commit ${tag} (push it with: git push origin ${tag})`);
} catch {
  console.warn(`  Couldn't create the tag ${tag}; create it by hand so the next release counts from here.`);
}

console.log(`\n✔ MoFin ${main.version} (build ${main.buildNumber}) is out. The site and the app pick it up within ~5 minutes.`);
console.log('  Commit the version change in app.config.ts.');
