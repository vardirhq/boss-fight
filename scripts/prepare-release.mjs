import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

export function normalizeVersion(value) {
  const normalized = String(value ?? '').trim().replace(/^v/, '');
  if (!SEMVER_PATTERN.test(normalized)) {
    throw new Error(`Release version must use x.y.z format, got "${value ?? ''}"`);
  }
  return normalized;
}

export function compareVersions(left, right) {
  const leftParts = normalizeVersion(left).split('.').map(Number);
  const rightParts = normalizeVersion(right).split('.').map(Number);

  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] > rightParts[index] ? 1 : -1;
    }
  }

  return 0;
}

export function releaseDate(timeZone = 'Europe/Oslo', date = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function rollChangelog(changelog, version, date) {
  const headerPattern = /^## \[Unreleased\][^\n]*\n/m;
  const header = headerPattern.exec(changelog);

  if (!header || header.index === undefined) {
    throw new Error('CHANGELOG.md must contain a ## [Unreleased] section');
  }

  const bodyStart = header.index + header[0].length;
  const nextHeaderOffset = changelog.slice(bodyStart).search(/^## \[/m);
  const bodyEnd = nextHeaderOffset === -1
    ? changelog.length
    : bodyStart + nextHeaderOffset;
  const unreleasedBody = changelog.slice(bodyStart, bodyEnd).trim();

  if (!unreleasedBody) {
    throw new Error('CHANGELOG.md [Unreleased] must contain at least one entry');
  }

  const prefix = changelog.slice(0, header.index);
  const previousReleases = changelog.slice(bodyEnd).trimStart();
  const releasedSection = `## [${version}] - ${date}\n\n${unreleasedBody}`;

  return [
    prefix.trimEnd(),
    '',
    '## [Unreleased]',
    '',
    releasedSection,
    '',
    previousReleases,
    '',
  ].join('\n');
}

export function updateDeploidVersion(config, version) {
  const versionPattern = /(version:\s*\{\s*code:\s*)(\d+)(,\s*name:\s*['"])([^'"]+)(['"],?\s*\})/m;
  const match = versionPattern.exec(config);

  if (!match) {
    throw new Error('Could not locate android.version in deploid.config.mjs');
  }

  const nextCode = Number(match[2]) + 1;
  const updated = config.replace(
    versionPattern,
    `${match[1]}${nextCode}${match[3]}${version}${match[5]}`,
  );

  return { content: updated, versionCode: nextCode };
}

export async function prepareRelease(versionInput, options = {}) {
  const version = normalizeVersion(versionInput);
  const packagePath = options.packagePath ?? 'package.json';
  const lockPath = options.lockPath ?? 'package-lock.json';
  const configPath = options.configPath ?? 'deploid.config.mjs';
  const changelogPath = options.changelogPath ?? 'CHANGELOG.md';

  const [packageText, lockText, configText, changelogText] = await Promise.all([
    readFile(packagePath, 'utf8'),
    readFile(lockPath, 'utf8'),
    readFile(configPath, 'utf8'),
    readFile(changelogPath, 'utf8'),
  ]);

  const packageJson = JSON.parse(packageText);
  const packageLock = JSON.parse(lockText);

  if (compareVersions(version, packageJson.version) <= 0) {
    throw new Error(
      `Release version ${version} must be newer than current version ${packageJson.version}`,
    );
  }

  packageJson.version = version;
  packageLock.version = version;

  if (!packageLock.packages?.['']) {
    throw new Error('package-lock.json is missing its root package entry');
  }
  packageLock.packages[''].version = version;

  const { content: config, versionCode } = updateDeploidVersion(configText, version);
  const date = options.date ?? process.env.RELEASE_DATE ?? releaseDate();
  const changelog = rollChangelog(changelogText, version, date);

  await Promise.all([
    writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`),
    writeFile(lockPath, `${JSON.stringify(packageLock, null, 2)}\n`),
    writeFile(configPath, config),
    writeFile(changelogPath, changelog),
  ]);

  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `version=${version}\ntag=v${version}\nandroid_version_code=${versionCode}\n`,
    );
  }

  return { version, tag: `v${version}`, versionCode, date };
}

async function main() {
  const result = await prepareRelease(process.argv[2]);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
