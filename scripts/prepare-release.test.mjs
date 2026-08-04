import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareVersions,
  normalizeVersion,
  rollChangelog,
  updateDeploidVersion,
} from './prepare-release.mjs';

test('normalizes a release version and permits an optional lowercase v', () => {
  assert.equal(normalizeVersion('1.2.3'), '1.2.3');
  assert.equal(normalizeVersion('v1.2.3'), '1.2.3');
  assert.throws(() => normalizeVersion('V1.2.3'), /x\.y\.z/);
  assert.throws(() => normalizeVersion('1.2'), /x\.y\.z/);
});

test('compares numeric semantic versions', () => {
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
  assert.equal(compareVersions('2.0.0', '2.0.0'), 0);
  assert.equal(compareVersions('1.0.1', '1.1.0'), -1);
});

test('rolls Unreleased notes into a dated release and leaves a fresh section', () => {
  const changelog = `# Changelog

Intro.

## [Unreleased]

### Fixed

- Signed the APK.

## [1.0.0] - 2026-08-04

### Added

- First release.
`;

  const result = rollChangelog(changelog, '1.0.1', '2026-08-05');

  assert.match(result, /## \[Unreleased\]\n\n## \[1\.0\.1\] - 2026-08-05/);
  assert.match(result, /### Fixed\n\n- Signed the APK\./);
  assert.match(result, /## \[1\.0\.0\] - 2026-08-04/);
});

test('rejects an empty Unreleased section', () => {
  const changelog = `# Changelog

## [Unreleased]

## [1.0.0] - 2026-08-04

- First release.
`;

  assert.throws(
    () => rollChangelog(changelog, '1.0.1', '2026-08-05'),
    /must contain at least one entry/,
  );
});

test('updates Android version name and increments version code', () => {
  const config = `android: {
  version: {
    code: 7,
    name: '1.4.0',
  },
},
`;

  const result = updateDeploidVersion(config, '1.5.0');

  assert.equal(result.versionCode, 8);
  assert.match(result.content, /code: 8/);
  assert.match(result.content, /name: '1\.5\.0'/);
});
