import type { FastifyRequest } from 'fastify';
import { bearerToken, deviceToken, requireAuth, tokenHash } from './authentication.js';
import { sql } from './db.js';
import { requiredString } from './requestValidation.js';

type JsonObject = Record<string, unknown>;
export type PrincipalContext = { userId: string | null; sessionId?: string; deviceId?: string; kind: 'user' | 'household_device' };
export type HouseholdRole = 'owner' | 'parent' | 'member' | 'child';
const requireString = requiredString;

function publicId(row: JsonObject) {
  return requireString(row.id, 'id');
}

export async function requireHouseholdMember(userId: string, householdId: string) {
  const [member] = await sql`
    select id, role from household_members
    where household_id = ${householdId} and user_id = ${userId} and status = 'active'
  `;
  if (!member) throw new Error('Forbidden');
  return member;
}

export async function requireHouseholdPrincipal(request: FastifyRequest, householdId: string): Promise<PrincipalContext> {
  if (bearerToken(request)) {
    const auth = await requireAuth(request);
    await requireHouseholdMember(auth.userId, householdId);
    return { ...auth, kind: 'user' };
  }
  const tokenFromDevice = deviceToken(request);
  if (tokenFromDevice) {
    const [device] = await sql`
      update devices set last_seen_at = now()
      where household_id = ${householdId} and kind = 'household'
        and token_hash = ${tokenHash(tokenFromDevice)} and revoked_at is null
      returning id
    `;
    if (!device) throw new Error('Unauthorized');
    return { userId: null, deviceId: publicId(device), kind: 'household_device' };
  }
  throw new Error('Unauthorized');
}

export async function requireHouseholdRole(userId: string, householdId: string, roles: HouseholdRole[]) {
  const member = await requireHouseholdMember(userId, householdId);
  const role = requireString(member.role, 'role') as HouseholdRole;
  if (!roles.includes(role)) throw new Error('Forbidden');
  return member;
}

export async function assertHouseholdRow(
  table: 'bosses' | 'chores' | 'fighters' | 'rewards' | 'devices', id: string, householdId: string,
) {
  const rows = await sql`select id from ${sql(table)} where id = ${id} and household_id = ${householdId} limit 1`;
  if (rows.length === 0) throw new Error(`${table} row does not belong to household`);
}

export async function assertNullableHouseholdRow(
  table: 'fighters' | 'rewards' | 'devices', id: string | null, householdId: string,
) {
  if (id) await assertHouseholdRow(table, id, householdId);
}
