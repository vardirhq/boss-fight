import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';

const deployScript = new URL('./deploy-production.sh', import.meta.url);
const nextImage = 'ghcr.io/vardirhq/boss-fight-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const previousImage = 'ghcr.io/vardirhq/boss-fight-api@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

async function executable(path, contents) {
  await writeFile(path, contents);
  await chmod(path, 0o755);
}

async function fixture(healthMode) {
  const root = await mkdtemp(join(tmpdir(), 'boss-kamp-deploy-'));
  const bin = join(root, 'bin');
  const server = join(root, 'server');
  await mkdir(bin);
  await mkdir(server);
  await writeFile(join(server, '.env.production'), 'DATABASE_URL=postgresql://example/test\n');

  const log = join(root, 'commands.log');
  const upCount = join(root, 'up-count');
  await executable(join(bin, 'docker'), `#!/usr/bin/env bash
set -euo pipefail
printf '%s|docker %s\\n' "\${BOSS_KAMP_API_IMAGE:-}" "$*" >> "${log}"
if [[ "$1 $2 $3" == "compose ps -q" ]]; then echo container-1; exit 0; fi
if [[ "$1 $2" == "image inspect" ]]; then exit 1; fi
if [[ "$1" == "inspect" ]]; then echo "${previousImage}"; exit 0; fi
if [[ "$1 $2" == "compose up" ]]; then
  count=0; [[ -f "${upCount}" ]] && count="$(<"${upCount}")"
  echo $((count + 1)) > "${upCount}"
fi
`);
  await executable(join(bin, 'pg_dump'), `#!/usr/bin/env bash
printf 'pg_dump %s\\n' "$*" >> "${log}"
`);
  await executable(join(bin, 'curl'), `#!/usr/bin/env bash
count=0; [[ -f "${upCount}" ]] && count="$(<"${upCount}")"
if [[ "${healthMode}" == "success" || "$count" -ge 2 ]]; then exit 0; fi
exit 1
`);
  await executable(join(bin, 'sleep'), '#!/usr/bin/env bash\nexit 0\n');

  return {
    root,
    log,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      BOSS_KAMP_APP_ROOT: root,
      BOSS_KAMP_HEALTH_ATTEMPTS: '2',
    },
  };
}

function runDeploy(env, image = nextImage) {
  return new Promise((resolve) => {
    const child = spawn('bash', [deployScript.pathname, image], { env });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stderr }));
  });
}

test('a healthy immutable image becomes current while retaining the previous reference', async () => {
  const { root, log, env } = await fixture('success');
  const result = await runDeploy(env);
  assert.equal(result.code, 0, result.stderr);
  assert.equal((await readFile(join(root, 'deployments/current-api-image'), 'utf8')).trim(), nextImage);
  assert.equal((await readFile(join(root, 'deployments/previous-api-image'), 'utf8')).trim(), previousImage);
  assert.match(await readFile(log, 'utf8'), new RegExp(`${nextImage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\|docker compose run`));
});

test('failed readiness restores the previous image and still fails the deployment', async () => {
  const { root, log, env } = await fixture('rollback');
  const result = await runDeploy(env);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Previous image restored successfully/);
  assert.equal((await readFile(join(root, 'deployments/current-api-image'), 'utf8')).trim(), previousImage);
  const commands = await readFile(log, 'utf8');
  assert.match(commands, new RegExp(`${nextImage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\|docker compose up`));
  assert.match(commands, new RegExp(`${previousImage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\|docker compose up`));
});

test('mutable image tags are rejected before any deployment command runs', async () => {
  const { log, env } = await fixture('success');
  const result = await runDeploy(env, 'ghcr.io/vardirhq/boss-fight-api:latest');
  assert.equal(result.code, 2);
  await assert.rejects(readFile(log, 'utf8'));
});

test('CI promotes a scanned digest and never rebuilds on the production host', async () => {
  const workflow = await readFile(new URL('../.github/workflows/ci-deploy.yml', import.meta.url), 'utf8');
  const compose = await readFile(new URL('../server/docker-compose.yml', import.meta.url), 'utf8');
  assert.match(workflow, /Build and Scan API Image/);
  assert.match(workflow, /aquasecurity\/trivy-action@[0-9a-f]{40}/);
  assert.match(workflow, /image_ref=.*@\$DIGEST/);
  assert.match(workflow, /needs: \[checks, image\]/);
  assert.match(workflow, /bash scripts\/deploy-production\.sh "\$IMAGE_REF"/);
  assert.doesNotMatch(workflow, /docker compose build/);
  assert.match(compose, /BOSS_KAMP_API_IMAGE:\?/);
  assert.doesNotMatch(compose, /^\s*build:/m);
});

test('the production image is least-privileged and invokes runtime entrypoints with Node', async () => {
  const dockerfile = await readFile(new URL('../server/Dockerfile', import.meta.url), 'utf8');
  const compose = await readFile(new URL('../server/docker-compose.yml', import.meta.url), 'utf8');
  const deploy = await readFile(deployScript, 'utf8');
  assert.match(dockerfile, /rm -rf \/usr\/local\/lib\/node_modules\/npm/);
  assert.match(dockerfile, /CMD \["node", "dist\/index\.js"\]/);
  assert.match(dockerfile, /^USER node$/m);
  assert.doesNotMatch(dockerfile, /CMD .*npm/);
  assert.match(compose, /command: \["node", "dist\/index\.js"\]/);
  assert.match(compose, /CORS_ORIGIN: https:\/\/boss-kamp\.vardir\.no,http:\/\/localhost,https:\/\/localhost,capacitor:\/\/localhost/);
  assert.match(compose, /TRUST_PROXY: "true"/);
  assert.match(deploy, /docker exec "\$postgres_container" pg_dump/);
  assert.match(deploy, /BOSS_KAMP_MIGRATION_DATABASE_URL/);
  assert.match(deploy, /docker compose run --rm/);
  assert.match(deploy, /"\$service" node scripts\/migrate\.mjs/);
  assert.doesNotMatch(deploy, /docker compose run .*npm run migrate/);
});
