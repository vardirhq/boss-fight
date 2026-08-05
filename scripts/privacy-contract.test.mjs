import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('client, server, and published privacy notice use the same version', async () => {
  const [client, server, notice] = await Promise.all([
    readFile(new URL('../src/online/api.ts', import.meta.url), 'utf8'),
    readFile(new URL('../server/src/privacy.ts', import.meta.url), 'utf8'),
    readFile(new URL('../public/privacy.html', import.meta.url), 'utf8'),
  ]);
  const version = server.match(/PRIVACY_NOTICE_VERSION = '(\d{4}-\d{2}-\d{2})'/)?.[1];
  assert.ok(version, 'server privacy notice version is missing');
  assert.match(client, new RegExp(`PRIVACY_NOTICE_VERSION = '${version}'`));
  assert.match(notice, new RegExp(`Versjon ${version}`));
  assert.match(notice, new RegExp(`Version ${version}`));
});
