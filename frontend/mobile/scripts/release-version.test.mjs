import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bumpFor, nextVersion, parseCommit, releaseNotes } from './release-version.mjs';

test('reads Conventional Commit headers, scopes and breaking marks', () => {
  assert.deepEqual(parseCommit('feat(mobile): update banner'), { type: 'feat', subject: 'update banner', breaking: false });
  assert.equal(parseCommit('fix!: drop old sync').breaking, true);
  assert.equal(parseCommit('refactor: x\n\nBREAKING CHANGE: new API').breaking, true);
  assert.equal(parseCommit('Merge branch main').type, 'other');
});

test('picks the strongest bump', () => {
  const c = (m) => parseCommit(m);
  assert.equal(bumpFor([]), null);
  assert.equal(bumpFor([c('fix: a'), c('chore: b')]), 'patch');
  assert.equal(bumpFor([c('fix: a'), c('feat: b')]), 'minor');
  assert.equal(bumpFor([c('feat: a'), c('fix!: b')]), 'major');
});

test('bumps SemVer and resets the lower parts', () => {
  assert.equal(nextVersion('1.4.2', 'patch'), '1.4.3');
  assert.equal(nextVersion('1.4.2', 'minor'), '1.5.0');
  assert.equal(nextVersion('1.4.2', 'major'), '2.0.0');
  assert.throws(() => nextVersion('1.4', 'patch'));
});

test('writes notes from features first, then fixes', () => {
  const commits = ['fix(mobile): crash on login (#12)', 'chore: deps', 'feat: home widgets'].map(parseCommit);
  assert.deepEqual(releaseNotes(commits), ['Home widgets', 'Crash on login']);
});
