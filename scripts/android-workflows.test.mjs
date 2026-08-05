import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowPaths = [
  '.github/workflows/android-debug.yml',
  '.github/workflows/android-release.yml',
  '.github/workflows/ci-deploy.yml',
  '.github/workflows/finalize-release.yml',
  '.github/workflows/prepare-release.yml',
];

async function workflow(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('Android release workflows pin third-party actions to commit SHAs', async () => {
  for (const path of workflowPaths) {
    const contents = await workflow(path);
    const actionUses = [...contents.matchAll(/^\s*uses:\s*([^\s#]+)/gm)].map((match) => match[1]);
    assert.ok(actionUses.length > 0, `${path} must use at least one action`);
    for (const action of actionUses) {
      assert.match(action, /^[^@]+@[0-9a-f]{40}$/, `${path}: ${action} is not immutable`);
    }
  }
});

test('Android packaging uses the lockfile-installed Deploid binary', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(packageJson.devDependencies['@deploid/cli'], '2.1.1');
  for (const path of ['.github/workflows/android-debug.yml', '.github/workflows/android-release.yml']) {
    const contents = await workflow(path);
    assert.doesNotMatch(contents, /npm install .*@deploid\/cli/);
    assert.match(contents, /\.\/node_modules\/\.bin\/deploid package/);
    assert.match(contents, /\.\/node_modules\/\.bin\/deploid build/);
  }
});

test('release workflows use Node 22 and dispatch the signed build from its tag', async () => {
  for (const path of workflowPaths) {
    const contents = await workflow(path);
    assert.match(contents, /node-version:\s*22\b/, `${path} must select Node 22`);
    assert.doesNotMatch(contents, /node-version:\s*(?!22\b)\d+/);
  }
  const finalize = await workflow('.github/workflows/finalize-release.yml');
  const release = await workflow('.github/workflows/android-release.yml');
  assert.match(finalize, /--ref "\$TAG"/);
  assert.doesNotMatch(finalize, /--ref main/);
  assert.match(release, /GITHUB_REF_TYPE.*tag/);
  assert.match(release, /GITHUB_REF_NAME.*RELEASE_TAG/);
});
