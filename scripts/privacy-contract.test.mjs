import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('client, server, and published privacy notice use the same version', async () => {
  const [client, server, notice] = await Promise.all([
    readFile(new URL('../src/online/api.ts', import.meta.url), 'utf8'),
    readFile(new URL('../server/src/privacy.ts', import.meta.url), 'utf8'),
    readFile(new URL('../public/privacy.html', import.meta.url), 'utf8'),
  ]);
  const version = server.match(/PRIVACY_NOTICE_VERSION = '(\d{4}-\d{2}-\d{2}(?:\.\d+)?)'/)?.[1];
  assert.ok(version, 'server privacy notice version is missing');
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(client, new RegExp(`PRIVACY_NOTICE_VERSION = '${escapedVersion}'`));
  assert.match(notice, new RegExp(`Versjon ${escapedVersion}`));
  assert.match(notice, new RegExp(`Version ${escapedVersion}`));
});
