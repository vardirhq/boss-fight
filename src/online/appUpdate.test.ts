import assert from 'node:assert/strict';
import test from 'node:test';
import {
  APP_VERSION, availableUpdate, compareVersions, dismissUpdate,
  recordUpdateCheck, shouldCheckForUpdate, updateDismissed,
} from './appUpdate.ts';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, value); },
  removeItem: (key: string) => { store.delete(key); },
};

const meta = (latest: Record<string, unknown> | null) => ({ latest });
const release = {
  version: '1.1.0',
  releaseUrl: 'https://github.com/vardirhq/boss-fight/releases/tag/v1.1.0',
  downloadUrl: 'https://github.com/vardirhq/boss-fight/releases/download/v1.1.0/boss-kamp-release.apk',
};

test('versions compare by numeric component, not lexically', () => {
  assert.ok(compareVersions('1.0.10', '1.0.9') > 0, '10 is newer than 9');
  assert.ok(compareVersions('1.10.0', '1.9.0') > 0);
  assert.ok(compareVersions('2.0.0', '1.99.99') > 0);
  assert.equal(compareVersions('1.0.1', '1.0.1'), 0);
  assert.equal(compareVersions('v1.0.1', '1.0.1'), 0, 'a tag prefix is tolerated');
  assert.equal(compareVersions('1.1', '1.1.0'), 0, 'missing components count as zero');
  assert.ok(compareVersions('1.0.0', '1.0.1') < 0);
});

test('only a strictly newer release is offered', () => {
  assert.deepEqual(availableUpdate(meta(release), '1.0.1'), release);
  assert.equal(availableUpdate(meta(release), '1.1.0'), null, 'the current version is not an update');
  assert.equal(availableUpdate(meta(release), '1.2.0'), null, 'an older release is not an update');
});

test('malformed or untrusted metadata never produces an update', () => {
  assert.equal(availableUpdate(null, '1.0.0'), null);
  assert.equal(availableUpdate({}, '1.0.0'), null);
  assert.equal(availableUpdate(meta(null), '1.0.0'), null);
  assert.equal(availableUpdate(meta({ ...release, version: 'latest' }), '1.0.0'), null);
  // The offered link must be a GitHub release, not wherever a response points.
  assert.equal(availableUpdate(meta({ ...release, releaseUrl: 'https://example.invalid/apk' }), '1.0.0'), null);
  const foreignDownload = availableUpdate(meta({ ...release, downloadUrl: 'https://example.invalid/x.apk' }), '1.0.0');
  assert.equal(foreignDownload?.downloadUrl, null, 'a foreign download target is dropped, not offered');
});

test('a release with no attached package still points at its release page', () => {
  const withoutApk = availableUpdate(meta({ ...release, downloadUrl: null }), '1.0.1');
  assert.equal(withoutApk?.downloadUrl, null);
  assert.equal(withoutApk?.releaseUrl, release.releaseUrl);
});

test('the check is throttled to once a day', () => {
  store.clear();
  const start = Date.UTC(2026, 7, 6, 12, 0, 0);
  assert.equal(shouldCheckForUpdate(start), true, 'a fresh install checks immediately');
  recordUpdateCheck(start);
  assert.equal(shouldCheckForUpdate(start + 60_000), false);
  assert.equal(shouldCheckForUpdate(start + 23 * 3_600_000), false);
  assert.equal(shouldCheckForUpdate(start + 25 * 3_600_000), true);
});

test('dismissal is remembered per version so the next release still announces itself', () => {
  store.clear();
  assert.equal(updateDismissed('1.1.0'), false);
  dismissUpdate('1.1.0');
  assert.equal(updateDismissed('1.1.0'), true);
  assert.equal(updateDismissed('1.2.0'), false);
});

test('the build version is injected, and falls back rather than throwing', () => {
  // Vite replaces __APP_VERSION__ at build time; outside a build it must not crash.
  assert.match(APP_VERSION, /^\d+(\.\d+)*$/);
});
