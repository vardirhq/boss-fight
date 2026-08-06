import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { sql } from './db.js';
import { sendHouseholdInviteEmail } from './email.js';
import { optionalString, requiredString } from './requestValidation.js';
import { claimDeviceSchema, inviteCreateSchema, pairingCreateSchema, tokenSchema } from './routeSchemas.js';

type JsonObject = Record<string, unknown>;
type AuthContext = { userId: string; sessionId: string };
type HouseholdRole = 'owner' | 'parent' | 'member' | 'child';

export interface InvitationRouteDependencies {
  requireAuth(request: FastifyRequest): Promise<AuthContext>;
  requireHouseholdRole(userId: string, householdId: string, roles: HouseholdRole[]): Promise<unknown>;
  assertHouseholdRow(table: 'fighters', id: string, householdId: string): Promise<void>;
  entityId(householdId: string, entity: string, clientId: string): string;
}

const fighterColors = ['#F4B942', '#E0564A', '#67D391', '#5B9BE8', '#B57BE0', '#5FD0C8', '#EE8FB0', '#E8A44C'];
const requireString = requiredString;

function bodyObject(body: unknown): JsonObject {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Expected JSON object');
  return body as JsonObject;
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function publicTokenCode(length = 8) {
  return randomBytes(length).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, length).toUpperCase();
}

