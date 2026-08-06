import 'dotenv/config';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { sql } from './db.js';
import { assertCanManageMembership, type GovernanceRole } from './governance.js';
import { acceptedPrivacyNoticeVersion, assertChildErasureTarget, assertHouseholdErasureConfirmation, PRIVACY_NOTICE_VERSION, privacyExportRows } from './privacy.js';
import { runOperationalRetention } from './retention.js';
import { apiSecurityHeaders, configuredCorsOrigins, trustProxyEnabled } from './apiSecurity.js';
import {
  optionalBoolean, optionalNumber, optionalNumberOrNull,
  optionalString, requiredString, requireObjectArray, stringValue,
} from './requestValidation.js';
import { validatedAvatar } from './avatarValidation.js';
import {
  bootstrapSchema, childCreateSchema, childParamsSchema,
  fighterCreateSchema, fighterParamsSchema, fighterPatchSchema, householdEraseSchema,
  householdParamsSchema, householdPatchSchema, pinSchema, suspendSchema,
} from './routeSchemas.js';
import { recordRequest } from './observability.js';
import { installApiErrorHandler } from './apiErrors.js';
import { registerOperationalRoutes } from './operationalRoutes.js';
import { registerGameplayRoutes } from './gameplayRoutes.js';
import { registerInvitationRoutes } from './invitationRoutes.js';
import { registerSyncPullRoutes } from './syncPullRoutes.js';
import { registerSyncPushRoutes } from './syncPushRoutes.js';
import { registerAuthAccountRoutes } from './authAccountRoutes.js';
import { bearerToken, deviceToken, hashSecret, requireAuth, tokenHash, verifyPassword, type AuthContext } from './authentication.js';

type JsonObject = Record<string, unknown>;
type PrincipalContext = { userId: string | null; sessionId?: string; deviceId?: string; kind: 'user' | 'household_device' };
type HouseholdRole = 'owner' | 'parent' | 'member' | 'child';

const requireString = requiredString;

function requireObject(body: unknown): JsonObject {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Expected JSON object');
  }
  return body as JsonObject;
}

function requireObjects(value: unknown, field: string): JsonObject[] {
  return requireObjectArray(value, field);
}

