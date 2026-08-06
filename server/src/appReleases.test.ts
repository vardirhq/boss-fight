import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareVersions, isNewerVersion, latestRelease, projectRelease, resetReleaseCacheForTest,
} from './appReleases.js';

const payload = {
  tag_name: 'v1.1.0',
  html_url: 'https://github.com/vardirhq/boss-fight/releases/tag/v1.1.0',
  published_at: '2026-08-06T10:00:00Z',
  assets: [
    { name: 'boss-kamp-release.aab', browser_download_url: 'https://github.com/vardirhq/boss-fight/releases/download/v1.1.0/boss-kamp-release.aab' },
    { name: 'boss-kamp-release.apk', browser_download_url: 'https://github.com/vardirhq/boss-fight/releases/download/v1.1.0/boss-kamp-release.apk' },
  ],
};

const respond = (body: unknown, ok = true) => (async () => ({
  ok, status: ok ? 200 : 503, json: async () => body,
})) as unknown as typeof fetch;

test('versions compare by numeric component, not lexically', () => {
  assert.ok(compareVersions('1.0.10', '1.0.9') > 0);
  assert.ok(isNewerVersion('1.2.0', '1.1.9'));
  assert.equal(isNewerVersion('1.1.0', '1.1.0'), false);
  assert.equal(isNewerVersion('1.0.0', '1.0.1'), false);
});

test('a release is reduced to the installable APK and its public page', () => {
  const release = projectRelease(payload);
  assert.equal(release?.version, '1.1.0', 'the tag prefix is stripped');
  assert.match(String(release?.downloadUrl), /boss-kamp-release\.apk$/, 'the APK is chosen over the AAB');
  assert.equal(release?.publishedAt, '2026-08-06T10:00:00Z');
});

test('drafts and unusable payloads yield nothing rather than a partial record', () => {
  assert.equal(projectRelease({ ...payload, draft: true }), null);
  assert.equal(projectRelease({ ...payload, tag_name: 'nightly' }), null);
  assert.equal(projectRelease(null), null);
  assert.equal(projectRelease([]), null);
  // A release with no APK is still reportable; there is simply nothing to download.
  assert.equal(projectRelease({ ...payload, assets: [] })?.downloadUrl, null);
  // An asset hosted anywhere but GitHub is never offered as a download target.
  assert.equal(projectRelease({
    ...payload,
    assets: [{ name: 'boss-kamp.apk', browser_download_url: 'https://example.invalid/boss-kamp.apk' }],
  })?.downloadUrl, null);
});

test('the upstream lookup is cached rather than repeated per request', async () => {
  resetReleaseCacheForTest();
  let calls = 0;
  const counting = (async () => { calls += 1; return { ok: true, status: 200, json: async () => payload }; }) as unknown as typeof fetch;
  const start = Date.UTC(2026, 7, 6, 12, 0, 0);

  assert.equal((await latestRelease(start, counting))?.version, '1.1.0');
  await latestRelease(start + 60_000, counting);
  await latestRelease(start + 20 * 60_000, counting);
  assert.equal(calls, 1, 'requests inside the cache window reuse the answer');

  await latestRelease(start + 31 * 60_000, counting);
  assert.equal(calls, 2, 'the cache expires');
});

test('an unreachable or failing upstream keeps serving the previous answer', async () => {
  resetReleaseCacheForTest();
  const start = Date.UTC(2026, 7, 6, 12, 0, 0);
  assert.equal((await latestRelease(start, respond(payload)))?.version, '1.1.0');

  const failing = (async () => { throw new Error('network down'); }) as unknown as typeof fetch;
  const afterFailure = await latestRelease(start + 31 * 60_000, failing);
  assert.equal(afterFailure?.version, '1.1.0', 'update discovery must never fail the request');

  const throttled = await latestRelease(start + 62 * 60_000, respond({}, false));
  assert.equal(throttled?.version, '1.1.0');
});

test('a first lookup that fails reports nothing instead of throwing', async () => {
  resetReleaseCacheForTest();
  const failing = (async () => { throw new Error('network down'); }) as unknown as typeof fetch;
  assert.equal(await latestRelease(Date.now(), failing), null);
});
