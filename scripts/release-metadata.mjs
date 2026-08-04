import { readFile } from 'node:fs/promises';
import process from 'node:process';
import deploidConfig from '../deploid.config.mjs';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const changelog = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');

const version = packageJson.version;
const androidVersion = deploidConfig.android?.version;
const androidVersionName = androidVersion?.name;
const androidVersionCode = androidVersion?.code;
const tag = process.env.RELEASE_TAG || `v${version}`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  fail(`package.json version must be semver-like, got ${version}`);
}

if (androidVersionName !== version) {
  fail(`deploid.config.mjs android.version.name (${androidVersionName}) must match package.json version (${version})`);
}

if (!Number.isInteger(androidVersionCode) || androidVersionCode < 1) {
  fail(`deploid.config.mjs android.version.code must be a positive integer, got ${androidVersionCode}`);
}

if (tag !== `v${version}`) {
  fail(`release tag (${tag}) must equal v${version}`);
}

const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const headerPattern = new RegExp(`^## \\[${escapedVersion}\\][^\\n]*\\n`, 'm');
const header = changelog.match(headerPattern);

if (!header || header.index === undefined) {
  fail(`CHANGELOG.md must contain a non-empty section for [${version}]`);
}

const bodyStart = header.index + header[0].length;
const nextHeader = changelog.slice(bodyStart).search(/^## \[/m);
const bodyEnd = nextHeader === -1 ? changelog.length : bodyStart + nextHeader;
const sectionBody = changelog.slice(bodyStart, bodyEnd).trim();

if (!sectionBody) {
  fail(`CHANGELOG.md must contain a non-empty section for [${version}]`);
}

const releaseNotes = [
  `Android version code: ${androidVersionCode}`,
  '',
  sectionBody,
  ''
].join('\n');

if (process.env.GITHUB_OUTPUT) {
  const output = [
    `version=${version}`,
    `tag=${tag}`,
    `android_version_code=${androidVersionCode}`
  ].join('\n');
  await import('node:fs').then(({ appendFileSync }) => appendFileSync(process.env.GITHUB_OUTPUT, `${output}\n`));
}

if (process.argv.includes('--notes')) {
  process.stdout.write(releaseNotes);
} else {
  process.stdout.write(JSON.stringify({ version, tag, androidVersionCode }, null, 2));
  process.stdout.write('\n');
}