export function registerInvitationRoutes(app: FastifyInstance, dependencies: InvitationRouteDependencies) {
  const { requireAuth, requireHouseholdRole, assertHouseholdRow, entityId } = dependencies;

  app.post('/api/households/:householdId/pairings', { schema: pairingCreateSchema }, async (request) => {
    const auth = await requireAuth(request);
    const householdId = (request.params as { householdId: string }).householdId;
    await requireHouseholdRole(auth.userId, householdId, ['owner', 'parent']);
    const body = bodyObject(request.body);
    const role = optionalString(body.role) ?? 'household_device';
    if (role !== 'household_device' && role !== 'fighter') throw new Error('Invalid pairing role');
    const fighterId = optionalString(body.fighterId);
    if (fighterId) await assertHouseholdRow('fighters', fighterId, householdId);
    const code = publicTokenCode();
    const [pairing] = await sql`
      insert into device_pairings (household_id, fighter_id, role, code_hash, created_by_user_id, expires_at)
      values (${householdId}, ${fighterId}::uuid, ${role}, ${tokenHash(code)}, ${auth.userId}, now() + interval '15 minutes')
      returning id, household_id, fighter_id, role, expires_at, created_at
    `;
    return { pairing, code };
  });

  app.post('/api/households/:householdId/invites', {
    schema: inviteCreateSchema, config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
  }, async (request) => {
    const auth = await requireAuth(request);
    const householdId = (request.params as { householdId: string }).householdId;
    await requireHouseholdRole(auth.userId, householdId, ['owner', 'parent']);
    const body = bodyObject(request.body);
    const invitedEmail = requireString(body.email, 'email').toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitedEmail)) throw new Error('email must be valid');
    const role = optionalString(body.role) ?? 'member';
    if (role !== 'parent' && role !== 'member') throw new Error('Invalid invite role');
    const fighterId = optionalString(body.fighterId);
    if (fighterId) await assertHouseholdRow('fighters', fighterId, householdId);
    const [context] = await sql`
      select h.name as household_name, u.display_name as inviter_name from households h
      join users u on u.id = ${auth.userId}
      where h.id = ${householdId} and h.deleted_at is null and u.deleted_at is null
    `;
    if (!context) throw new Error('Not found');
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const [invite] = await sql`
      insert into household_invites (household_id, invited_email, role, fighter_id, token_hash, created_by_user_id, expires_at)
      values (${householdId}, ${invitedEmail}, ${role}, ${fighterId}::uuid, ${tokenHash(token)}, ${auth.userId}, ${expiresAt})
      returning id, household_id, invited_email, role, fighter_id, expires_at, created_at
    `;
    try {
      await sendHouseholdInviteEmail({
        to: invitedEmail, householdName: requireString(context.household_name, 'household_name'),
        inviterName: requireString(context.inviter_name, 'inviter_name'), inviteToken: token, expiresAt,
      });
    } catch (error) {
      try { await sql`update household_invites set expires_at = now() where id = ${invite.id}`; }
      catch (cleanupError) { request.log.error({ err: cleanupError, inviteId: invite.id }, 'Could not expire undelivered invitation'); }
      throw error;
    }
    try {
      await sql`update household_invites set expires_at = now() where household_id = ${householdId}
        and lower(invited_email) = ${invitedEmail} and accepted_at is null and id <> ${invite.id}`;
    } catch (cleanupError) {
      request.log.warn({ err: cleanupError, inviteId: invite.id }, 'Could not expire older invitations');
    }
    return { invite, delivered: true };
  });

  app.post('/api/invites/accept', { schema: tokenSchema }, async (request) => {
    const auth = await requireAuth(request);
    const token = requireString(bodyObject(request.body).token, 'token');
    return sql.begin(async (tx) => {
      const [user] = await tx`select id, email, display_name, kind from users where id = ${auth.userId} and deleted_at is null`;
      if (!user?.email) throw new Error('Authenticated user has no email');
      const [invite] = await tx`select * from household_invites where token_hash = ${tokenHash(token)} and accepted_at is null and expires_at > now() for update`;
      if (!invite || String(invite.invited_email).toLowerCase() !== String(user.email).toLowerCase()) throw new Error('Unauthorized');
      const [member] = await tx`
        insert into household_members (household_id, user_id, role, status, invited_by_user_id)
        values (${invite.household_id}, ${auth.userId}, ${invite.role}, 'active', ${invite.created_by_user_id})
        on conflict (household_id, user_id) do update set status = 'active', role = excluded.role, version = household_members.version + 1
        returning id, household_id, user_id, role, status
      `;
      let fighter = null;
      if (invite.fighter_id) {
        const [claimed] = await tx`update fighters set user_id = ${auth.userId}, version = version + 1
          where id = ${invite.fighter_id} and household_id = ${invite.household_id} and user_id is null and deleted_at is null returning *`;
        fighter = claimed ?? null;
      } else if (user.kind === 'adult') {
        const [existing] = await tx`select * from fighters where household_id = ${invite.household_id} and user_id = ${auth.userId} and deleted_at is null limit 1`;
        if (existing) fighter = existing;
        else {
          const [{ fighter_count: fighterCount }] = await tx`select count(*)::integer as fighter_count from fighters where household_id = ${invite.household_id} and deleted_at is null`;
          const sort = Number(fighterCount) || 0;
          const generatedId = entityId(requireString(invite.household_id, 'household_id'), 'fighter', `account-${auth.userId}`);
          const [generated] = await tx`
            insert into fighters (id, household_id, user_id, name, color, sort, created_by_user_id)
            values (${generatedId}, ${invite.household_id}, ${auth.userId}, ${requireString(user.display_name, 'display_name')}, ${fighterColors[sort % fighterColors.length]}, ${sort}, ${auth.userId})
            on conflict (id) do update set user_id = excluded.user_id, name = excluded.name, deleted_at = null, version = fighters.version + 1 returning *
          `;
          fighter = generated;
        }
      }
      await tx`update household_invites set accepted_at = now(), accepted_by_user_id = ${auth.userId} where id = ${invite.id}`;
      return { member, fighter };
    });
  });

  app.post('/api/pairings/claim-household-device', { schema: claimDeviceSchema }, async (request) => {
    const body = bodyObject(request.body);
    const code = requireString(body.code, 'code').toUpperCase();
    const name = optionalString(body.name) ?? '';
    const platform = optionalString(body.platform) ?? 'android';
    const deviceToken = randomBytes(32).toString('base64url');
    return sql.begin(async (tx) => {
      const [pairing] = await tx`select id, household_id from device_pairings where role = 'household_device'
        and code_hash = ${tokenHash(code)} and claimed_at is null and expires_at > now() for update`;
      if (!pairing) throw new Error('Unauthorized');
      const householdId = requireString(pairing.household_id, 'household_id');
      const [device] = await tx`insert into devices (household_id, kind, name, platform, token_hash, last_seen_at)
        values (${householdId}, 'household', ${name}, ${platform}, ${tokenHash(deviceToken)}, now()) returning id, household_id, kind, name, platform`;
      await tx`update device_pairings set claimed_at = now(), claimed_device_id = ${device.id} where id = ${pairing.id}`;
      return { device, deviceToken, householdId };
    });
  });
}
