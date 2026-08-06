import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import postgres from 'postgres';

const adminUrl = process.env.TEST_DATABASE_URL;

test('PostgreSQL lifecycle erasure preserves only the documented records', {
  skip: !adminUrl,
  timeout: 30_000,
}, async () => {
  const databaseName = `boss_kamp_integration_${process.pid}_${Date.now()}`;
  const admin = postgres(adminUrl!, { max: 1 });
  const databaseUrl = new URL(adminUrl!);
  databaseUrl.pathname = `/${databaseName}`;
  let database: ReturnType<typeof postgres> | null = null;
  let appSql: (typeof import('./db.js'))['sql'] | null = null;
  let app: FastifyInstance | null = null;

  try {
    await admin.unsafe(`create database ${databaseName}`);
    database = postgres(databaseUrl.toString(), { max: 1 });
    const schema = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');
    await database.unsafe(schema);
    const migrationsUrl = new URL('../migrations/', import.meta.url);
    const migrationNames = (await readdir(migrationsUrl))
      .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
      .sort();
    for (const name of migrationNames) {
      await database.unsafe(await readFile(new URL(name, migrationsUrl), 'utf8'));
    }

    process.env.DATABASE_URL = databaseUrl.toString();
    process.env.LOG_LEVEL = 'silent';
    const server = await import('./index.js');
    const dbModule = await import('./db.js');
    appSql = dbModule.sql;
    app = await server.buildApp();

    const call = async (
      method: 'GET' | 'POST' | 'DELETE',
      url: string,
      token?: string,
      payload?: Record<string, unknown>,
    ) => {
      const response = await app!.inject({
        method, url,
        headers: token ? { authorization: `Bearer ${token}` } : undefined,
        payload,
      });
      return { status: response.statusCode, body: response.json() as Record<string, any> };
    };
    const register = async (email: string, name: string) => {
      const result = await call('POST', '/api/auth/register', undefined, {
        email, displayName: name, password: 'integration-password',
      });
      assert.equal(result.status, 200);
      return { token: String(result.body.session.token), userId: String(result.body.user.id) };
    };
    const bootstrap = async (token: string, name: string) => {
      const result = await call('POST', '/api/bootstrap', token, { householdName: name, timezone: 'Europe/Oslo' });
      assert.equal(result.status, 200);
      return String(result.body.householdId);
    };

    const first = await register('first@example.com', 'First Parent');
    const additionalLogin = await call('POST', '/api/auth/login', undefined, {
      email: 'first@example.com', password: 'integration-password',
    });
    assert.equal(additionalLogin.status, 200);
    const additionalToken = String(additionalLogin.body.session.token);
    const activeSessions = await call('GET', '/api/me/sessions', first.token);
    assert.equal(activeSessions.status, 200);
    assert.equal(activeSessions.body.sessions.length, 2);
    const otherSession = activeSessions.body.sessions.find((session: Record<string, unknown>) => session.current === false);
    assert.ok(otherSession);
    assert.equal('token_hash' in otherSession, false);
    const revokedSession = await call('DELETE', `/api/me/sessions/${otherSession.id}`, first.token);
    assert.equal(revokedSession.status, 200);
    assert.equal(revokedSession.body.current, false);
    assert.equal((await call('GET', '/api/me', additionalToken)).status, 401);
    const idleLogin = await call('POST', '/api/auth/login', undefined, {
      email: 'first@example.com', password: 'integration-password',
    });
    const idleToken = String(idleLogin.body.session.token);
    const idleTokenHash = createHash('sha256').update(idleToken).digest('hex');
    await database`
      update sessions set last_used_at = now() - interval '31 days'
      where token_hash = ${idleTokenHash}
    `;
    assert.equal((await call('GET', '/api/me', idleToken)).status, 401);

    const firstHousehold = await bootstrap(first.token, 'First Family');
    const coercedBoolean = await call('POST', `/api/households/${firstHousehold}/bosses`, first.token, {
      name: 'Invalid boss', sprite: 'invalid.webp', rare: 'false',
    });
    assert.equal(coercedBoolean.status, 400);
    assert.equal(coercedBoolean.body.code, 'invalid_request');
    const coercedNumber = await call('POST', `/api/households/${firstHousehold}/fighters`, first.token, {
      name: 'Invalid fighter', color: '#F4B942', sort: '1',
    });
    assert.equal(coercedNumber.status, 400);
    assert.equal(coercedNumber.body.code, 'invalid_request');
    const oversizedName = await call('POST', `/api/households/${firstHousehold}/fighters`, first.token, {
      name: 'x'.repeat(121), color: '#F4B942', sort: 1,
    });
    assert.equal(oversizedName.status, 400);
    assert.equal(oversizedName.body.code, 'invalid_request');
    const fighter = await call('POST', `/api/households/${firstHousehold}/fighters`, first.token, {
      name: 'Child Name', color: '#F4B942', sort: 1,
    });
    assert.equal(fighter.status, 200);
    const fighterId = String(fighter.body.fighter.id);
    const child = await call('POST', `/api/households/${firstHousehold}/children`, first.token, {
      fighterId, pin: '1234', authorized: true, privacyNoticeVersion: '2026-08-05.4',
    });
    assert.equal(child.status, 200);
    const childUserId = String(child.body.user.id);
    const avatarHash = createHash('sha256').update(Buffer.from('avatar')).digest('hex');
    await database`
      insert into fighter_avatars (fighter_id, mime, bytes, hash)
      values (${fighterId}, 'image/png', ${Buffer.from('avatar')}, ${avatarHash})
    `;
    await database`update fighters set avatar_hash = ${avatarHash} where id = ${fighterId}`;
    const fullAvatarPull = await call('GET', `/api/sync/pull?household_id=${firstHousehold}`, first.token);
    assert.equal(fullAvatarPull.status, 200);
    assert.equal(fullAvatarPull.body.mutable.fighter_avatars.length, 1);
    assert.equal(fullAvatarPull.body.mutable.fighter_avatars[0].hash, avatarHash);
    const avatarQuery = new URLSearchParams({
      household_id: firstHousehold,
      known_avatar_hashes: JSON.stringify({ [fighterId]: avatarHash }),
    });
    const cachedAvatarPull = await call('GET', `/api/sync/pull?${avatarQuery}`, first.token);
    assert.equal(cachedAvatarPull.status, 200);
    assert.equal(cachedAvatarPull.body.mutable.fighter_avatars.length, 0);
    const unchangedConfigurationPull = await call(
      'GET',
      `/api/sync/pull?household_id=${firstHousehold}&known_configuration_revision=${fullAvatarPull.body.configurationRevision}`,
      first.token,
    );
    assert.equal(unchangedConfigurationPull.status, 200);
    assert.equal(unchangedConfigurationPull.body.configurationUnchanged, true);
    assert.deepEqual(unchangedConfigurationPull.body.mutable, {
      households: [], fighters: [], fighter_avatars: [], bosses: [], chores: [],
    });
    const [childDevice] = await database`
      insert into devices (household_id, user_id, kind, name, platform, token_hash)
      values (${firstHousehold}, ${childUserId}, 'personal', 'Child tablet', 'android', 'device-hash')
      returning id
    `;
    await database`
      insert into sessions (user_id, device_id, token_hash, expires_at)
      values (${childUserId}, ${childDevice.id}, 'child-session-hash', now() + interval '1 day')
    `;

    const erasedChild = await call('DELETE', `/api/households/${firstHousehold}/children/${fighterId}`, first.token);
    assert.equal(erasedChild.status, 200);
    assert.equal((await database`select count(*)::int as count from users where id = ${childUserId}`)[0].count, 0);
    assert.equal((await database`select count(*)::int as count from fighter_credentials where fighter_id = ${fighterId}`)[0].count, 0);
    assert.equal((await database`select count(*)::int as count from fighter_avatars where fighter_id = ${fighterId}`)[0].count, 0);
    const [erasedFighter] = await database`select name, user_id, deleted_at from fighters where id = ${fighterId}`;
    assert.equal(erasedFighter.name, 'Erased fighter');
    assert.equal(erasedFighter.user_id, null);
    assert.ok(erasedFighter.deleted_at);

    const householdChildFighter = await call('POST', `/api/households/${firstHousehold}/fighters`, first.token, {
      name: 'Second Child', color: '#E0564A', sort: 2,
    });
    const householdChild = await call('POST', `/api/households/${firstHousehold}/children`, first.token, {
      fighterId: householdChildFighter.body.fighter.id, pin: '5678', authorized: true,
      privacyNoticeVersion: '2026-08-05.4',
    });
    const householdChildUserId = String(householdChild.body.user.id);
    const erasedHousehold = await call('DELETE', `/api/households/${firstHousehold}`, first.token, {
      password: 'integration-password', confirmedName: 'First Family',
    });
    assert.equal(erasedHousehold.status, 200);
    assert.equal((await database`select count(*)::int as count from households where id = ${firstHousehold}`)[0].count, 0);
    assert.equal((await database`select count(*)::int as count from users where id = ${householdChildUserId}`)[0].count, 0);
    assert.equal((await database`select count(*)::int as count from users where id = ${first.userId}`)[0].count, 1);

    const second = await register('second@example.com', 'Second Parent');
    const secondHousehold = await bootstrap(second.token, 'Second Family');
    const [concurrentFighter] = await database`
      insert into fighters (household_id, name, color, created_by_user_id)
      values (${secondHousehold}, 'Concurrent fighter', '#F4B942', ${second.userId})
      returning id
    `;
    const [concurrentBoss] = await database`
      insert into bosses (household_id, name, sprite, trigger_type)
      values (${secondHousehold}, 'Concurrency boss', 'test.webp', 'alltid')
      returning id
    `;
    const [concurrentChore] = await database`
      insert into chores (household_id, boss_id, title, damage, repeatable)
      values (${secondHousehold}, ${concurrentBoss.id}, 'Final blow', 40, false)
      returning id
    `;
    const concurrentConfig = await call('GET', `/api/households/${secondHousehold}/config`, second.token);
    const concurrentBossView = concurrentConfig.body.bosses.find(
      (boss: Record<string, unknown>) => boss.id === concurrentBoss.id,
    );
    assert.ok(concurrentBossView);
    const completion = () => ({
      type: 'chore_completion',
      payload: {
        id: randomUUID(), bossId: concurrentBoss.id, choreId: concurrentChore.id,
        fighterId: concurrentFighter.id, cycleKey: concurrentBossView.current_cycle_key,
        resetSeq: 0, completedAt: new Date().toISOString(),
      },
    });
    const concurrentResults = await Promise.all([
      call('POST', '/api/sync/push', second.token, { householdId: secondHousehold, mutations: [completion()] }),
      call('POST', '/api/sync/push', second.token, { householdId: secondHousehold, mutations: [completion()] }),
    ]);
    assert.deepEqual(concurrentResults.map((result) => result.status), [200, 200]);
    const outcomes = concurrentResults.map((result) => result.body.results[0].outcome).sort();
    assert.deepEqual(outcomes, ['accepted', 'rejected']);
    assert.equal((await database`
      select count(*)::int as count from chore_completions
      where household_id = ${secondHousehold} and boss_id = ${concurrentBoss.id}
    `)[0].count, 1);
    assert.equal((await database`
      select count(*)::int as count from boss_victories
      where household_id = ${secondHousehold} and boss_id = ${concurrentBoss.id}
    `)[0].count, 1);
    assert.equal((await database`
      select count(*)::int as count from wallet_transactions
      where household_id = ${secondHousehold} and reference_type = 'boss_victory'
    `)[0].count, 1);
    const [walletBaseline] = await database`
      select coalesce(max(server_seq), 0)::int as server_seq
      from wallet_transactions where household_id = ${secondHousehold}
    `;
    const cursorWallet = await database`
      insert into wallet_transactions (household_id, amount, kind, note)
      values
        (${secondHousehold}, 1, 'adjustment', 'page one'),
        (${secondHousehold}, 2, 'adjustment', 'page two')
      returning server_seq
    `;
    const firstEventPage = await call(
      'GET', `/api/sync/pull?household_id=${secondHousehold}&event_limit=1&since_wallet_transactions=${walletBaseline.server_seq}`, second.token,
    );
    assert.equal(firstEventPage.status, 200);
    assert.equal(firstEventPage.body.events.wallet_transactions.length, 1);
    assert.equal(firstEventPage.body.eventHasMore.wallet_transactions, true);
    assert.equal(Number(firstEventPage.body.events.wallet_transactions[0].server_seq), Number(cursorWallet[0].server_seq));
    const secondEventPage = await call(
      'GET',
      `/api/sync/pull?household_id=${secondHousehold}&event_limit=1&since_wallet_transactions=${cursorWallet[0].server_seq}`,
      second.token,
    );
    assert.equal(secondEventPage.status, 200);
    assert.equal(secondEventPage.body.events.wallet_transactions.length, 1);
    assert.equal(secondEventPage.body.eventHasMore.wallet_transactions, false);
    assert.equal(Number(secondEventPage.body.events.wallet_transactions[0].server_seq), Number(cursorWallet[1].server_seq));
    const [cursorReward] = await database`
      insert into rewards (household_id, scope, icon, title, descr, cost)
      values (${secondHousehold}, 'group', 'test', 'Cursor reward', '', 10)
      returning id
    `;
    const [cursorRedemption] = await database`
      insert into reward_redemptions (household_id, reward_id, scope, title, cost, status)
      values (${secondHousehold}, ${cursorReward.id}, 'group', 'Cursor reward', 10, 'active')
      returning id, server_seq
    `;
    const [transitionedRedemption] = await database`
      update reward_redemptions set status = 'used' where id = ${cursorRedemption.id}
      returning server_seq
    `;
    assert.ok(Number(transitionedRedemption.server_seq) > Number(cursorRedemption.server_seq));
    const incrementalRedemptions = await call(
      'GET',
      `/api/sync/pull?household_id=${secondHousehold}&since_reward_redemptions=${cursorRedemption.server_seq}`,
      second.token,
    );
    assert.equal(incrementalRedemptions.status, 200);
    assert.equal(incrementalRedemptions.body.events.reward_redemptions.length, 1);
    assert.equal(incrementalRedemptions.body.events.reward_redemptions[0].status, 'used');
    const blocked = await call('DELETE', '/api/me', second.token, {
      password: 'integration-password', confirmedEmail: 'second@example.com',
    });
    assert.equal(blocked.status, 422);

    const replacement = await register('replacement@example.com', 'Replacement Owner');
    await database`
      insert into household_members (household_id, user_id, role, status, invited_by_user_id)
      values (${secondHousehold}, ${replacement.userId}, 'owner', 'active', ${second.userId})
    `;
    const adultFighter = await database`
      insert into fighters (household_id, user_id, name, color, created_by_user_id)
      values (${secondHousehold}, ${second.userId}, 'Second Parent', '#67D391', ${second.userId})
      returning id
    `;
    await database`
      insert into fighter_avatars (fighter_id, mime, bytes, hash)
      values (${adultFighter[0].id}, 'image/png', ${Buffer.from('adult-avatar')}, 'adult-avatar-hash')
    `;
    const authorizationFighter = await call('POST', `/api/households/${secondHousehold}/fighters`, second.token, {
      name: 'Authorized Child', color: '#5B9BE8', sort: 3,
    });
    const authorizationChild = await call('POST', `/api/households/${secondHousehold}/children`, second.token, {
      fighterId: authorizationFighter.body.fighter.id, pin: '9012', authorized: true,
      privacyNoticeVersion: '2026-08-05.4',
    });
    assert.equal(authorizationChild.status, 200);

    const erasedAdult = await call('DELETE', '/api/me', second.token, {
      password: 'integration-password', confirmedEmail: 'SECOND@example.com',
    });
    assert.equal(erasedAdult.status, 200);
    assert.equal((await database`select count(*)::int as count from users where id = ${second.userId}`)[0].count, 0);
    const [retainedHousehold] = await database`select created_by_user_id from households where id = ${secondHousehold}`;
    assert.equal(String(retainedHousehold.created_by_user_id), replacement.userId);
    const [retainedAuthorization] = await database`
      select authorized_by_user_id, privacy_notice_version from child_authorizations
      where child_user_id = ${authorizationChild.body.user.id}
    `;
    assert.equal(retainedAuthorization.authorized_by_user_id, null);
    assert.equal(retainedAuthorization.privacy_notice_version, '2026-08-05.4');

    const recovery = await register('recovery@example.com', 'Recovery Parent');
    const recoverySecondLogin = await call('POST', '/api/auth/login', undefined, {
      email: 'recovery@example.com', password: 'integration-password',
    });
    assert.equal(recoverySecondLogin.status, 200);
    const unknownRecovery = await call('POST', '/api/auth/password-reset/request', undefined, {
      email: 'unknown@example.com',
    });
    assert.equal(unknownRecovery.status, 200);
    assert.equal(unknownRecovery.body.accepted, true);
    const resetToken = 'integration-reset-token';
    await database`
      insert into password_reset_tokens (user_id, token_hash, expires_at)
      values (${recovery.userId}, ${createHash('sha256').update(resetToken).digest('hex')}, now() + interval '30 minutes')
    `;
    const reset = await call('POST', '/api/auth/password-reset/confirm', undefined, {
      token: resetToken, password: 'new-integration-password',
    });
    assert.equal(reset.status, 200);
    assert.equal((await call('GET', '/api/me', recovery.token)).status, 401);
    assert.equal((await call('GET', '/api/me', String(recoverySecondLogin.body.session.token))).status, 401);
    assert.equal((await call('POST', '/api/auth/login', undefined, {
      email: 'recovery@example.com', password: 'integration-password',
    })).status, 401);
    assert.equal((await call('POST', '/api/auth/login', undefined, {
      email: 'recovery@example.com', password: 'new-integration-password',
    })).status, 200);
    assert.equal((await call('POST', '/api/auth/password-reset/confirm', undefined, {
      token: resetToken, password: 'another-integration-password',
    })).status, 400);

    const verification = await register('verification@example.com', 'Verify Parent');
    const verificationToken = 'integration-verification-token';
    await database`
      insert into email_verification_tokens (user_id, token_hash, expires_at)
      values (${verification.userId}, ${createHash('sha256').update(verificationToken).digest('hex')}, now() + interval '1 day')
    `;
    assert.equal((await call('POST', '/api/auth/email-verification/confirm', undefined, {
      token: verificationToken,
    })).status, 200);
    const verifiedMe = await call('GET', '/api/me', verification.token);
    assert.ok(verifiedMe.body.user.email_verified_at);
    assert.equal((await call('POST', '/api/auth/email-verification/confirm', undefined, {
      token: verificationToken,
    })).status, 400);

    await app.close();
    app = null;
    await appSql.end({ timeout: 1 });
    appSql = null;
  } finally {
    if (app) await app.close();
    if (appSql) await appSql.end({ timeout: 1 });
    if (database) await database.end({ timeout: 1 });
    await admin.unsafe(`drop database if exists ${databaseName} with (force)`);
    await admin.end({ timeout: 1 });
  }
});
