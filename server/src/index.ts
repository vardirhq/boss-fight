import 'dotenv/config';
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import Fastify, { type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { sql } from './db.js';
import { boundedRows, expectedRevision, mutationError } from './sync.js';
import {
  assertRedemptionFunds, assertRedemptionManagerRole, initialRedemption,
  redemptionTransition, requestedRedemptionStatus,
} from './redemption.js';
import { sendEmailVerification, sendHouseholdInviteEmail, sendPasswordResetEmail } from './email.js';
import { assertCanManageMembership, type GovernanceRole } from './governance.js';
import { childAuthRateLimit, committedChildPairAuthentication } from './childAuth.js';
import { publicSyncRows } from './syncProjection.js';
import { acceptedPrivacyNoticeVersion, assertAdultErasureConfirmation, assertChildErasureTarget, assertHouseholdErasureConfirmation, PRIVACY_NOTICE_VERSION, privacyExportRows } from './privacy.js';
import { runOperationalRetention } from './retention.js';
import { apiSecurityHeaders, configuredCorsOrigins, normalizedEmail, trustProxyEnabled } from './apiSecurity.js';
import { sessionExpiry, sessionIdleCutoff, sessionPolicy } from './sessionPolicy.js';
import {
  optionalBoolean, optionalBooleanOrNull, optionalNumber, optionalNumberOrNull,
  optionalString, queryInteger, requiredString, requireObjectArray, stringValue,
} from './requestValidation.js';
import { validatedAvatar } from './avatarValidation.js';
import {
  bootstrapSchema, bossCreateSchema, bossParamsSchema, bossPatchSchema, childCreateSchema,
  childLoginSchema, childPairSchema, childParamsSchema, choreCreateSchema, choreParamsSchema,
  chorePatchSchema, claimDeviceSchema, emailSchema, emptyBodySchema, eraseAdultSchema,
  fighterCreateSchema, fighterParamsSchema, fighterPatchSchema, householdEraseSchema,
  householdParamsSchema, householdPatchSchema, inviteCreateSchema, loginSchema, pairingCreateSchema,
  pinSchema, registerSchema, resetConfirmSchema, rewardCreateSchema, rewardParamsSchema,
  rewardPatchSchema, sessionParamsSchema, suspendSchema, syncPullSchema, syncPushSchema, tokenSchema,
} from './routeSchemas.js';

type JsonObject = Record<string, unknown>;
type AuthContext = { userId: string; sessionId: string };
type PrincipalContext = { userId: string | null; sessionId?: string; deviceId?: string; kind: 'user' | 'household_device' };
type HouseholdRole = 'owner' | 'parent' | 'member' | 'child';
type FighterOwnerRow = { user_id?: unknown };

const scrypt = promisify(scryptCallback);
const passwordKeyLength = 64;
const fighterColors = ['#F4B942', '#E0564A', '#67D391', '#5B9BE8', '#B57BE0', '#5FD0C8', '#EE8FB0', '#E8A44C'];

const appendTables = [
  'chore_completions',
  'boss_resets',
  'boss_victories',
  'wallet_transactions',
  'reward_redemptions'
] as const;

const mutableTables = [
  'households',
  'household_members',
  'devices',
  'fighters',
  'fighter_avatars',
  'bosses',
  'chores',
  'rewards'
] as const;

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

function mayPrincipalActAsFighter(auth: PrincipalContext, fighter: FighterOwnerRow | undefined) {
  if (!fighter) return false;
  const fighterUserId = typeof fighter.user_id === 'string' ? fighter.user_id : null;
  return fighterUserId === null || (auth.kind === 'user' && fighterUserId === auth.userId);
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
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

async function hashSecret(secret: string) {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(secret, salt, passwordKeyLength)) as Buffer;
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

async function hashPassword(password: string) {
  if (password.length < 10) {
    throw new Error('Password must be at least 10 characters');
  }
  return hashSecret(password);
}

async function verifySecret(secret: string, stored: unknown) {
  if (typeof stored !== 'string') return false;
  const [scheme, salt, expectedHex] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !expectedHex) return false;
  const actual = (await scrypt(secret, salt, passwordKeyLength)) as Buffer;
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function verifyPassword(password: string, stored: unknown) {
  return verifySecret(password, stored);
}

function bearerToken(request: FastifyRequest) {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

function deviceToken(request: FastifyRequest) {
  const value = request.headers['x-boss-kamp-device-token'];
  return Array.isArray(value) ? value[0] : value ?? null;
}

async function createSession(userId: string, deviceId?: string | null) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = sessionExpiry(new Date(), sessionPolicy());
  const [session] = await sql`
    insert into sessions (user_id, device_id, token_hash, expires_at, last_used_at)
    values (${userId}, ${deviceId ?? null}, ${tokenHash(token)}, ${expiresAt}, now())
    returning id, expires_at
  `;
  return { token, sessionId: publicId(session), expiresAt: session.expires_at };
}

async function issueEmailVerification(userId: string, email: string, displayName: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const [record] = await sql`insert into email_verification_tokens (user_id, token_hash, expires_at) values (${userId}, ${tokenHash(token)}, ${expiresAt}) returning id`;
  try {
    await sendEmailVerification({ to: email, displayName, token, expiresAt });
  } catch (error) {
    await sql`delete from email_verification_tokens where id = ${record.id}`;
    throw error;
  }
}

async function requireAuth(request: FastifyRequest): Promise<AuthContext> {
  const token = bearerToken(request);
  if (!token) throw new Error('Unauthorized');

  const [session] = await sql`
    update sessions
    set last_used_at = now()
    where token_hash = ${tokenHash(token)}
      and revoked_at is null
      and expires_at > now()
      and coalesce(last_used_at, created_at) > ${sessionIdleCutoff(new Date(), sessionPolicy())}
    returning id, user_id
  `;

  if (!session) throw new Error('Unauthorized');
  return { userId: requireString(session.user_id, 'user_id'), sessionId: publicId(session) };
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

function publicTokenCode(length = 8) {
  return randomBytes(length).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, length).toUpperCase();
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

  app.addHook('onSend', async (_request, reply) => {
    for (const [name, value] of Object.entries(apiSecurityHeaders)) reply.header(name, value);
  });

  await app.register(rateLimit, {
    max: Number(process.env.RATE_LIMIT_MAX ?? 300),
    timeWindow: process.env.RATE_LIMIT_WINDOW ?? '1 minute'
  });

  app.setErrorHandler((error, request, reply) => {
    const message = error instanceof Error ? error.message : 'Bad request';
    const errorInfo = error as Error & { code?: string; statusCode?: number; validation?: unknown };
    if (errorInfo.statusCode === 400 || errorInfo.validation) {
      reply.code(400).send({ error: 'Invalid request data', code: 'invalid_request' });
      return;
    }
    if (errorInfo.statusCode === 429) {
      reply.code(429).send({ error: 'Too many requests', code: 'rate_limited' });
      return;
    }
    if (errorInfo.code === 'mail_delivery_failed') {
      reply.code(502).send({ error: 'Email could not be delivered', code: 'mail_delivery_failed' });
      return;
    }
    if (message === 'Unauthorized') {
      reply.code(401).send({ error: 'Unauthorized', code: 'unauthenticated' });
      return;
    }
    if (message === 'Forbidden') {
      reply.code(403).send({ error: 'Forbidden', code: 'forbidden' });
      return;
    }
    if (message === 'Not found') {
      reply.code(404).send({ error: 'Not found', code: 'not_found' });
      return;
    }
    if (errorInfo.code === '23505') {
      reply.code(409).send({ error: 'A conflicting record already exists', code: 'conflict' });
      return;
    }
    if (errorInfo.code?.startsWith('22')) {
      reply.code(400).send({ error: 'Invalid request data', code: 'invalid_request' });
      return;
    }
    const validationMessages = [
      'is required', 'must be an array', 'must be a string', 'must contain at most', 'Expected JSON object',
      'Expected numeric value', 'Expected boolean value',
      'Expected string value', 'must contain at most', 'Numeric value is outside',
      'Avatar must be an object', 'Avatar MIME type must be', 'Avatar bytes must be',
      'Avatar exceeds the', 'Avatar bytes do not match', 'Avatar hash must be',
      'must be a non-negative integer',
      'Password must be at least', 'PIN must be at least', 'Invalid pairing role', 'Invalid invite role',
      'Unsupported redemption status', 'email must be valid', 'Household name confirmation does not match',
      'Account email confirmation does not match', 'Invalid or expired password reset token',
      'Invalid or expired email verification token', 'known_avatar_hashes must be valid',
      'known_configuration_revision must be a non-negative integer',
      'event_limit must be an integer between 1 and 500'
    ];
    if (validationMessages.some((part) => message.includes(part))) {
      reply.code(400).send({ error: message, code: 'invalid_request' });
      return;
    }
    const domainMessages = [
      'does not belong to household', 'Chore does not belong to boss',
      'does not reference a submitted boss', 'Avatar hash does not match bytes',
      'Fighter belongs to another account',
      'Chore is already completed for this cycle',
      'Insufficient wallet balance', 'Reward scope does not match fighter',
      'Fighter is already claimed or missing',
      'Cycle key is no longer current', 'Boss is not currently available',
      'Reset sequence conflict',
      'Transfer amount must be positive',
      'Victory payout amount must be positive', 'Unsupported mutation type',
      'Cannot administer your own membership', 'Parents cannot administer owners or other parents',
      'Household must retain an active owner', 'Claimed fighters require explicit account governance',
      'Transfer or erase owned households before deleting the account'
    ];
    if (domainMessages.some((part) => message.includes(part))) {
      reply.code(422).send({ error: message, code: 'domain_rule' });
      return;
    }
    request.log.error({ err: error }, 'Unhandled API error');
    reply.code(500).send({ error: 'Internal server error', code: 'internal_error' });
  });

  app.get('/health', async () => {
    await sql`select 1`;
    return { ok: true };
  });

  app.post('/api/auth/register', { schema: registerSchema }, async (request) => {
    const body = requireObject(request.body);
    const email = normalizedEmail(body.email);
    const displayName = requireString(body.displayName, 'displayName');
    const passwordHash = await hashPassword(requireString(body.password, 'password'));

    const [user] = await sql`
      insert into users (kind, email, password_hash, display_name)
      values ('adult', ${email}, ${passwordHash}, ${displayName})
      returning id, email, display_name, email_verified_at
    `;
    const session = await createSession(publicId(user));
    try {
      await issueEmailVerification(publicId(user), email, displayName);
    } catch (error) {
      request.log.error({ err: error }, 'Verification email could not be delivered after registration');
    }

    return { user: { ...user, emailVerified: false }, session };
  });

  app.post('/api/auth/login', { schema: loginSchema }, async (request) => {
    const body = requireObject(request.body);
    const email = normalizedEmail(body.email);
    const password = requireString(body.password, 'password');

    const [user] = await sql`
      select id, email, display_name, password_hash, email_verified_at
      from users
      where lower(email) = ${email}
        and kind = 'adult'
        and deleted_at is null
    `;
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      throw new Error('Unauthorized');
    }

    const session = await createSession(publicId(user));
    return { user: { id: user.id, email: user.email, displayName: user.display_name, emailVerified: Boolean(user.email_verified_at) }, session };
  });

  app.post('/api/auth/email-verification/resend', { schema: emptyBodySchema, config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (request) => {
    const auth = await requireAuth(request);
    const [user] = await sql`select email, display_name, email_verified_at from users where id = ${auth.userId} and kind = 'adult' and deleted_at is null`;
    if (!user) throw new Error('Not found');
    if (!user.email_verified_at) await issueEmailVerification(auth.userId, requireString(user.email, 'email'), requireString(user.display_name, 'display_name'));
    return { accepted: true };
  });

  app.post('/api/auth/email-verification/confirm', { schema: tokenSchema }, async (request) => {
    const token = requireString(requireObject(request.body).token, 'token');
    return sql.begin(async (tx) => {
      const [record] = await tx`select id, user_id from email_verification_tokens where token_hash = ${tokenHash(token)} and used_at is null and expires_at > now() for update`;
      if (!record) throw new Error('Invalid or expired email verification token');
      await tx`update users set email_verified_at = coalesce(email_verified_at, now()), version = version + 1 where id = ${record.user_id} and kind = 'adult'`;
      await tx`update email_verification_tokens set used_at = now() where id = ${record.id}`;
      return { ok: true };
    });
  });

  app.post('/api/auth/password-reset/request', {
    schema: emailSchema,
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
  }, async (request) => {
    const body = requireObject(request.body);
    const email = normalizedEmail(body.email);
    const [user] = await sql`
      select id, email, display_name from users
      where lower(email) = ${email} and kind = 'adult' and deleted_at is null
    `;
    if (!user) return { accepted: true };

    const resetToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const [record] = await sql`
      insert into password_reset_tokens (user_id, token_hash, expires_at)
      values (${user.id}, ${tokenHash(resetToken)}, ${expiresAt})
      returning id
    `;
    try {
      await sendPasswordResetEmail({
        to: requireString(user.email, 'email'),
        displayName: requireString(user.display_name, 'display_name'),
        resetToken,
        expiresAt,
      });
    } catch (error) {
      await sql`delete from password_reset_tokens where id = ${record.id}`;
      request.log.error({ err: error }, 'Password reset email could not be delivered');
    }
    return { accepted: true };
  });

  app.post('/api/auth/password-reset/confirm', {
    schema: resetConfirmSchema,
    config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
  }, async (request) => {
    const body = requireObject(request.body);
    const resetToken = requireString(body.token, 'token');
    const passwordHash = await hashPassword(requireString(body.password, 'password'));
    return sql.begin(async (tx) => {
      const [record] = await tx`
        select prt.id, prt.user_id
        from password_reset_tokens prt
        join users u on u.id = prt.user_id
        where prt.token_hash = ${tokenHash(resetToken)}
          and prt.used_at is null and prt.expires_at > now()
          and u.kind = 'adult' and u.deleted_at is null
        for update of prt, u
      `;
      if (!record) throw new Error('Invalid or expired password reset token');
      await tx`update users set password_hash = ${passwordHash}, version = version + 1 where id = ${record.user_id}`;
      await tx`update password_reset_tokens set used_at = now() where id = ${record.id}`;
      await tx`update sessions set revoked_at = now() where user_id = ${record.user_id} and revoked_at is null`;
      return { ok: true };
    });
  });

  app.post('/api/auth/child-login', { schema: childLoginSchema, config: { rateLimit: childAuthRateLimit } }, async (request) => {
    const body = requireObject(request.body);
    const householdId = requireString(body.householdId, 'householdId');
    const fighterId = requireString(body.fighterId, 'fighterId');
    const pin = requireString(body.pin, 'pin');
    const deviceName = optionalString(body.deviceName) ?? '';
    const platform = optionalString(body.platform) ?? 'android';

    const [fighter] = await sql`
      select id, user_id, name from fighters
      where id = ${fighterId}
        and household_id = ${householdId}
        and user_id is not null
        and deleted_at is null
    `;
    if (!fighter) throw new Error('Unauthorized');

    const [credentials] = await sql`
      select fighter_id, pin_hash, locked_until from fighter_credentials
      where fighter_id = ${fighterId}
    `;
    if (!credentials || (credentials.locked_until && new Date(credentials.locked_until) > new Date())) {
      throw new Error('Unauthorized');
    }

    if (!(await verifySecret(pin, credentials.pin_hash))) {
      await sql`
        update fighter_credentials
        set failed_attempts = failed_attempts + 1,
            locked_until = case when failed_attempts + 1 >= 8 then now() + interval '10 minutes' else locked_until end
        where fighter_id = ${fighterId}
      `;
      throw new Error('Unauthorized');
    }

    const [device] = await sql`
      insert into devices (household_id, user_id, kind, name, platform, token_hash, last_seen_at)
      values (${householdId}, ${fighter.user_id}, 'personal', ${deviceName}, ${platform}, ${tokenHash(randomBytes(32).toString('base64url'))}, now())
      returning id
    `;
    await sql`update fighter_credentials set failed_attempts = 0, locked_until = null where fighter_id = ${fighterId}`;
    const session = await createSession(requireString(fighter.user_id, 'user_id'), publicId(device));

    return {
      user: { id: fighter.user_id, kind: 'child', displayName: fighter.name },
      fighterId,
      deviceId: publicId(device),
      session
    };
  });

  app.post('/api/auth/child-pair', { schema: childPairSchema, config: { rateLimit: childAuthRateLimit } }, async (request) => {
    const body = requireObject(request.body);
    const code = requireString(body.code, 'code').toUpperCase();
    const pin = requireString(body.pin, 'pin');
    const deviceName = optionalString(body.deviceName) ?? '';
    const platform = optionalString(body.platform) ?? 'android';

    const result = await committedChildPairAuthentication<{
      user: { id: unknown; kind: 'child'; displayName: unknown };
      fighterId: unknown;
      deviceId: unknown;
    }>(() => sql.begin(async (tx) => {
      const [pairing] = await tx`
        select id, fighter_id from device_pairings
        where role = 'fighter'
          and code_hash = ${tokenHash(code)} and claimed_at is null and expires_at > now()
        for update
      `;
      if (!pairing?.fighter_id) throw new Error('Unauthorized');
      const [pairingHousehold] = await tx`select household_id from device_pairings where id = ${pairing.id}`;
      const householdId = requireString(pairingHousehold.household_id, 'household_id');
      const [fighter] = await tx`
        select id, user_id, name from fighters
        where id = ${pairing.fighter_id} and household_id = ${householdId}
          and user_id is not null and deleted_at is null
      `;
      const [credentials] = await tx`
        select pin_hash, locked_until from fighter_credentials where fighter_id = ${pairing.fighter_id}
      `;
      if (!fighter || !credentials || (credentials.locked_until && new Date(credentials.locked_until) > new Date())) {
        throw new Error('Unauthorized');
      }
      if (!(await verifySecret(pin, credentials.pin_hash))) {
        await tx`
          update fighter_credentials set failed_attempts = failed_attempts + 1,
            locked_until = case when failed_attempts + 1 >= 8 then now() + interval '10 minutes' else locked_until end
          where fighter_id = ${pairing.fighter_id}
        `;
        return { authenticated: false as const };
      }
      const [device] = await tx`
        insert into devices (household_id, user_id, kind, name, platform, last_seen_at)
        values (${householdId}, ${fighter.user_id}, 'personal', ${deviceName}, ${platform}, now())
        returning id
      `;
      await tx`update fighter_credentials set failed_attempts = 0, locked_until = null where fighter_id = ${pairing.fighter_id}`;
      await tx`update device_pairings set claimed_at = now(), claimed_device_id = ${device.id} where id = ${pairing.id}`;
      return {
        authenticated: true as const,
        value: {
          user: { id: fighter.user_id, kind: 'child', displayName: fighter.name },
          fighterId: fighter.id,
          deviceId: device.id
        }
      };
    }));
    const session = await createSession(requireString(result.user.id, 'user_id'), requireString(result.deviceId, 'device_id'));
    return { ...result, session };
  });

  app.post('/api/auth/logout', { schema: emptyBodySchema }, async (request) => {
    const auth = await requireAuth(request);
    await sql`update sessions set revoked_at = now() where id = ${auth.sessionId}`;
    return { ok: true };
  });

  app.get('/api/me/sessions', async (request) => {
    const auth = await requireAuth(request);
    const sessions = await sql`
      select s.id, s.created_at, s.last_used_at, s.expires_at,
        s.id = ${auth.sessionId}::uuid as current,
        d.name as device_name, d.platform
      from sessions s
      left join devices d on d.id = s.device_id
      where s.user_id = ${auth.userId}
        and s.revoked_at is null
        and s.expires_at > now()
        and coalesce(s.last_used_at, s.created_at) > ${sessionIdleCutoff(new Date(), sessionPolicy())}
      order by (s.id = ${auth.sessionId}::uuid) desc, s.last_used_at desc nulls last, s.created_at desc
    `;
    return { sessions: sessions.map((session) => ({
      id: session.id,
      current: session.current,
      deviceName: session.device_name,
      platform: session.platform,
      createdAt: session.created_at,
      lastUsedAt: session.last_used_at,
      expiresAt: session.expires_at,
    })) };
  });

  app.delete('/api/me/sessions/:sessionId', { schema: sessionParamsSchema }, async (request) => {
    const auth = await requireAuth(request);
    const sessionId = requireString((request.params as JsonObject).sessionId, 'sessionId');
    const [session] = await sql`
      update sessions set revoked_at = now()
      where id = ${sessionId} and user_id = ${auth.userId} and revoked_at is null
      returning id
    `;
    if (!session) throw new Error('Not found');
    return { ok: true, current: sessionId === auth.sessionId };
  });

  app.get('/api/me', async (request) => {
    const auth = await requireAuth(request);
    const [user] = await sql`
      select id, kind, email, display_name, email_verified_at, created_at, updated_at
      from users
      where id = ${auth.userId} and deleted_at is null
    `;
    const households = await sql`
      select h.*, hm.role, hm.status
      from household_members hm
      join households h on h.id = hm.household_id
      where hm.user_id = ${auth.userId}
        and hm.status = 'active'
        and h.deleted_at is null
      order by h.created_at
    `;
    return { user, households };
  });

  app.delete('/api/me', { schema: eraseAdultSchema }, async (request) => {
    const auth = await requireAuth(request);
    const body = requireObject(request.body);
    const password = requireString(body.password, 'password');
    const confirmedEmail = requireString(body.confirmedEmail, 'confirmedEmail');

    return sql.begin(async (tx) => {
      const [user] = await tx`
        select id, email, password_hash from users
        where id = ${auth.userId} and kind = 'adult' and deleted_at is null
        for update
      `;
      if (!user) throw new Error('Not found');
      const soleOwnerHouseholds = await tx`
        select h.id, h.name
        from household_members own
        join households h on h.id = own.household_id and h.deleted_at is null
        where own.user_id = ${auth.userId} and own.role = 'owner' and own.status = 'active'
          and not exists (
            select 1 from household_members other
            where other.household_id = own.household_id and other.user_id <> own.user_id
              and other.role = 'owner' and other.status = 'active'
          )
        for update of h, own
      `;
      assertAdultErasureConfirmation({
        currentEmail: user.email, confirmedEmail, soleOwnerHouseholds,
      });
      if (!(await verifyPassword(password, user.password_hash))) throw new Error('Unauthorized');

      const linkedFighters = await tx`select id, household_id from fighters where user_id = ${auth.userId} for update`;
      const memberships = await tx`select household_id from household_members where user_id = ${auth.userId} for update`;
      const createdHouseholds = await tx`select id from households where created_by_user_id = ${auth.userId} for update`;
      for (const household of createdHouseholds) {
        const [replacement] = await tx`
          select user_id from household_members
          where household_id = ${household.id} and user_id <> ${auth.userId}
            and role = 'owner' and status = 'active'
          order by joined_at, id limit 1
        `;
        if (!replacement) throw new Error('Transfer or erase owned households before deleting the account');
        await tx`update households set created_by_user_id = ${replacement.user_id} where id = ${household.id}`;
      }

      const devices = await tx`select id from devices where user_id = ${auth.userId} for update`;
      const deviceIds = devices.map((device) => String(device.id));
      await tx`delete from sessions where user_id = ${auth.userId}`;
      if (deviceIds.length > 0) {
        await tx`update chore_completions set performed_by_device_id = null where performed_by_device_id = any(${deviceIds}::uuid[])`;
        await tx`update device_pairings set claimed_device_id = null where claimed_device_id = any(${deviceIds}::uuid[])`;
      }
      await tx`delete from devices where user_id = ${auth.userId}`;

      await tx`delete from household_invites where created_by_user_id = ${auth.userId}`;
      await tx`update household_invites set accepted_by_user_id = null where accepted_by_user_id = ${auth.userId}`;
      await tx`delete from device_pairings where created_by_user_id = ${auth.userId}`;
      await tx`update household_members set invited_by_user_id = null where invited_by_user_id = ${auth.userId}`;
      await tx`update fighters set created_by_user_id = null where created_by_user_id = ${auth.userId}`;
      await tx`update chore_completions set performed_by_user_id = null where performed_by_user_id = ${auth.userId}`;
      await tx`update chore_completions set voided_by_user_id = null where voided_by_user_id = ${auth.userId}`;
      await tx`update boss_resets set created_by_user_id = null where created_by_user_id = ${auth.userId}`;
      await tx`update wallet_transactions set created_by_user_id = null where created_by_user_id = ${auth.userId}`;
      await tx`update reward_redemptions set requested_by_user_id = null where requested_by_user_id = ${auth.userId}`;
      await tx`update reward_redemptions set approved_by_user_id = null where approved_by_user_id = ${auth.userId}`;

      for (const fighter of linkedFighters) {
        await tx`delete from fighter_avatars where fighter_id = ${fighter.id}`;
        await tx`delete from fighter_credentials where fighter_id = ${fighter.id}`;
        await tx`delete from device_pairings where fighter_id = ${fighter.id}`;
        await tx`
          update fighters
          set user_id = null, name = 'Erased fighter', avatar_hash = null,
              require_own_device = false, deleted_at = now(), version = version + 1
          where id = ${fighter.id}
        `;
      }

      const householdIds = [...new Set([
        ...memberships.map((membership) => String(membership.household_id)),
        ...linkedFighters.map((fighter) => String(fighter.household_id)),
      ])];
      await tx`delete from household_members where user_id = ${auth.userId}`;
      if (householdIds.length > 0) {
        await tx`
          update households set configuration_revision = configuration_revision + 1, version = version + 1
          where id = any(${householdIds}::uuid[])
        `;
      }
      await tx`delete from users where id = ${auth.userId} and kind = 'adult'`;
      return { ok: true };
    });
  });

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

  app.post('/api/households/:householdId/pairings', { schema: pairingCreateSchema }, async (request) => {
    const auth = await requireAuth(request);
    const householdId = (request.params as { householdId: string }).householdId;
    await requireHouseholdRole(auth.userId, householdId, ['owner', 'parent']);
    const body = requireObject(request.body);
    const role = optionalString(body.role) ?? 'household_device';
    if (role !== 'household_device' && role !== 'fighter') throw new Error('Invalid pairing role');
    const fighterId = optionalString(body.fighterId);
    if (fighterId) await assertHouseholdRow('fighters', fighterId, householdId);

    const code = publicTokenCode(8);
    const [pairing] = await sql`
      insert into device_pairings (
        household_id, fighter_id, role, code_hash, created_by_user_id, expires_at
      )
      values (
        ${householdId}, ${fighterId}::uuid, ${role}, ${tokenHash(code)}, ${auth.userId},
        now() + interval '15 minutes'
      )
      returning id, household_id, fighter_id, role, expires_at, created_at
    `;
    return { pairing, code };
  });

  app.post('/api/households/:householdId/invites', {
    schema: inviteCreateSchema,
    config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
  }, async (request) => {
    const auth = await requireAuth(request);
    const householdId = (request.params as { householdId: string }).householdId;
    await requireHouseholdRole(auth.userId, householdId, ['owner', 'parent']);
    const body = requireObject(request.body);
    const invitedEmail = requireString(body.email, 'email').toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitedEmail)) throw new Error('email must be valid');
    const role = optionalString(body.role) ?? 'member';
    if (role !== 'parent' && role !== 'member') throw new Error('Invalid invite role');
    const fighterId = optionalString(body.fighterId);
    if (fighterId) await assertHouseholdRow('fighters', fighterId, householdId);

    const [context] = await sql`
      select h.name as household_name, u.display_name as inviter_name
      from households h
      join users u on u.id = ${auth.userId}
      where h.id = ${householdId} and h.deleted_at is null and u.deleted_at is null
    `;
    if (!context) throw new Error('Not found');

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const [invite] = await sql`
      insert into household_invites (
        household_id, invited_email, role, fighter_id, token_hash, created_by_user_id, expires_at
      )
      values (
        ${householdId}, ${invitedEmail}, ${role}, ${fighterId}::uuid,
        ${tokenHash(token)}, ${auth.userId}, ${expiresAt}
      )
      returning id, household_id, invited_email, role, fighter_id, expires_at, created_at
    `;

    try {
      await sendHouseholdInviteEmail({
        to: invitedEmail,
        householdName: requireString(context.household_name, 'household_name'),
        inviterName: requireString(context.inviter_name, 'inviter_name'),
        inviteToken: token,
        expiresAt,
      });
    } catch (error) {
      try {
        await sql`update household_invites set expires_at = now() where id = ${invite.id}`;
      } catch (cleanupError) {
        request.log.error({ err: cleanupError, inviteId: invite.id }, 'Could not expire undelivered invitation');
      }
      throw error;
    }

    try {
      await sql`
        update household_invites
        set expires_at = now()
        where household_id = ${householdId}
          and lower(invited_email) = ${invitedEmail}
          and accepted_at is null
          and id <> ${invite.id}
      `;
    } catch (cleanupError) {
      request.log.warn({ err: cleanupError, inviteId: invite.id }, 'Could not expire older invitations');
    }

    return { invite, delivered: true };
  });

  app.post('/api/invites/accept', { schema: tokenSchema }, async (request) => {
    const auth = await requireAuth(request);
    const body = requireObject(request.body);
    const token = requireString(body.token, 'token');

    const result = await sql.begin(async (tx) => {
      const [user] = await tx`
        select id, email, display_name, kind from users where id = ${auth.userId} and deleted_at is null
      `;
      if (!user?.email) throw new Error('Authenticated user has no email');

      const [invite] = await tx`
        select * from household_invites
        where token_hash = ${tokenHash(token)}
          and accepted_at is null
          and expires_at > now()
        for update
      `;
      if (!invite || String(invite.invited_email).toLowerCase() !== String(user.email).toLowerCase()) {
        throw new Error('Unauthorized');
      }

      const [member] = await tx`
        insert into household_members (household_id, user_id, role, status, invited_by_user_id)
        values (${invite.household_id}, ${auth.userId}, ${invite.role}, 'active', ${invite.created_by_user_id})
        on conflict (household_id, user_id)
        do update set status = 'active', role = excluded.role, version = household_members.version + 1
        returning id, household_id, user_id, role, status
      `;

      let fighter = null;
      if (invite.fighter_id) {
        const [claimed] = await tx`
          update fighters
          set user_id = ${auth.userId}, version = version + 1
          where id = ${invite.fighter_id}
            and household_id = ${invite.household_id}
            and user_id is null
            and deleted_at is null
          returning *
        `;
        fighter = claimed ?? null;
      } else if (user.kind === 'adult') {
        const [existingFighter] = await tx`
          select * from fighters
          where household_id = ${invite.household_id}
            and user_id = ${auth.userId}
            and deleted_at is null
          limit 1
        `;
        if (existingFighter) {
          fighter = existingFighter;
        } else {
          const [{ fighter_count: fighterCount }] = await tx`
            select count(*)::integer as fighter_count
            from fighters
            where household_id = ${invite.household_id} and deleted_at is null
          `;
          const sort = Number(fighterCount) || 0;
          const generatedId = entityId(requireString(invite.household_id, 'household_id'), 'fighter', `account-${auth.userId}`);
          const [generated] = await tx`
            insert into fighters (id, household_id, user_id, name, color, sort, created_by_user_id)
            values (
              ${generatedId}, ${invite.household_id}, ${auth.userId},
              ${requireString(user.display_name, 'display_name')}, ${fighterColors[sort % fighterColors.length]},
              ${sort}, ${auth.userId}
            )
            on conflict (id) do update
            set user_id = excluded.user_id, name = excluded.name, deleted_at = null,
                version = fighters.version + 1
            returning *
          `;
          fighter = generated;
        }
      }

      await tx`
        update household_invites
        set accepted_at = now(), accepted_by_user_id = ${auth.userId}
        where id = ${invite.id}
      `;

      return { member, fighter };
    });

    return result;
  });

  app.post('/api/pairings/claim-household-device', { schema: claimDeviceSchema }, async (request) => {
    const body = requireObject(request.body);
    const code = requireString(body.code, 'code').toUpperCase();
    const name = optionalString(body.name) ?? '';
    const platform = optionalString(body.platform) ?? 'android';

    const deviceToken = randomBytes(32).toString('base64url');
    const result = await sql.begin(async (tx) => {
      const [pairing] = await tx`
        select id, household_id from device_pairings
        where role = 'household_device'
          and code_hash = ${tokenHash(code)}
          and claimed_at is null
          and expires_at > now()
        for update
      `;
      if (!pairing) throw new Error('Unauthorized');
      const householdId = requireString(pairing.household_id, 'household_id');

      const [device] = await tx`
        insert into devices (household_id, kind, name, platform, token_hash, last_seen_at)
        values (${householdId}, 'household', ${name}, ${platform}, ${tokenHash(deviceToken)}, now())
        returning id, household_id, kind, name, platform
      `;
      await tx`
        update device_pairings
        set claimed_at = now(), claimed_device_id = ${device.id}
        where id = ${pairing.id}
      `;
      return { device, deviceToken, householdId };
    });

    return result;
  });

  app.post('/api/households/:householdId/bosses', { schema: bossCreateSchema }, async (request) => {
    const auth = await requireAuth(request);
    const householdId = (request.params as { householdId: string }).householdId;
    await requireHouseholdRole(auth.userId, householdId, ['owner', 'parent']);
    const body = requireObject(request.body);

    const [boss] = await sql`
      insert into bosses (
        household_id, name, sprite, frames, rare, hue, trigger_type, trigger_day,
        trigger_date, trigger_note, dormant, unlock_at, sort
      )
      values (
        ${householdId}, ${requireString(body.name, 'name')}, ${requireString(body.sprite, 'sprite')},
        ${optionalNumber(body.frames)}, ${optionalBoolean(body.rare)}, ${optionalNumberOrNull(body.hue)},
        ${optionalString(body.triggerType) ?? 'alltid'}, ${optionalNumberOrNull(body.triggerDay)},
        ${optionalNumberOrNull(body.triggerDate)}, ${optionalString(body.triggerNote)},
        ${optionalBoolean(body.dormant)}, ${optionalNumber(body.unlockAt)}, ${optionalNumber(body.sort)}
      )
      returning *
    `;
    return { boss };
  });

  app.patch('/api/households/:householdId/bosses/:bossId', { schema: bossPatchSchema }, async (request) => {
    const auth = await requireAuth(request);
    const { householdId, bossId } = request.params as { householdId: string; bossId: string };
    await requireHouseholdRole(auth.userId, householdId, ['owner', 'parent']);
    const body = requireObject(request.body);

    const [boss] = await sql`
      update bosses
      set name = coalesce(${optionalString(body.name)}, name),
          sprite = coalesce(${optionalString(body.sprite)}, sprite),
          frames = coalesce(${optionalNumberOrNull(body.frames)}, frames),
          rare = coalesce(${optionalBooleanOrNull(body.rare)}, rare),
          hue = coalesce(${optionalNumberOrNull(body.hue)}, hue),
          trigger_type = coalesce(${optionalString(body.triggerType)}, trigger_type),
          trigger_day = coalesce(${optionalNumberOrNull(body.triggerDay)}, trigger_day),
          trigger_date = coalesce(${optionalNumberOrNull(body.triggerDate)}, trigger_date),
          trigger_note = coalesce(${optionalString(body.triggerNote)}, trigger_note),
          dormant = coalesce(${optionalBooleanOrNull(body.dormant)}, dormant),
          unlock_at = coalesce(${optionalNumberOrNull(body.unlockAt)}, unlock_at),
          sort = coalesce(${optionalNumberOrNull(body.sort)}, sort),
          version = version + 1
      where id = ${bossId} and household_id = ${householdId} and deleted_at is null
      returning *
    `;
    if (!boss) throw new Error('Not found');
    return { boss };
  });

  app.delete('/api/households/:householdId/bosses/:bossId', { schema: bossParamsSchema }, async (request) => {
    const auth = await requireAuth(request);
    const { householdId, bossId } = request.params as { householdId: string; bossId: string };
    await requireHouseholdRole(auth.userId, householdId, ['owner', 'parent']);
    const [boss] = await sql`
      update bosses set deleted_at = now(), version = version + 1
      where id = ${bossId} and household_id = ${householdId} and deleted_at is null
      returning id
    `;
    if (!boss) throw new Error('Not found');
    return { ok: true };
  });

  app.post('/api/households/:householdId/chores', { schema: choreCreateSchema }, async (request) => {
    const auth = await requireAuth(request);
    const householdId = (request.params as { householdId: string }).householdId;
    await requireHouseholdRole(auth.userId, householdId, ['owner', 'parent']);
    const body = requireObject(request.body);
    const bossId = requireString(body.bossId, 'bossId');
    await assertHouseholdRow('bosses', bossId, householdId);

    const [chore] = await sql`
      insert into chores (household_id, boss_id, title, damage, repeatable, sort)
      values (
        ${householdId}, ${bossId}, ${requireString(body.title, 'title')},
        ${optionalNumber(body.damage)}, ${optionalBoolean(body.repeatable)}, ${optionalNumber(body.sort)}
      )
      returning *
    `;
    return { chore };
  });

  app.patch('/api/households/:householdId/chores/:choreId', { schema: chorePatchSchema }, async (request) => {
    const auth = await requireAuth(request);
    const { householdId, choreId } = request.params as { householdId: string; choreId: string };
    await requireHouseholdRole(auth.userId, householdId, ['owner', 'parent']);
    const body = requireObject(request.body);
    if (body.bossId) await assertHouseholdRow('bosses', requireString(body.bossId, 'bossId'), householdId);

    const [chore] = await sql`
      update chores
      set boss_id = coalesce(${optionalString(body.bossId)}::uuid, boss_id),
          title = coalesce(${optionalString(body.title)}, title),
          damage = coalesce(${optionalNumberOrNull(body.damage)}, damage),
          repeatable = coalesce(${optionalBooleanOrNull(body.repeatable)}, repeatable),
          sort = coalesce(${optionalNumberOrNull(body.sort)}, sort),
          version = version + 1
      where id = ${choreId} and household_id = ${householdId} and deleted_at is null
      returning *
    `;
    if (!chore) throw new Error('Not found');
    return { chore };
  });

  app.delete('/api/households/:householdId/chores/:choreId', { schema: choreParamsSchema }, async (request) => {
    const auth = await requireAuth(request);
    const { householdId, choreId } = request.params as { householdId: string; choreId: string };
    await requireHouseholdRole(auth.userId, householdId, ['owner', 'parent']);
    const [chore] = await sql`
      update chores set deleted_at = now(), version = version + 1
      where id = ${choreId} and household_id = ${householdId} and deleted_at is null
      returning id
    `;
    if (!chore) throw new Error('Not found');
    return { ok: true };
  });

  app.post('/api/households/:householdId/rewards', { schema: rewardCreateSchema }, async (request) => {
    const auth = await requireAuth(request);
    const householdId = (request.params as { householdId: string }).householdId;
    await requireHouseholdRole(auth.userId, householdId, ['owner', 'parent']);
    const body = requireObject(request.body);

    const [reward] = await sql`
      insert into rewards (household_id, scope, icon, title, descr, cost, sort)
      values (
        ${householdId}, ${requireString(body.scope, 'scope')}, ${optionalString(body.icon) ?? ''},
        ${requireString(body.title, 'title')}, ${optionalString(body.descr) ?? ''},
        ${optionalNumber(body.cost)}, ${optionalNumber(body.sort)}
      )
      returning *
    `;
    return { reward };
  });

  app.patch('/api/households/:householdId/rewards/:rewardId', { schema: rewardPatchSchema }, async (request) => {
    const auth = await requireAuth(request);
    const { householdId, rewardId } = request.params as { householdId: string; rewardId: string };
    await requireHouseholdRole(auth.userId, householdId, ['owner', 'parent']);
    const body = requireObject(request.body);

    const [reward] = await sql`
      update rewards
      set scope = coalesce(${optionalString(body.scope)}, scope),
          icon = coalesce(${optionalString(body.icon)}, icon),
          title = coalesce(${optionalString(body.title)}, title),
          descr = coalesce(${optionalString(body.descr)}, descr),
          cost = coalesce(${optionalNumberOrNull(body.cost)}, cost),
          sort = coalesce(${optionalNumberOrNull(body.sort)}, sort),
          version = version + 1
      where id = ${rewardId} and household_id = ${householdId} and deleted_at is null
      returning *
    `;
    if (!reward) throw new Error('Not found');
    return { reward };
  });

  app.delete('/api/households/:householdId/rewards/:rewardId', { schema: rewardParamsSchema }, async (request) => {
    const auth = await requireAuth(request);
    const { householdId, rewardId } = request.params as { householdId: string; rewardId: string };
    await requireHouseholdRole(auth.userId, householdId, ['owner', 'parent']);
    const [reward] = await sql`
      update rewards set deleted_at = now(), version = version + 1
      where id = ${rewardId} and household_id = ${householdId} and deleted_at is null
      returning id
    `;
    if (!reward) throw new Error('Not found');
    return { ok: true };
  });

  app.get('/api/sync/pull', { schema: syncPullSchema }, async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const householdId = requireString(query.household_id, 'household_id');
    await requireHouseholdPrincipal(request, householdId);

    const since = {
      chore_completions: queryInteger(query.since_chore_completions, 'since_chore_completions'),
      boss_resets: queryInteger(query.since_boss_resets, 'since_boss_resets'),
      boss_victories: queryInteger(query.since_boss_victories, 'since_boss_victories'),
      wallet_transactions: queryInteger(query.since_wallet_transactions, 'since_wallet_transactions'),
      reward_redemptions: queryInteger(query.since_reward_redemptions, 'since_reward_redemptions')
    };
    const eventLimit = queryInteger(query.event_limit, 'event_limit', 250);
    if (!Number.isSafeInteger(eventLimit) || eventLimit < 1 || eventLimit > 500) {
      throw new Error('event_limit must be an integer between 1 and 500');
    }
    const knownConfigurationRevision = query.known_configuration_revision === undefined
      ? null
      : queryInteger(query.known_configuration_revision, 'known_configuration_revision');
    if (knownConfigurationRevision !== null && (!Number.isSafeInteger(knownConfigurationRevision) || knownConfigurationRevision < 0)) {
      throw new Error('known_configuration_revision must be a non-negative integer');
    }
    let knownAvatarHashes: Record<string, string> = {};
    if (query.known_avatar_hashes) {
      try {
        const parsed = JSON.parse(query.known_avatar_hashes) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).length > 50) throw new Error();
        knownAvatarHashes = Object.fromEntries(Object.entries(parsed).filter(([id, hash]) => uuidPattern.test(id) && typeof hash === 'string' && /^[a-f0-9]{64}$/i.test(hash)));
        if (Object.keys(knownAvatarHashes).length !== Object.keys(parsed).length) throw new Error();
      } catch { throw new Error('known_avatar_hashes must be valid'); }
    }
    const households = await sql`
      select id, name, timezone, victories_baseline, configuration_revision
      from households where id = ${householdId} and deleted_at is null
    `;
    const configurationRevision = Number(households[0]?.configuration_revision ?? 0);
    const configurationUnchanged = knownConfigurationRevision === configurationRevision;
    const [fighters, avatars, bosses, chores] = configurationUnchanged
      ? [[], [], [], []]
      : await Promise.all([
        sql`
        select f.id, f.user_id, f.name, f.color, f.avatar_hash, f.streak, f.coins_cached,
          f.career_xp_cached, f.sort, (f.deleted_at is not null) as deleted,
          u.kind as user_kind, hm.status as account_status, hm.role as account_role
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
        sql`
        select id, name, sprite, frames, rare, hue, trigger_type, trigger_day,
          trigger_date, trigger_note, dormant, unlock_at, sort,
          (deleted_at is not null) as deleted
        from bosses where household_id = ${householdId}
        order by sort, created_at, id
        `,
        sql`
        select id, boss_id, title, damage, repeatable, sort,
          (deleted_at is not null) as deleted
        from chores where household_id = ${householdId}
        order by boss_id, sort, created_at, id
        `
      ]);

    const [completions, resets, victories, wallet, redemptions] = await Promise.all([
      sql`
        select id, boss_id, chore_id, fighter_id, cycle_key, reset_seq,
          chore_title, damage, voided_at, server_seq from chore_completions
        where household_id = ${householdId} and server_seq > ${since.chore_completions}
        order by server_seq
        limit ${eventLimit + 1}
      `,
      sql`
        select id, boss_id, cycle_key, reset_seq, server_seq from boss_resets
        where household_id = ${householdId} and server_seq > ${since.boss_resets}
        order by server_seq
        limit ${eventLimit + 1}
      `,
      sql`
        select id, boss_id, cycle_key, reset_seq, elite, rare, server_seq from boss_victories
        where household_id = ${householdId} and server_seq > ${since.boss_victories}
        order by server_seq
        limit ${eventLimit + 1}
      `,
      sql`
        select id, fighter_id, amount, server_seq from wallet_transactions
        where household_id = ${householdId} and server_seq > ${since.wallet_transactions}
        order by server_seq
        limit ${eventLimit + 1}
      `,
      sql`
        select id, reward_id, fighter_id, icon, title, cost, status, created_at, server_seq from reward_redemptions
        where household_id = ${householdId} and server_seq > ${since.reward_redemptions}
        order by server_seq
        limit ${eventLimit + 1}
      `
    ]);

    const eventPages = {
      chore_completions: boundedRows(completions, eventLimit),
      boss_resets: boundedRows(resets, eventLimit),
      boss_victories: boundedRows(victories, eventLimit),
      wallet_transactions: boundedRows(wallet, eventLimit),
      reward_redemptions: boundedRows(redemptions, eventLimit),
    };

    const timezone = requireString(households[0]?.timezone, 'timezone');
    return {
      serverTime: new Date().toISOString(),
      configurationRevision,
      configurationUnchanged,
      mutable: {
        households: configurationUnchanged ? [] : publicSyncRows('households', households),
        fighters: publicSyncRows('fighters', fighters),
        fighter_avatars: publicSyncRows('fighter_avatars', avatars.filter((avatar) => (
          knownAvatarHashes[String(avatar.fighter_id)] !== avatar.hash
        ))),
        bosses: publicSyncRows('bosses', decorateBosses(bosses, householdId, timezone)),
        chores: publicSyncRows('chores', chores)
      },
      events: {
        chore_completions: publicSyncRows('chore_completions', eventPages.chore_completions.rows),
        boss_resets: publicSyncRows('boss_resets', eventPages.boss_resets.rows),
        boss_victories: publicSyncRows('boss_victories', eventPages.boss_victories.rows),
        wallet_transactions: publicSyncRows('wallet_transactions', eventPages.wallet_transactions.rows),
        reward_redemptions: publicSyncRows('reward_redemptions', eventPages.reward_redemptions.rows)
      },
      eventHasMore: Object.fromEntries(Object.entries(eventPages).map(([stream, page]) => [stream, page.hasMore])),
    };
  });

  app.post('/api/sync/push', { schema: syncPushSchema }, async (request) => {
    const body = requireObject(request.body);
    const householdId = requireString(body.householdId, 'householdId');
    const auth = await requireHouseholdPrincipal(request, householdId);

    const mutations = requireObjectArray(body.mutations, 'mutations');
    const results: JsonObject[] = [];

    for (const mutation of mutations) {
      const item = requireObject(mutation);
      const mutationId = optionalString(requireObject(item.payload).id);
      try {
        const accepted = await sql.begin(async (tx) => {
          const accepted: JsonObject[] = [];
          const type = requireString(item.type, 'type');
          const payload = requireObject(item.payload);

        if (type === 'configuration_replace') {
          if (!auth.userId) throw new Error('Forbidden');
          await requireHouseholdRole(auth.userId, householdId, ['owner', 'parent']);
          const revision = expectedRevision(payload.expectedRevision);
          const [lockedHousehold] = await tx`
            select configuration_revision from households
            where id = ${householdId} and deleted_at is null
            for update
          `;
          if (!lockedHousehold || Number(lockedHousehold.configuration_revision) !== revision) {
            throw new Error('Configuration revision conflict');
          }
          const fighters = requireObjects(payload.fighters, 'fighters');
          const bosses = requireObjects(payload.bosses, 'bosses');
          const chores = requireObjects(payload.chores, 'chores');
          const rewards = requireObjects(payload.rewards, 'rewards');
          const ids = {
            fighters: {} as Record<string, string>,
            bosses: {} as Record<string, string>,
            chores: {} as Record<string, string>,
            rewards: {} as Record<string, string>
          };
          const bossesNeedingReset = new Set<string>();

          for (const [sort, fighterBody] of fighters.entries()) {
            const clientId = requireString(fighterBody.clientId, 'fighter.clientId');
            const stableId = entityId(householdId, 'fighter', clientId);
            const [existing] = await tx`
              select id from fighters
              where household_id = ${householdId} and id = ${stableId}
              for update
            `;
            const [fighter] = existing
              ? await tx`
                  update fighters set
                    name = ${requireString(fighterBody.name, 'fighter.name')},
                    color = ${requireString(fighterBody.color, 'fighter.color')},
                    sort = ${optionalNumber(fighterBody.sort, sort)},
                    deleted_at = null, version = version + 1
                  where id = ${existing.id}
                  returning id
                `
              : await tx`
                  insert into fighters (id, household_id, name, color, sort, created_by_user_id)
                  values (
                    ${stableId}, ${householdId}, ${requireString(fighterBody.name, 'fighter.name')},
                    ${requireString(fighterBody.color, 'fighter.color')},
                    ${optionalNumber(fighterBody.sort, sort)}, ${auth.userId}
                  ) returning id
                `;
            const fighterId = publicId(fighter);
            ids.fighters[clientId] = fighterId;
            if (fighterBody.avatar !== undefined && fighterBody.avatar !== null) {
              const { mime, bytes, hash } = validatedAvatar(fighterBody.avatar);
              await tx`
                insert into fighter_avatars (fighter_id, mime, bytes, hash)
                values (${fighterId}, ${mime}, ${bytes}, ${hash})
                on conflict (fighter_id) do update
                set mime = excluded.mime, bytes = excluded.bytes, hash = excluded.hash
              `;
              await tx`update fighters set avatar_hash = ${hash} where id = ${fighterId}`;
            } else {
              await tx`delete from fighter_avatars where fighter_id = ${fighterId}`;
              await tx`update fighters set avatar_hash = null where id = ${fighterId}`;
            }
          }

          for (const [sort, bossBody] of bosses.entries()) {
            const clientId = requireString(bossBody.clientId, 'boss.clientId');
            const stableId = entityId(householdId, 'boss', clientId);
            const trigger = requireObject(bossBody.trigger);
            const [existing] = await tx`
              select id from bosses
              where household_id = ${householdId} and id = ${stableId}
              for update
            `;
            const values = {
              name: requireString(bossBody.name, 'boss.name'),
              sprite: requireString(bossBody.sprite, 'boss.sprite'),
              frames: optionalNumber(bossBody.frames),
              rare: optionalBoolean(bossBody.rare),
              hue: optionalNumberOrNull(bossBody.hue),
              triggerType: requireString(trigger.type, 'trigger.type'),
              triggerDay: optionalNumberOrNull(trigger.day),
              triggerDate: optionalNumberOrNull(trigger.date),
              triggerNote: optionalString(trigger.note),
              dormant: optionalBoolean(bossBody.dormant),
              unlockAt: optionalNumber(bossBody.unlockAt),
              sort: optionalNumber(bossBody.sort, sort)
            };
            const [boss] = existing
              ? await tx`
                  update bosses set
                    name = ${values.name}, sprite = ${values.sprite}, frames = ${values.frames},
                    rare = ${values.rare}, hue = ${values.hue}, trigger_type = ${values.triggerType},
                    trigger_day = ${values.triggerDay}, trigger_date = ${values.triggerDate},
                    trigger_note = ${values.triggerNote}, dormant = ${values.dormant},
                    unlock_at = ${values.unlockAt}, sort = ${values.sort}, deleted_at = null,
                    version = version + 1
                  where id = ${existing.id}
                  returning id
                `
              : await tx`
                  insert into bosses (
                    id, household_id, name, sprite, frames, rare, hue,
                    trigger_type, trigger_day, trigger_date, trigger_note, dormant, unlock_at, sort
                  ) values (
                    ${stableId}, ${householdId}, ${values.name}, ${values.sprite}, ${values.frames},
                    ${values.rare}, ${values.hue}, ${values.triggerType}, ${values.triggerDay},
                    ${values.triggerDate}, ${values.triggerNote}, ${values.dormant}, ${values.unlockAt}, ${values.sort}
                  ) returning id
                `;
            ids.bosses[clientId] = publicId(boss);
          }

          for (const [sort, choreBody] of chores.entries()) {
            const clientId = requireString(choreBody.clientId, 'chore.clientId');
            const stableId = entityId(householdId, 'chore', clientId);
            const submittedBossId = requireString(choreBody.bossClientId, 'chore.bossClientId');
            const bossId = ids.bosses[submittedBossId] ?? submittedBossId;
            if (!Object.values(ids.bosses).includes(bossId)) throw new Error('chore.bossClientId does not reference a submitted boss');
            const [existing] = await tx`
              select id, boss_id, title, damage, repeatable, deleted_at from chores
              where household_id = ${householdId} and id = ${stableId}
              for update
            `;
            if (!existing
              || existing.boss_id !== bossId
              || String(existing.title) !== stringValue(choreBody.title, 'chore.title')
              || Number(existing.damage) !== optionalNumber(choreBody.damage)
              || Boolean(existing.repeatable) !== optionalBoolean(choreBody.repeatable)
              || existing.deleted_at) {
              bossesNeedingReset.add(bossId);
              if (existing?.boss_id) bossesNeedingReset.add(String(existing.boss_id));
            }
            const [chore] = existing
              ? await tx`
                  update chores set boss_id = ${bossId}, title = ${stringValue(choreBody.title, 'chore.title')},
                    damage = ${optionalNumber(choreBody.damage)}, repeatable = ${optionalBoolean(choreBody.repeatable)},
                    sort = ${optionalNumber(choreBody.sort, sort)}, deleted_at = null, version = version + 1
                  where id = ${existing.id}
                  returning id
                `
              : await tx`
                  insert into chores (id, household_id, boss_id, title, damage, repeatable, sort)
                  values (
                    ${stableId}, ${householdId}, ${bossId}, ${stringValue(choreBody.title, 'chore.title')},
                    ${optionalNumber(choreBody.damage)}, ${optionalBoolean(choreBody.repeatable)},
                    ${optionalNumber(choreBody.sort, sort)}
                  ) returning id
                `;
            ids.chores[clientId] = publicId(chore);
          }

          for (const [sort, rewardBody] of rewards.entries()) {
            const clientId = requireString(rewardBody.clientId, 'reward.clientId');
            const stableId = entityId(householdId, 'reward', clientId);
            const [existing] = await tx`
              select id from rewards
              where household_id = ${householdId} and id = ${stableId}
              for update
            `;
            const [reward] = existing
              ? await tx`
                  update rewards set scope = ${requireString(rewardBody.scope, 'reward.scope')},
                    icon = ${stringValue(rewardBody.icon, 'reward.icon')},
                    title = ${requireString(rewardBody.title, 'reward.title')},
                    descr = ${stringValue(rewardBody.description, 'reward.description')},
                    cost = ${optionalNumber(rewardBody.cost)}, sort = ${optionalNumber(rewardBody.sort, sort)},
                    deleted_at = null, version = version + 1
                  where id = ${existing.id}
                  returning id
                `
              : await tx`
                  insert into rewards (id, household_id, scope, icon, title, descr, cost, sort)
                  values (
                    ${stableId}, ${householdId}, ${requireString(rewardBody.scope, 'reward.scope')},
                    ${stringValue(rewardBody.icon, 'reward.icon')}, ${requireString(rewardBody.title, 'reward.title')},
                    ${stringValue(rewardBody.description, 'reward.description')}, ${optionalNumber(rewardBody.cost)},
                    ${optionalNumber(rewardBody.sort, sort)}
                  ) returning id
                `;
            ids.rewards[clientId] = publicId(reward);
          }

          const activeFighters = Object.values(ids.fighters);
          const activeBosses = Object.values(ids.bosses);
          const activeChores = Object.values(ids.chores);
          const activeRewards = Object.values(ids.rewards);
          const fighterIds = tx.array(activeFighters, 2950);
          const bossIds = tx.array(activeBosses, 2950);
          const choreIds = tx.array(activeChores, 2950);
          const rewardIds = tx.array(activeRewards, 2950);
          const removedChores = await tx`
            select boss_id from chores
            where household_id = ${householdId} and deleted_at is null and not (id = any(${choreIds}))
          `;
          removedChores.forEach((row) => bossesNeedingReset.add(String(row.boss_id)));
          const omittedClaimedFighters = await tx`
            select id from fighters
            where household_id = ${householdId} and deleted_at is null and user_id is not null
              and not (id = any(${fighterIds}))
          `;
          if (omittedClaimedFighters.length > 0) throw new Error('Claimed fighters require explicit account governance');
          await tx`update chores set deleted_at = now(), version = version + 1 where household_id = ${householdId} and deleted_at is null and not (id = any(${choreIds}))`;
          await tx`update bosses set deleted_at = now(), version = version + 1 where household_id = ${householdId} and deleted_at is null and not (id = any(${bossIds}))`;
          await tx`update fighters set deleted_at = now(), version = version + 1 where household_id = ${householdId} and deleted_at is null and not (id = any(${fighterIds}))`;
          await tx`update rewards set deleted_at = now(), version = version + 1 where household_id = ${householdId} and deleted_at is null and not (id = any(${rewardIds}))`;
          const [household] = await tx`select timezone from households where id = ${householdId}`;
          const timezone = requireString(household.timezone, 'timezone');
          for (const bossId of bossesNeedingReset) {
            const [boss] = await tx`
              select id, trigger_type, trigger_day, trigger_date from bosses
              where id = ${bossId} and household_id = ${householdId} and deleted_at is null
            `;
            if (!boss) continue;
            const cycleKey = serverCycleKey(boss, timezone);
            const [latest] = await tx`
              select coalesce(max(reset_seq), 0)::integer as reset_seq from boss_resets
              where household_id = ${householdId} and boss_id = ${bossId} and cycle_key = ${cycleKey}
            `;
            await tx`
              insert into boss_resets (household_id, boss_id, cycle_key, reset_seq, reason, created_by_user_id)
              values (${householdId}, ${bossId}, ${cycleKey}, ${Number(latest.reset_seq) + 1}, 'chores_edited', ${auth.userId})
              on conflict do nothing
            `;
          }
          const [updatedHousehold] = await tx`
            update households
            set configuration_revision = configuration_revision + 1, version = version + 1
            where id = ${householdId}
            returning configuration_revision
          `;
          accepted.push({ type, id: optionalString(payload.id), ids, configurationRevision: Number(updatedHousehold.configuration_revision) });
        } else if (type === 'chore_completion') {
          const bossId = requireString(payload.bossId, 'bossId');
          const choreId = requireString(payload.choreId, 'choreId');
          const fighterId = requireString(payload.fighterId, 'fighterId');
          const eventId = requireString(payload.id, 'id');
          const performedByDeviceId = auth.deviceId ?? null;
          const [duplicate] = await tx`
            select id, server_seq from chore_completions
            where id = ${eventId} and household_id = ${householdId}
          `;
          if (duplicate) {
            accepted.push({ type, id: duplicate.id, serverSeq: duplicate.server_seq, duplicate: true });
            return accepted;
          }
          const [boss] = await tx`
            select id, rare, dormant, unlock_at, trigger_type, trigger_day, trigger_date from bosses
            where id = ${bossId} and household_id = ${householdId} and deleted_at is null
            for update
          `;
          if (!boss) throw new Error('bosses row does not belong to household');
          const [household] = await tx`select timezone from households where id = ${householdId} and deleted_at is null`;
          const timezone = requireString(household?.timezone, 'timezone');
          if (boss.dormant) {
            const [progress] = await tx`
              select h.victories_baseline + count(v.id)::integer as victories
              from households h left join boss_victories v on v.household_id = h.id
              where h.id = ${householdId}
              group by h.victories_baseline
            `;
            if (Number(boss.unlock_at) <= 0 || Number(progress?.victories) < Number(boss.unlock_at)) {
              throw new Error('Boss is not currently available');
            }
          }
          const [chore] = await tx`
            select boss_id, title, damage, repeatable from chores
            where id = ${choreId} and household_id = ${householdId} and deleted_at is null
          `;
          if (!chore || chore.boss_id !== bossId) throw new Error('Chore does not belong to boss');
          const [fighter] = await tx`
            select id, user_id from fighters
            where id = ${fighterId} and household_id = ${householdId} and deleted_at is null
          `;
          if (!fighter) throw new Error('fighters row does not belong to household');

          if (!mayPrincipalActAsFighter(auth, fighter)) throw new Error('Fighter belongs to another account');
          const actedOnBehalf = Boolean(auth.userId && fighter.user_id !== auth.userId);

          const cycleKey = requireString(payload.cycleKey, 'cycleKey');
          if (cycleKey !== serverCycleKey(boss, timezone)) throw new Error('Cycle key is no longer current');
          if (!serverBossAvailable(boss, householdId, timezone)) throw new Error('Boss is not currently available');
          const resetSeq = optionalNumber(payload.resetSeq);
          if (!chore.repeatable) {
            const [alreadyCompleted] = await tx`
              select id from chore_completions
              where household_id = ${householdId} and chore_id = ${choreId}
                and cycle_key = ${cycleKey} and reset_seq = ${resetSeq} and voided_at is null
              limit 1
            `;
            if (alreadyCompleted) throw new Error('Chore is already completed for this cycle');
          }

          const [row] = await tx`
            insert into chore_completions (
              id, household_id, boss_id, chore_id, fighter_id, cycle_key, reset_seq,
              chore_title, damage, performed_by_user_id, performed_by_device_id,
              acted_on_behalf, completed_at
            )
            values (
              ${eventId}::uuid,
              ${householdId}, ${bossId},
              ${choreId}, ${fighterId},
              ${cycleKey}, ${resetSeq},
              ${chore.title}, ${Number(chore.damage)},
              ${auth.userId}, ${performedByDeviceId}::uuid,
              ${actedOnBehalf}, ${requireString(payload.completedAt, 'completedAt')}::timestamptz
            )
            on conflict (id) do nothing
            returning id, server_seq
          `;
          if (row) {
            await tx`
              update fighters
              set career_xp_cached = career_xp_cached + ${Number(chore.damage)}, version = version + 1
              where id = ${fighterId}
            `;
            const [health] = await tx`
              select
                (select coalesce(sum(damage), 0) from chores
                  where household_id = ${householdId} and boss_id = ${bossId} and deleted_at is null)::integer as max_hp,
                (select coalesce(sum(damage), 0) from chore_completions
                  where household_id = ${householdId} and boss_id = ${bossId}
                    and cycle_key = ${cycleKey} and reset_seq = ${resetSeq} and voided_at is null)::integer as damage
            `;
            let victoryCreated = false;
            if (Number(health.damage) >= Number(health.max_hp) && Number(health.max_hp) > 0) {
              const elite = serverBossElite(boss, householdId, timezone);
              const [victory] = await tx`
                insert into boss_victories (household_id, boss_id, cycle_key, reset_seq, elite, rare, won_at)
                values (${householdId}, ${bossId}, ${cycleKey}, ${resetSeq}, ${elite}, ${Boolean(boss.rare)}, now())
                on conflict (household_id, boss_id, cycle_key, reset_seq) do nothing
                returning id
              `;
              if (victory) {
                victoryCreated = true;
                const contributions = await tx`
                  select fighter_id, round((sum(damage) / 4.0) * ${elite ? 1.5 : 1})::integer as amount
                  from chore_completions
                  where household_id = ${householdId} and boss_id = ${bossId}
                    and cycle_key = ${cycleKey} and reset_seq = ${resetSeq} and voided_at is null
                  group by fighter_id
                `;
                for (const contribution of contributions) {
                  const amount = Number(contribution.amount);
                  if (amount <= 0) continue;
                  await tx`
                    insert into wallet_transactions (
                      household_id, fighter_id, amount, kind, reference_type, reference_id, created_by_user_id
                    ) values (
                      ${householdId}, ${contribution.fighter_id}, ${amount}, 'boss_reward',
                      'boss_victory', ${victory.id}, ${auth.userId}
                    ) on conflict do nothing
                  `;
                }
              }
            }
            accepted.push({ type, id: row.id, serverSeq: row.server_seq, victoryCreated });
          }
        } else if (type === 'boss_reset') {
          const bossId = requireString(payload.bossId, 'bossId');
          const fighterId = requireString(payload.fighterId, 'fighterId');
          const [actingFighter] = await tx`
            select user_id from fighters
            where id = ${fighterId} and household_id = ${householdId} and deleted_at is null
          `;
          if (!actingFighter) throw new Error('fighters row does not belong to household');
          if (!mayPrincipalActAsFighter(auth, actingFighter)) throw new Error('Fighter belongs to another account');
          const cycleKey = requireString(payload.cycleKey, 'cycleKey');
          const resetSeq = optionalNumber(payload.resetSeq);
          const [duplicate] = await tx`
            select id, server_seq from boss_resets
            where household_id = ${householdId} and boss_id = ${bossId}
              and cycle_key = ${cycleKey} and reset_seq = ${resetSeq}
          `;
          if (duplicate) {
            accepted.push({ type, id: duplicate.id, serverSeq: duplicate.server_seq, duplicate: true });
            return accepted;
          }
          const [boss] = await tx`
            select id, trigger_type, trigger_day, trigger_date from bosses
            where id = ${bossId} and household_id = ${householdId} and deleted_at is null
            for update
          `;
          if (!boss) throw new Error('bosses row does not belong to household');
          const [household] = await tx`select timezone from households where id = ${householdId}`;
          if (cycleKey !== serverCycleKey(boss, requireString(household.timezone, 'timezone'))) {
            throw new Error('Cycle key is no longer current');
          }
          const [latest] = await tx`
            select coalesce(max(reset_seq), 0)::integer as reset_seq from boss_resets
            where household_id = ${householdId} and boss_id = ${bossId} and cycle_key = ${cycleKey}
          `;
          if (resetSeq !== Number(latest.reset_seq) + 1) throw new Error('Reset sequence conflict');
          const [row] = await tx`
            insert into boss_resets (
              id, household_id, boss_id, cycle_key, reset_seq, reason, created_by_user_id
            )
            values (
              coalesce(${optionalString(payload.id)}::uuid, gen_random_uuid()),
              ${householdId}, ${bossId},
              ${cycleKey}, ${resetSeq},
              ${requireString(payload.reason, 'reason')}, ${auth.userId}
            )
            on conflict (household_id, boss_id, cycle_key, reset_seq) do nothing
            returning id, server_seq
          `;
          if (row) accepted.push({ type, id: row.id, serverSeq: row.server_seq });
        } else if (type === 'wallet_transfer') {
          const eventId = requireString(payload.id, 'id');
          const transferGroup = requireString(payload.transferGroup, 'transferGroup');
          const [duplicate] = await tx`
            select id, server_seq from wallet_transactions
            where household_id = ${householdId} and transfer_group = ${transferGroup}
            order by server_seq limit 1
          `;
          if (duplicate) {
            accepted.push({ type, id: duplicate.id, serverSeq: duplicate.server_seq, duplicate: true });
            return accepted;
          }
          const fighterId = requireString(payload.fighterId, 'fighterId');
          const amount = optionalNumber(payload.amount);
          if (amount <= 0) throw new Error('Transfer amount must be positive');
          const [fighter] = await tx`
            select user_id from fighters
            where id = ${fighterId} and household_id = ${householdId} and deleted_at is null
            for update
          `;
          if (!fighter) throw new Error('fighters row does not belong to household');
          if (!mayPrincipalActAsFighter(auth, fighter)) throw new Error('Fighter belongs to another account');
          const [balance] = await tx`
            select coalesce(sum(amount), 0)::integer as amount from wallet_transactions
            where household_id = ${householdId} and fighter_id = ${fighterId}
          `;
          if (Number(balance.amount) < amount) throw new Error('Insufficient wallet balance');
          const [row] = await tx`
            insert into wallet_transactions (
              id, household_id, fighter_id, amount, kind, transfer_group,
              reference_type, reference_id, note, created_by_user_id
            )
            values (
              ${eventId}::uuid,
              ${householdId}, ${fighterId}, ${-amount}, 'transfer',
              ${transferGroup}, 'transfer', ${transferGroup}, 'Transfer to shared pool', ${auth.userId}
            )
            on conflict (id) do nothing
            returning id, server_seq
          `;
          if (row) {
            await tx`
              insert into wallet_transactions (
                household_id, fighter_id, amount, kind, transfer_group,
                reference_type, reference_id, note, created_by_user_id
              ) values (
                ${householdId}, null, ${amount}, 'transfer', ${transferGroup},
                'transfer', ${transferGroup}, 'Transfer from fighter', ${auth.userId}
              ) on conflict do nothing
            `;
            accepted.push({ type, id: row.id, serverSeq: row.server_seq });
          }
        } else if (type === 'reward_redemption_update') {
          if (!auth.userId) throw new Error('Forbidden');
          const manager = await requireHouseholdMember(auth.userId, householdId);
          assertRedemptionManagerRole(manager.role);
          const redemptionId = requireString(payload.redemptionId, 'redemptionId');
          const status = requestedRedemptionStatus(payload.status);
          const [currentRedemption] = await tx`
            select id, server_seq, status, fighter_id, cost from reward_redemptions
            where id = ${redemptionId} and household_id = ${householdId}
            for update
          `;
          if (!currentRedemption) throw new Error('Not found');
          if (redemptionTransition(currentRedemption.status, status) === 'duplicate') {
            accepted.push({ type, id: currentRedemption.id, serverSeq: currentRedemption.server_seq, duplicate: true });
            return accepted;
          }
          const [redemption] = await tx`
            update reward_redemptions
            set status = ${status}, used_at = case when ${status} = 'used' then now() else used_at end,
                version = version + 1
            where id = ${redemptionId} and household_id = ${householdId}
              and status = 'active'
            returning id, server_seq
          `;
          if (!redemption) throw new Error('Not found');
          if (status === 'cancelled') {
            await tx`
              insert into wallet_transactions (
                household_id, fighter_id, amount, kind, reference_type, reference_id, created_by_user_id
              ) values (
                ${householdId}, ${currentRedemption.fighter_id}::uuid, ${Number(currentRedemption.cost)},
                'refund', 'reward_refund', ${redemptionId}, ${auth.userId}
              ) on conflict do nothing
            `;
          }
          accepted.push({ type, id: redemption.id, serverSeq: redemption.server_seq });
        } else if (type === 'reward_redemption') {
          const eventId = requireString(payload.id, 'id');
          const [duplicate] = await tx`
            select id, server_seq from reward_redemptions
            where id = ${eventId} and household_id = ${householdId}
          `;
          if (duplicate) {
            accepted.push({ type, id: duplicate.id, serverSeq: duplicate.server_seq, duplicate: true });
            return accepted;
          }
          const submittedRewardId = optionalString(payload.rewardId);
          const fighterId = optionalString(payload.fighterId);
          await assertNullableHouseholdRow('fighters', fighterId, householdId);
          const [reward] = submittedRewardId ? await tx`
            select id, scope, icon, title, cost from rewards
            where household_id = ${householdId} and deleted_at is null
              and id = ${entityId(householdId, 'reward', submittedRewardId)}
            limit 1
          ` : [null];
          if (!reward) throw new Error('rewards row does not belong to household');
          const scope = requireString(reward.scope, 'reward.scope');
          if ((scope === 'personal') !== Boolean(fighterId)) {
            throw new Error('Reward scope does not match fighter');
          }
          if (fighterId) {
            const [fighter] = await tx`
              select user_id from fighters
              where id = ${fighterId} and household_id = ${householdId} and deleted_at is null
              for update
            `;
            if (!mayPrincipalActAsFighter(auth, fighter)) throw new Error('Fighter belongs to another account');
          } else {
            if (auth.userId) {
              const [membership] = await tx`
                select role from household_members
                where household_id = ${householdId} and user_id = ${auth.userId} and status = 'active'
              `;
              if (!membership || (membership.role !== 'owner' && membership.role !== 'parent')) throw new Error('Forbidden');
            }
            await tx`select id from households where id = ${householdId} for update`;
          }
          const [balance] = await tx`
            select coalesce(sum(amount), 0)::integer as amount
            from wallet_transactions
            where household_id = ${householdId}
              and fighter_id is not distinct from ${fighterId}::uuid
          `;
          assertRedemptionFunds(balance.amount, reward.cost);
          const initial = initialRedemption();
          const [row] = await tx`
            insert into reward_redemptions (
              id, household_id, reward_id, scope, fighter_id, icon, title, cost,
              status, requested_by_user_id, approved_by_user_id
            )
            values (
              ${eventId}::uuid,
              ${householdId}, ${reward.id}::uuid,
              ${scope}, ${fighterId}::uuid,
              ${reward.icon}, ${reward.title},
              ${Number(reward.cost)}, ${initial.status},
              ${auth.userId}, ${initial.approvedByUserId}::uuid
            )
            on conflict (id) do nothing
            returning id, server_seq
          `;
          if (row) {
            const cost = Number(reward.cost);
            await tx`
              insert into wallet_transactions (
                household_id, fighter_id, amount, kind, reference_type, reference_id, created_by_user_id
              )
              values (${householdId}, ${fighterId}::uuid, ${-cost}, 'redemption', 'reward_redemption', ${row.id}, ${auth.userId})
              on conflict do nothing
            `;
            accepted.push({ type, id: row.id, serverSeq: row.server_seq });
          }
        } else {
          throw new Error(`Unsupported mutation type: ${type}`);
        }
          return accepted;
        });
        for (const result of accepted) {
          results.push({
            ...result,
            resourceId: result.id,
            id: mutationId ?? result.id,
            outcome: result.duplicate ? 'duplicate' : 'accepted'
          });
        }
      } catch (error) {
        results.push({ type: optionalString(item.type), id: mutationId, ...mutationError(error) });
      }
    }

    return {
      results,
      accepted: results.filter((result) => result.outcome === 'accepted' || result.outcome === 'duplicate')
    };
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
