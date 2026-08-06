import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { normalizedEmail } from './apiSecurity.js';
import {
  createSession, hashPassword, issueEmailVerification, requireAuth,
  tokenHash, verifyPassword, verifySecret,
} from './authentication.js';
import { childAuthRateLimit, committedChildPairAuthentication } from './childAuth.js';
import { sql } from './db.js';
import { sendPasswordResetEmail } from './email.js';
import {
  adultLoginRateLimit, loginLocked, loginLockoutPolicy, loginLockoutUntil, registrationRateLimit,
} from './loginPolicy.js';
import { assertAdultErasureConfirmation } from './privacy.js';
import { optionalString, requiredString } from './requestValidation.js';
import {
  childLoginSchema, childPairSchema, emailSchema, emptyBodySchema, eraseAdultSchema,
  loginSchema, registerSchema, resetConfirmSchema, sessionParamsSchema, tokenSchema,
} from './routeSchemas.js';
import { sessionIdleCutoff, sessionPolicy } from './sessionPolicy.js';

type JsonObject = Record<string, unknown>;
const requireString = requiredString;

function requireObject(body: unknown): JsonObject {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Expected JSON object');
  return body as JsonObject;
}

function publicId(row: JsonObject) {
  return requireString(row.id, 'id');
}

export function registerAuthAccountRoutes(app: FastifyInstance) {
  app.post('/api/auth/register', { schema: registerSchema, config: { rateLimit: registrationRateLimit } }, async (request) => {
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

  app.post('/api/auth/login', { schema: loginSchema, config: { rateLimit: adultLoginRateLimit } }, async (request) => {
    const body = requireObject(request.body);
    const email = normalizedEmail(body.email);
    const password = requireString(body.password, 'password');

    const [user] = await sql`
      select id, email, display_name, password_hash, email_verified_at,
        failed_login_attempts, login_locked_until
      from users
      where lower(email) = ${email}
        and kind = 'adult'
        and deleted_at is null
    `;
    // A locked account, an unknown address, and a wrong password are all reported
    // identically, so the response cannot be used to tell them apart.
    if (!user || loginLocked(user.login_locked_until)) throw new Error('Unauthorized');

    if (!(await verifyPassword(password, user.password_hash))) {
      const attempts = Number(user.failed_login_attempts) + 1;
      // Written outside any transaction so the counter survives the thrown failure —
      // the rollback trap that made the child pairing lockout ineffective.
      await sql`
        update users
        set failed_login_attempts = ${attempts},
            login_locked_until = ${loginLockoutUntil(attempts, new Date(), loginLockoutPolicy())}
        where id = ${user.id}
      `;
      throw new Error('Unauthorized');
    }

    if (Number(user.failed_login_attempts) !== 0 || user.login_locked_until) {
      await sql`update users set failed_login_attempts = 0, login_locked_until = null where id = ${user.id}`;
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
      // Proving control of the mailbox clears the lock, so guessing cannot keep a
      // legitimate owner out of their own household.
      await tx`
        update users
        set password_hash = ${passwordHash}, failed_login_attempts = 0,
            login_locked_until = null, version = version + 1
        where id = ${record.user_id}
      `;
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
}
