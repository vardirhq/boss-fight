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

test('debug APK installs beside release with a distinct identity and label', async () => {
  const debug = await workflow('.github/workflows/android-debug.yml');
  const release = await workflow('.github/workflows/android-release.yml');
  assert.match(debug, /applicationIdSuffix '\.dev'/);
  assert.match(debug, /<string name="app_name">Boss Kamp Dev<\/string>/);
  assert.match(debug, /package: name='no\.vardir\.bosskamp\.dev'/);
  assert.match(debug, /application-label:'Boss Kamp Dev'/);
  assert.doesNotMatch(release, /applicationIdSuffix|bosskamp\.dev|Boss Kamp Dev/);
});

test('debug workflow exercises native lifecycle and accessibility on an emulator', async () => {
  const debug = await workflow('.github/workflows/android-debug.yml');
  const smoke = await readFile(new URL('../scripts/android-native-smoke.sh', import.meta.url), 'utf8');
  assert.match(debug, /android-emulator-runner@[0-9a-f]{40}/);
  assert.match(debug, /versionCode 1/);
  assert.match(debug, /versionCode 2/);
  assert.match(debug, /android-native-smoke\.sh boss-kamp-debug-v1\.apk boss-kamp-debug\.apk/);
  for (const behavior of ['am force-stop', 'svc wifi disable', 'adb install -r', 'uiautomator dump', 'content-desc']) {
    assert.match(smoke, new RegExp(behavior.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('native-only builds do not generate or register browser PWA artifacts', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const viteConfig = await readFile(new URL('../vite.config.ts', import.meta.url), 'utf8');
  const entrypoint = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
  const deploid = await readFile(new URL('../deploid.config.mjs', import.meta.url), 'utf8');
  assert.equal(packageJson.devDependencies['vite-plugin-pwa'], undefined);
  assert.doesNotMatch(viteConfig, /VitePWA|workbox|manifest/i);
  assert.doesNotMatch(entrypoint, /registerSW|serviceWorker/);
  assert.doesNotMatch(deploid, /serviceWorker|\bpwa\b/i);
});

test('large management surfaces are split and dependency audits distinguish shipped code', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const viteConfig = await readFile(new URL('../vite.config.ts', import.meta.url), 'utf8');
  const ci = await workflow('.github/workflows/ci-deploy.yml');
  assert.match(app, /lazy\(\(\) => import\('\.\/online\/AccountSettings'\)/);
  assert.match(app, /lazy\(\(\) => import\('\.\/screens\/managers'\)/);
  assert.match(viteConfig, /return 'react-vendor'/);
  assert.match(viteConfig, /return 'sqlite-runtime'/);
  assert.match(ci, /npm audit --omit=dev --audit-level=high/);
  assert.match(ci, /npm audit --audit-level=critical/);
});