function publicId(row: JsonObject) {
  return requireString(row.id, 'id');
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Preserve IDs that already came from the server. For pre-sync local IDs,
 * derive a stable household-scoped UUID so bootstrap/configuration retries can
 * use the primary key for idempotency without requiring a client_id column.
 */
function entityId(householdId: string, entity: string, clientId: string) {
  if (uuidPattern.test(clientId)) return clientId.toLowerCase();
  const bytes = createHash('sha256')
    .update(`boss-kamp|${householdId}|${entity}|${clientId}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function requireHouseholdMember(userId: string, householdId: string) {
  const [member] = await sql`
    select id, role from household_members
    where household_id = ${householdId}
      and user_id = ${userId}
      and status = 'active'
  `;
  if (!member) throw new Error('Forbidden');
  return member;
}

async function requireHouseholdPrincipal(request: FastifyRequest, householdId: string): Promise<PrincipalContext> {
  const token = bearerToken(request);
  if (token) {
    const auth = await requireAuth(request);
    await requireHouseholdMember(auth.userId, householdId);
    return { ...auth, kind: 'user' };
  }

  const tokenFromDevice = deviceToken(request);
  if (tokenFromDevice) {
    const [device] = await sql`
      update devices
      set last_seen_at = now()
      where household_id = ${householdId}
        and kind = 'household'
        and token_hash = ${tokenHash(tokenFromDevice)}
        and revoked_at is null
      returning id
    `;
    if (!device) throw new Error('Unauthorized');
    return { userId: null, deviceId: publicId(device), kind: 'household_device' };
  }

  throw new Error('Unauthorized');
}

async function requireHouseholdRole(userId: string, householdId: string, roles: HouseholdRole[]) {
  const member = await requireHouseholdMember(userId, householdId);
  const role = requireString(member.role, 'role') as HouseholdRole;
  if (!roles.includes(role)) throw new Error('Forbidden');
  return member;
}

async function assertHouseholdRow(table: 'bosses' | 'chores' | 'fighters' | 'rewards' | 'devices', id: string, householdId: string) {
  const rows = await sql`
    select id from ${sql(table)}
    where id = ${id} and household_id = ${householdId}
    limit 1
  `;
  if (rows.length === 0) throw new Error(`${table} row does not belong to household`);
}

async function assertNullableHouseholdRow(
  table: 'fighters' | 'rewards' | 'devices',
  id: string | null,
  householdId: string
) {
  if (id) await assertHouseholdRow(table, id, householdId);
}

function householdDate(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short'
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return {
    iso: `${part('year')}-${part('month')}-${part('day')}`,
    year: Number(part('year')),
    month: Number(part('month')),
    day: Number(part('day')),
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(part('weekday'))
  };
}

function serverCycleKey(boss: JsonObject, timezone: string, now = new Date()) {
  const date = householdDate(timezone, now);
  const type = requireString(boss.trigger_type, 'trigger_type');
  if (type === 'daglig' || type === 'sjelden') return `d${date.iso}`;
  if (type === 'ukentlig') {
    const start = new Date(Date.UTC(date.year, 0, 1));
    const current = new Date(Date.UTC(date.year, date.month - 1, date.day));
    const week = Math.floor(((current.getTime() - start.getTime()) / 86400000 + start.getUTCDay()) / 7);
    return `w${date.year}-${week}`;
  }
  if (type === 'månedlig') return `m${date.year}-${date.month}`;
  return 'alltid';
}

function serverBossAvailable(boss: JsonObject, householdId: string, timezone: string, now = new Date()) {
  const date = householdDate(timezone, now);
  const type = requireString(boss.trigger_type, 'trigger_type');
  if (type === 'sjelden') {
    const digest = createHash('sha256').update(`${householdId}|${boss.id}|${date.iso}|rare`).digest();
    return digest.readUInt32BE(0) % 100 < 3;
  }
  if (type === 'ukentlig') return ((date.weekday + 6) % 7) >= ((Number(boss.trigger_day ?? 0) + 6) % 7);
  if (type === 'månedlig') return date.day >= Number(boss.trigger_date ?? 1);
  return true;
}

function serverBossElite(boss: JsonObject, householdId: string, timezone: string, now = new Date()) {
  if (Boolean(boss.rare)) return false;
  const cycle = requireString(boss.trigger_type, 'trigger_type') === 'alltid'
    ? `d${householdDate(timezone, now).iso}`
    : serverCycleKey(boss, timezone, now);
  const digest = createHash('sha256').update(`${householdId}|${boss.id}|${cycle}|elite`).digest();
  return digest.readUInt32BE(0) % 100 < 22;
}

function decorateBosses(rows: JsonObject[], householdId: string, timezone: string) {
  return rows.map((boss) => ({
    ...boss,
    current_cycle_key: serverCycleKey(boss, timezone),
    available: serverBossAvailable(boss, householdId, timezone),
    elite: serverBossElite(boss, householdId, timezone)
  }));
}

export async function buildApp() {
  const production = process.env.NODE_ENV === 'production';
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    trustProxy: trustProxyEnabled(process.env.TRUST_PROXY),
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false } },
  });

  await app.register(cors, {
    origin: configuredCorsOrigins(process.env.CORS_ORIGIN, production),
  });

  app.addHook('onSend', async (request, reply) => {
    for (const [name, value] of Object.entries(apiSecurityHeaders)) reply.header(name, value);
    reply.header('x-request-id', request.id);
  });

  app.addHook('onResponse', async (request, reply) => {
    recordRequest(request.method, request.routeOptions.url ?? 'unmatched', reply.statusCode);
  });

  await app.register(rateLimit, {
    max: Number(process.env.RATE_LIMIT_MAX ?? 300),
    timeWindow: process.env.RATE_LIMIT_WINDOW ?? '1 minute'
  });

  installApiErrorHandler(app);
  registerOperationalRoutes(app);

  registerAuthAccountRoutes(app);

  app.post('/api/bootstrap', { schema: bootstrapSchema }, async (request) => {
    const auth = await requireAuth(request);
    const body = requireObject(request.body);
    const householdName = requireString(body.householdName, 'householdName');
    const timezone = optionalString(body.timezone) ?? 'Europe/Oslo';
    const hasConfiguration = body.fighters !== undefined;
    const fighters = hasConfiguration ? requireObjects(body.fighters, 'fighters') : [];
    const ownerFighterClientId = optionalString(body.ownerFighterClientId);
    const bosses = hasConfiguration ? requireObjects(body.bosses, 'bosses') : [];
    const chores = hasConfiguration ? requireObjects(body.chores, 'chores') : [];
    const rewards = hasConfiguration ? requireObjects(body.rewards, 'rewards') : [];
    if (ownerFighterClientId && !fighters.some((fighter) => requireString(fighter.clientId, 'fighter.clientId') === ownerFighterClientId)) {
      throw new Error('ownerFighterClientId does not reference a submitted fighter');
    }

    const result = await sql.begin(async (tx) => {
      // Serialize first-household creation per user. A retry after a lost HTTP
      // response returns the existing household instead of creating a duplicate.
      await tx`select pg_advisory_xact_lock(hashtext(${auth.userId})::bigint)`;
      const [existing] = await tx`
        select h.id as household_id, hm.id as member_id
        from household_members hm
        join households h on h.id = hm.household_id
        where hm.user_id = ${auth.userId}
          and hm.role = 'owner'
          and hm.status = 'active'
          and h.deleted_at is null
        order by h.created_at
        limit 1
      `;
      let householdId: string;
      let memberId: string;
      let created = false;
      if (existing) {
        householdId = requireString(existing.household_id, 'household_id');
        memberId = requireString(existing.member_id, 'member_id');
      } else {
        const [household] = await tx`
          insert into households (name, timezone, victories_baseline, created_by_user_id)
          values (${householdName}, ${timezone}, ${optionalNumber(body.victoriesBaseline)}, ${auth.userId})
          returning id
        `;
        const [member] = await tx`
          insert into household_members (household_id, user_id, role, status)
          values (${household.id}, ${auth.userId}, 'owner', 'active')
          returning id
        `;
        householdId = publicId(household);
        memberId = publicId(member);
        created = true;
      }

      const ids = {
        fighters: {} as Record<string, string>,
        bosses: {} as Record<string, string>,
        chores: {} as Record<string, string>,
        rewards: {} as Record<string, string>
      };

      if (hasConfiguration) {
        await tx`
          update households
          set name = ${householdName}, timezone = ${timezone},
              victories_baseline = ${optionalNumber(body.victoriesBaseline)}, version = version + 1
          where id = ${householdId}
        `;

        for (const [sort, item] of fighters.entries()) {
          const clientId = requireString(item.clientId, 'fighter.clientId');
          const stableId = entityId(householdId, 'fighter', clientId);
          const name = requireString(item.name, 'fighter.name');
          const [fighter] = await tx`
            insert into fighters (
              id, household_id, user_id, name, color, streak, coins_cached,
              career_xp_cached, sort, created_by_user_id
            ) values (
              ${stableId}, ${householdId}, ${clientId === ownerFighterClientId ? auth.userId : null}::uuid,
              ${name}, ${requireString(item.color, 'fighter.color')},
              ${optionalNumber(item.streak)}, ${optionalNumber(item.coins)},
              ${optionalNumber(item.careerXp)}, ${optionalNumber(item.sort, sort)}, ${auth.userId}
            )
            on conflict (id) do update
            set name = excluded.name, color = excluded.color, streak = excluded.streak,
                coins_cached = excluded.coins_cached, career_xp_cached = excluded.career_xp_cached,
                user_id = coalesce(excluded.user_id, fighters.user_id),
                sort = excluded.sort, deleted_at = null, version = fighters.version + 1
            where fighters.household_id = excluded.household_id
            returning id
          `;
          const fighterId = publicId(fighter);
          ids.fighters[clientId] = fighterId;

          const coins = optionalNumber(item.coins);
          if (coins !== 0) {
            await tx`
              insert into wallet_transactions (
                household_id, fighter_id, amount, kind, reference_type, reference_id,
                note, created_by_user_id
              ) values (
                ${householdId}, ${fighterId}, ${coins}, 'adjustment', 'local_bootstrap',
                ${fighterId}, 'Initial local balance', ${auth.userId}
              ) on conflict do nothing
            `;
          }

          if (item.avatar !== undefined && item.avatar !== null) {
            const { mime, bytes, hash } = validatedAvatar(item.avatar);
            await tx`
              insert into fighter_avatars (fighter_id, mime, bytes, hash)
              values (${fighterId}, ${mime}, ${bytes}, ${hash})
              on conflict (fighter_id) do update
              set mime = excluded.mime, bytes = excluded.bytes, hash = excluded.hash
            `;
            await tx`update fighters set avatar_hash = ${hash} where id = ${fighterId}`;
          }
        }

        for (const [sort, item] of bosses.entries()) {
          const clientId = requireString(item.clientId, 'boss.clientId');
          const stableId = entityId(householdId, 'boss', clientId);
          const trigger = requireObject(item.trigger);
          const [boss] = await tx`
            insert into bosses (
              id, household_id, name, sprite, frames, rare, hue,
              trigger_type, trigger_day, trigger_date, trigger_note,
              dormant, unlock_at, sort
            ) values (
              ${stableId}, ${householdId}, ${requireString(item.name, 'boss.name')},
              ${requireString(item.sprite, 'boss.sprite')}, ${optionalNumber(item.frames)},
              ${optionalBoolean(item.rare)}, ${optionalNumberOrNull(item.hue)},
              ${requireString(trigger.type, 'trigger.type')}, ${optionalNumberOrNull(trigger.day)},
              ${optionalNumberOrNull(trigger.date)}, ${optionalString(trigger.note)},
              ${optionalBoolean(item.dormant)}, ${optionalNumber(item.unlockAt)},
              ${optionalNumber(item.sort, sort)}
            )
            on conflict (id) do update
            set name = excluded.name, sprite = excluded.sprite, frames = excluded.frames,
                rare = excluded.rare, hue = excluded.hue, trigger_type = excluded.trigger_type,
                trigger_day = excluded.trigger_day, trigger_date = excluded.trigger_date,
                trigger_note = excluded.trigger_note, dormant = excluded.dormant,
                unlock_at = excluded.unlock_at, sort = excluded.sort,
                deleted_at = null, version = bosses.version + 1
            where bosses.household_id = excluded.household_id
            returning id
          `;
          ids.bosses[clientId] = publicId(boss);
        }

        for (const [sort, item] of chores.entries()) {
          const clientId = requireString(item.clientId, 'chore.clientId');
          const stableId = entityId(householdId, 'chore', clientId);
          const bossId = ids.bosses[requireString(item.bossClientId, 'chore.bossClientId')];
          if (!bossId) throw new Error('chore.bossClientId does not reference a submitted boss');
          const [chore] = await tx`
            insert into chores (
              id, household_id, boss_id, title, damage, repeatable, sort
            ) values (
              ${stableId}, ${householdId}, ${bossId}, ${stringValue(item.title, 'chore.title')},
              ${optionalNumber(item.damage)}, ${optionalBoolean(item.repeatable)},
              ${optionalNumber(item.sort, sort)}
            )
            on conflict (id) do update
            set boss_id = excluded.boss_id, title = excluded.title, damage = excluded.damage,
                repeatable = excluded.repeatable, sort = excluded.sort,
                deleted_at = null, version = chores.version + 1
            where chores.household_id = excluded.household_id
            returning id
          `;
          ids.chores[clientId] = publicId(chore);
        }

        for (const [sort, item] of rewards.entries()) {
          const clientId = requireString(item.clientId, 'reward.clientId');
          const stableId = entityId(householdId, 'reward', clientId);
          const [reward] = await tx`
            insert into rewards (id, household_id, scope, icon, title, descr, cost, sort)
            values (
              ${stableId}, ${householdId}, ${requireString(item.scope, 'reward.scope')},
              ${stringValue(item.icon, 'reward.icon')}, ${requireString(item.title, 'reward.title')},
              ${stringValue(item.description, 'reward.description')}, ${optionalNumber(item.cost)},
              ${optionalNumber(item.sort, sort)}
            )
            on conflict (id) do update
            set scope = excluded.scope, icon = excluded.icon, title = excluded.title,
                descr = excluded.descr, cost = excluded.cost, sort = excluded.sort,
                deleted_at = null, version = rewards.version + 1
            where rewards.household_id = excluded.household_id
            returning id
          `;
          ids.rewards[clientId] = publicId(reward);
        }

        const pool = optionalNumber(body.pool);
        if (pool !== 0) {
          await tx`
            insert into wallet_transactions (
              household_id, fighter_id, amount, kind, reference_type, reference_id,
              note, created_by_user_id
            ) values (
              ${householdId}, null, ${pool}, 'adjustment', 'local_bootstrap',
              ${householdId}, 'Initial local shared balance', ${auth.userId}
            ) on conflict do nothing
          `;
        }
      }

      return { userId: auth.userId, householdId, memberId, created, ids };
    });

    return result;
  });

  app.get('/api/households/:householdId/config', { schema: householdParamsSchema }, async (request) => {
    const auth = await requireAuth(request);
    const householdId = (request.params as { householdId: string }).householdId;
    await requireHouseholdMember(auth.userId, householdId);

    const [household] = await sql`
      select * from households where id = ${householdId} and deleted_at is null
    `;
    if (!household) return { household: null };

    const [members, fighters, avatars, bosses, chores, rewards, balances] = await Promise.all([
      sql`select * from household_members where household_id = ${householdId} order by joined_at`,
      sql`
        select f.*, u.kind as user_kind, hm.status as account_status, hm.role as account_role
        from fighters f
        left join users u on u.id = f.user_id
        left join household_members hm on hm.household_id = f.household_id and hm.user_id = f.user_id
        where f.household_id = ${householdId}
        order by f.sort, f.created_at, f.id
      `,
      sql`
        select fa.fighter_id, fa.mime, encode(fa.bytes, 'base64') as bytes_base64, fa.hash
        from fighter_avatars fa
        join fighters f on f.id = fa.fighter_id
        where f.household_id = ${householdId}
      `,
      sql`select * from bosses where household_id = ${householdId} order by sort, created_at`,
      sql`select * from chores where household_id = ${householdId} order by sort, created_at`,
      sql`select * from rewards where household_id = ${householdId} order by scope, sort, created_at`,
      sql`
        select fighter_id, coalesce(sum(amount), 0)::integer as balance
        from wallet_transactions
        where household_id = ${householdId}
        group by fighter_id
      `
    ]);

    return {
      household, members, fighters, fighterAvatars: avatars,
      bosses: decorateBosses(bosses, householdId, requireString(household.timezone, 'timezone')),
      chores, rewards, balances
    };
  });

  app.get('/api/households/:householdId/export', { schema: householdParamsSchema }, async (request) => {
    const auth = await requireAuth(request);
    const householdId = (request.params as { householdId: string }).householdId;
    await requireHouseholdRole(auth.userId, householdId, ['owner', 'parent']);

    const [household] = await sql`
      select * from households where id = ${householdId} and deleted_at is null
    `;
    if (!household) throw new Error('Not found');

    const [
      members, childAuthorizations, devices, fighters, fighterAvatars, invites,
      pairings, bosses, chores, rewards, choreCompletions, bossResets,
      bossVictories, walletTransactions, rewardRedemptions,
    ] = await Promise.all([
      sql`
        select hm.*, u.kind, u.display_name, u.email
        from household_members hm
        join users u on u.id = hm.user_id
        where hm.household_id = ${householdId}
        order by hm.joined_at, hm.id
      `,
      sql`select * from child_authorizations where household_id = ${householdId} order by authorized_at, id`,
      sql`select * from devices where household_id = ${householdId} order by created_at, id`,
      sql`select * from fighters where household_id = ${householdId} order by sort, created_at, id`,
      sql`
        select fa.fighter_id, fa.mime, encode(fa.bytes, 'base64') as bytes_base64,
               fa.hash, fa.updated_at
        from fighter_avatars fa
        join fighters f on f.id = fa.fighter_id
        where f.household_id = ${householdId}
        order by fa.fighter_id
      `,
      sql`select * from household_invites where household_id = ${householdId} order by created_at, id`,
      sql`select * from device_pairings where household_id = ${householdId} order by created_at, id`,
      sql`select * from bosses where household_id = ${householdId} order by sort, created_at, id`,
      sql`select * from chores where household_id = ${householdId} order by sort, created_at, id`,
      sql`select * from rewards where household_id = ${householdId} order by scope, sort, created_at, id`,
      sql`select * from chore_completions where household_id = ${householdId} order by created_at, id`,
      sql`select * from boss_resets where household_id = ${householdId} order by created_at, id`,
      sql`select * from boss_victories where household_id = ${householdId} order by created_at, id`,
      sql`select * from wallet_transactions where household_id = ${householdId} order by created_at, id`,
      sql`select * from reward_redemptions where household_id = ${householdId} order by created_at, id`,
    ]);

    return {
      format: 'boss-kamp-household-export',
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
      data: {
        household: privacyExportRows('household', [household])[0],
        members: privacyExportRows('members', members),
        childAuthorizations: privacyExportRows('childAuthorizations', childAuthorizations),
        devices: privacyExportRows('devices', devices),
        fighters: privacyExportRows('fighters', fighters),
        fighterAvatars: privacyExportRows('fighterAvatars', fighterAvatars),
        invites: privacyExportRows('invites', invites),
        pairings: privacyExportRows('pairings', pairings),
        bosses: privacyExportRows('bosses', bosses),
        chores: privacyExportRows('chores', chores),
        rewards: privacyExportRows('rewards', rewards),
        choreCompletions: privacyExportRows('choreCompletions', choreCompletions),
        bossResets: privacyExportRows('bossResets', bossResets),
        bossVictories: privacyExportRows('bossVictories', bossVictories),
        walletTransactions: privacyExportRows('walletTransactions', walletTransactions),
        rewardRedemptions: privacyExportRows('rewardRedemptions', rewardRedemptions),
      },
    };
  });

  app.delete('/api/households/:householdId', { schema: householdEraseSchema }, async (request) => {
    const auth = await requireAuth(request);
    const householdId = (request.params as { householdId: string }).householdId;
    await requireHouseholdRole(auth.userId, householdId, ['owner']);
    const body = requireObject(request.body);
    const password = requireString(body.password, 'password');
    const confirmedName = requireString(body.confirmedName, 'confirmedName');

    return sql.begin(async (tx) => {
      const [context] = await tx`
        select h.id, h.name, u.password_hash
        from households h
        join users u on u.id = ${auth.userId}
        where h.id = ${householdId} and h.deleted_at is null
          and u.kind = 'adult' and u.deleted_at is null
        for update of h, u
      `;
      if (!context) throw new Error('Not found');
      assertHouseholdErasureConfirmation({ currentName: context.name, confirmedName });
      if (!(await verifyPassword(password, context.password_hash))) throw new Error('Unauthorized');

      const childUsers = await tx`
        select u.id
        from users u
        join household_members hm on hm.user_id = u.id
        where hm.household_id = ${householdId} and u.kind = 'child'
        for update of u
      `;
      await tx`
        update sessions set revoked_at = now()
        where revoked_at is null
          and device_id in (select id from devices where household_id = ${householdId})
      `;
      const [deleted] = await tx`delete from households where id = ${householdId} returning id`;
      if (!deleted) throw new Error('Not found');

      const childUserIds = childUsers.map((user) => String(user.id));
      if (childUserIds.length > 0) {
        await tx`
          delete from users u
          where u.id = any(${childUserIds}::uuid[]) and u.kind = 'child'
            and not exists (select 1 from household_members hm where hm.user_id = u.id)
        `;
      }
      return { ok: true };
    });
  });

  app.patch('/api/households/:householdId', { schema: householdPatchSchema }, async (request) => {
    const auth = await requireAuth(request);
    const householdId = (request.params as { householdId: string }).householdId;
    await requireHouseholdRole(auth.userId, householdId, ['owner', 'parent']);
    const body = requireObject(request.body);

    const [household] = await sql`
      update households
      set name = coalesce(${optionalString(body.name)}, name),
          timezone = coalesce(${optionalString(body.timezone)}, timezone),
          version = version + 1
      where id = ${householdId} and deleted_at is null
      returning *
    `;
    return { household };
  });

  app.post('/api/households/:householdId/fighters', { schema: fighterCreateSchema }, async (request) => {
    const auth = await requireAuth(request);
    const householdId = (request.params as { householdId: string }).householdId;
    await requireHouseholdRole(auth.userId, householdId, ['owner', 'parent']);
    const body = requireObject(request.body);

    const [fighter] = await sql`
      insert into fighters (
        household_id, user_id, name, color, avatar_hash, sort, created_by_user_id
      )
      values (
        ${householdId}, ${optionalString(body.userId)}::uuid, ${requireString(body.name, 'name')},
        ${requireString(body.color, 'color')}, ${optionalString(body.avatarHash)},
        ${optionalNumber(body.sort)}, ${auth.userId}
      )
      returning *
    `;
    return { fighter };
  });

  app.patch('/api/households/:householdId/fighters/:fighterId', { schema: fighterPatchSchema }, async (request) => {
    const auth = await requireAuth(request);
    const { householdId, fighterId } = request.params as { householdId: string; fighterId: string };
    await requireHouseholdRole(auth.userId, householdId, ['owner', 'parent']);
    const body = requireObject(request.body);

    const [fighter] = await sql`
      update fighters
      set name = coalesce(${optionalString(body.name)}, name),
          color = coalesce(${optionalString(body.color)}, color),
          avatar_hash = coalesce(${optionalString(body.avatarHash)}, avatar_hash),
          sort = coalesce(${optionalNumberOrNull(body.sort)}, sort),
          version = version + 1
      where id = ${fighterId} and household_id = ${householdId} and deleted_at is null
      returning *
    `;
    if (!fighter) throw new Error('Not found');
    return { fighter };
  });

  app.delete('/api/households/:householdId/fighters/:fighterId', { schema: fighterParamsSchema }, async (request) => {
    const auth = await requireAuth(request);
    const { householdId, fighterId } = request.params as { householdId: string; fighterId: string };
    await requireHouseholdRole(auth.userId, householdId, ['owner', 'parent']);
    const [fighter] = await sql`
      update fighters
      set deleted_at = now(), version = version + 1
      where id = ${fighterId} and household_id = ${householdId}
        and deleted_at is null and user_id is null
      returning id
    `;
    if (!fighter) {
      const [claimed] = await sql`select id from fighters where id = ${fighterId} and household_id = ${householdId} and deleted_at is null`;
      if (claimed) throw new Error('Claimed fighters require explicit account governance');
      throw new Error('Not found');
    }
    return { ok: true };
  });

  app.post('/api/households/:householdId/children', { schema: childCreateSchema }, async (request) => {
    const auth = await requireAuth(request);
    const householdId = (request.params as { householdId: string }).householdId;
    await requireHouseholdRole(auth.userId, householdId, ['owner', 'parent']);
    const body = requireObject(request.body);
    const fighterId = requireString(body.fighterId, 'fighterId');
    const pin = requireString(body.pin, 'pin');
    if (pin.length < 4) throw new Error('PIN must be at least 4 digits');
    if (body.authorized !== true) {
      throw new Error('Current privacy notice authorization is required');
    }
    const privacyNoticeVersion = acceptedPrivacyNoticeVersion(body.privacyNoticeVersion);

    const result = await sql.begin(async (tx) => {
      const [existingFighter] = await tx`
        select id, name from fighters
        where id = ${fighterId} and household_id = ${householdId}
          and user_id is null and deleted_at is null
        for update
      `;
      if (!existingFighter) throw new Error('Fighter is already claimed or missing');
      const [user] = await tx`
        insert into users (kind, display_name)
        values ('child', ${existingFighter.name})
        returning id, kind, display_name
      `;
      const [member] = await tx`
        insert into household_members (household_id, user_id, role, status, invited_by_user_id)
        values (${householdId}, ${user.id}, 'child', 'active', ${auth.userId})
        returning id
      `;
      const [fighter] = await tx`
        update fighters set user_id = ${user.id}, version = version + 1
        where id = ${fighterId}
        returning *
      `;
      await tx`
        insert into fighter_credentials (fighter_id, pin_hash)
        values (${fighter.id}, ${await hashSecret(pin)})
      `;
      await tx`
        insert into child_authorizations (
          household_id, child_user_id, authorized_by_user_id, privacy_notice_version
        ) values (
          ${householdId}, ${user.id}, ${auth.userId}, ${privacyNoticeVersion}
        )
      `;
      return { user, memberId: publicId(member), fighter };
    });

    return result;
  });

  app.post('/api/households/:householdId/fighters/:fighterId/pin', { schema: pinSchema }, async (request) => {
    const auth = await requireAuth(request);
    const { householdId, fighterId } = request.params as { householdId: string; fighterId: string };
    await requireHouseholdRole(auth.userId, householdId, ['owner', 'parent']);
    const body = requireObject(request.body);
    const pin = requireString(body.pin, 'pin');
    if (pin.length < 4) throw new Error('PIN must be at least 4 digits');
    const [fighter] = await sql`
      select f.id from fighters f join users u on u.id = f.user_id
      where f.id = ${fighterId} and f.household_id = ${householdId}
        and f.deleted_at is null and u.kind = 'child'
    `;
    if (!fighter) throw new Error('Not found');
    await sql`
      insert into fighter_credentials (fighter_id, pin_hash, failed_attempts, locked_until)
      values (${fighterId}, ${await hashSecret(pin)}, 0, null)
      on conflict (fighter_id) do update
      set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null
    `;
    return { ok: true };
  });

  app.post('/api/households/:householdId/fighters/:fighterId/suspend', { schema: suspendSchema }, async (request) => {
    const auth = await requireAuth(request);
    const { householdId, fighterId } = request.params as { householdId: string; fighterId: string };
    const actor = await requireHouseholdRole(auth.userId, householdId, ['owner', 'parent']);
    const body = requireObject(request.body);
    const suspended = body.suspended !== false;
    const result = await sql.begin(async (tx) => {
      const [fighter] = await tx`
        select f.id, f.user_id, hm.role, hm.status
        from fighters f join household_members hm
          on hm.household_id = f.household_id and hm.user_id = f.user_id
        where f.id = ${fighterId} and f.household_id = ${householdId} and f.deleted_at is null
        for update of f, hm
      `;
      if (!fighter?.user_id) throw new Error('Not found');
      const activeOwners = await tx`
        select id from household_members
        where household_id = ${householdId} and role = 'owner' and status = 'active'
        for update
      `;
      assertCanManageMembership({
        actorUserId: auth.userId, actorRole: actor.role as GovernanceRole,
        targetUserId: String(fighter.user_id), targetRole: fighter.role as GovernanceRole,
        removingAccess: suspended && fighter.status === 'active', activeOwnerCount: activeOwners.length,
      });
      await tx`
        update household_members set status = ${suspended ? 'suspended' : 'active'}, version = version + 1
        where household_id = ${householdId} and user_id = ${fighter.user_id}
      `;
      if (suspended) {
        await tx`
          update sessions s set revoked_at = now()
          where s.user_id = ${fighter.user_id} and s.revoked_at is null
            and exists (select 1 from devices d where d.id = s.device_id and d.household_id = ${householdId})
        `;
        await tx`update devices set revoked_at = now() where household_id = ${householdId} and user_id = ${fighter.user_id} and revoked_at is null`;
      }
      return { ok: true };
    });
    return result;
  });

  app.post('/api/households/:householdId/fighters/:fighterId/unlink', { schema: fighterParamsSchema }, async (request) => {
    const auth = await requireAuth(request);
    const { householdId, fighterId } = request.params as { householdId: string; fighterId: string };
    const actor = await requireHouseholdRole(auth.userId, householdId, ['owner', 'parent']);
    return sql.begin(async (tx) => {
      const [fighter] = await tx`
        select f.id, f.user_id, u.kind as user_kind, hm.role, hm.status
        from fighters f left join users u on u.id = f.user_id
        left join household_members hm on hm.household_id = f.household_id and hm.user_id = f.user_id
        where f.id = ${fighterId} and f.household_id = ${householdId} and f.deleted_at is null
        for update of f
      `;
      if (!fighter?.user_id) throw new Error('Not found');
      const activeOwners = await tx`
        select id from household_members
        where household_id = ${householdId} and role = 'owner' and status = 'active'
        for update
      `;
      assertCanManageMembership({
        actorUserId: auth.userId, actorRole: actor.role as GovernanceRole,
        targetUserId: String(fighter.user_id), targetRole: fighter.role as GovernanceRole,
        removingAccess: fighter.status === 'active', activeOwnerCount: activeOwners.length,
      });
      await tx`
        update sessions s set revoked_at = now()
        where s.user_id = ${fighter.user_id} and s.revoked_at is null
          and exists (select 1 from devices d where d.id = s.device_id and d.household_id = ${householdId})
      `;
      await tx`update devices set revoked_at = now() where household_id = ${householdId} and user_id = ${fighter.user_id} and revoked_at is null`;
      await tx`
        update household_members set status = 'left', version = version + 1
        where household_id = ${householdId} and user_id = ${fighter.user_id}
      `;
      if (fighter.user_kind === 'child') {
        await tx`delete from fighter_credentials where fighter_id = ${fighterId}`;
      }
      const [unlinked] = await tx`
        update fighters set user_id = null, require_own_device = false, version = version + 1
        where id = ${fighterId}
        returning *
      `;
      return { fighter: unlinked };
    });
  });

  app.delete('/api/households/:householdId/children/:fighterId', { schema: childParamsSchema }, async (request) => {
    const auth = await requireAuth(request);
    const { householdId, fighterId } = request.params as { householdId: string; fighterId: string };
    const actor = await requireHouseholdRole(auth.userId, householdId, ['owner', 'parent']);

    return sql.begin(async (tx) => {
      const [fighter] = await tx`
        select f.id, f.user_id, u.kind as user_kind, hm.role, hm.status
        from fighters f
        join users u on u.id = f.user_id
        join household_members hm on hm.household_id = f.household_id and hm.user_id = f.user_id
        where f.id = ${fighterId} and f.household_id = ${householdId} and f.deleted_at is null
        for update of f, u, hm
      `;
      if (!fighter) throw new Error('Not found');
      const childUserId = assertChildErasureTarget({
        userId: fighter.user_id, userKind: fighter.user_kind, role: fighter.role,
      });
      assertCanManageMembership({
        actorUserId: auth.userId, actorRole: actor.role as GovernanceRole,
        targetUserId: childUserId, targetRole: 'child', removingAccess: fighter.status === 'active',
        activeOwnerCount: 1,
      });

      await tx`delete from sessions where user_id = ${childUserId}`;
      await tx`
        update chore_completions set performed_by_device_id = null
        where household_id = ${householdId}
          and performed_by_device_id in (select id from devices where user_id = ${childUserId})
      `;
      await tx`
        update device_pairings set claimed_device_id = null
        where household_id = ${householdId}
          and claimed_device_id in (select id from devices where user_id = ${childUserId})
      `;
      await tx`delete from devices where household_id = ${householdId} and user_id = ${childUserId}`;
      await tx`delete from device_pairings where household_id = ${householdId} and fighter_id = ${fighterId}`;
      await tx`delete from fighter_credentials where fighter_id = ${fighterId}`;
      await tx`delete from fighter_avatars where fighter_id = ${fighterId}`;

      await tx`update household_members set invited_by_user_id = null where invited_by_user_id = ${childUserId}`;
      await tx`update fighters set created_by_user_id = null where created_by_user_id = ${childUserId}`;
      await tx`update household_invites set accepted_by_user_id = null where accepted_by_user_id = ${childUserId}`;
      await tx`update chore_completions set performed_by_user_id = null where performed_by_user_id = ${childUserId}`;
      await tx`update chore_completions set voided_by_user_id = null where voided_by_user_id = ${childUserId}`;
      await tx`update boss_resets set created_by_user_id = null where created_by_user_id = ${childUserId}`;
      await tx`update wallet_transactions set created_by_user_id = null where created_by_user_id = ${childUserId}`;
      await tx`update reward_redemptions set requested_by_user_id = null where requested_by_user_id = ${childUserId}`;
      await tx`update reward_redemptions set approved_by_user_id = null where approved_by_user_id = ${childUserId}`;

      await tx`
        update fighters
        set user_id = null, name = 'Erased fighter', avatar_hash = null,
            require_own_device = false, deleted_at = now(), version = version + 1
        where id = ${fighterId}
      `;
      await tx`delete from child_authorizations where household_id = ${householdId} and child_user_id = ${childUserId}`;
      await tx`delete from household_members where household_id = ${householdId} and user_id = ${childUserId}`;
      await tx`delete from users where id = ${childUserId} and kind = 'child'`;
      await tx`
        update households set configuration_revision = configuration_revision + 1, version = version + 1
        where id = ${householdId}
      `;

      return { ok: true, retainedFighterId: fighterId };
    });
  });

  registerInvitationRoutes(app, { requireAuth, requireHouseholdRole, assertHouseholdRow, entityId });


  registerGameplayRoutes(app, { requireAuth, requireHouseholdRole, assertHouseholdRow });


  registerSyncPullRoutes(app, { requireHouseholdPrincipal, decorateBosses });
  registerSyncPushRoutes(app, {
    requireHouseholdPrincipal, requireHouseholdMember, requireHouseholdRole, assertHouseholdRow,
    assertNullableHouseholdRow, entityId, serverCycleKey, serverBossAvailable, serverBossElite,
  });

  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const app = await buildApp();
  const initialRetention = await runOperationalRetention();
  app.log.info({ removed: initialRetention }, 'operational retention cleanup completed');
  await app.listen({ port: Number(process.env.PORT ?? 3002), host: '0.0.0.0' });
  const retentionTimer = setInterval(() => {
    void runOperationalRetention()
      .then((removed) => app.log.info({ removed }, 'operational retention cleanup completed'))
      .catch((error) => app.log.error({ error }, 'operational retention cleanup failed'));
  }, 24 * 60 * 60 * 1000);
  retentionTimer.unref();
}
