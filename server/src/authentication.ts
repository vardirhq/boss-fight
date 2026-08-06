import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { FastifyRequest } from 'fastify';
import { sql } from './db.js';
import { sendEmailVerification } from './email.js';
import { requiredString } from './requestValidation.js';
import { sessionExpiry, sessionIdleCutoff, sessionPolicy } from './sessionPolicy.js';

type JsonObject = Record<string, unknown>;
export type AuthContext = { userId: string; sessionId: string };

const scrypt = promisify(scryptCallback);
const passwordKeyLength = 64;
const requireString = requiredString;

function publicId(row: JsonObject) {
  return requireString(row.id, 'id');
}

export function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function hashSecret(secret: string) {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(secret, salt, passwordKeyLength)) as Buffer;
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

export async function hashPassword(password: string) {
  if (password.length < 10) throw new Error('Password must be at least 10 characters');
  return hashSecret(password);
}

export async function verifySecret(secret: string, stored: unknown) {
  if (typeof stored !== 'string') return false;
  const [scheme, salt, expectedHex] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !expectedHex) return false;
  const actual = (await scrypt(secret, salt, passwordKeyLength)) as Buffer;
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function verifyPassword(password: string, stored: unknown) {
  return verifySecret(password, stored);
}

export function bearerToken(request: FastifyRequest) {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

export function deviceToken(request: FastifyRequest) {
  const value = request.headers['x-boss-kamp-device-token'];
  return Array.isArray(value) ? value[0] : value ?? null;
}

export async function createSession(userId: string, deviceId?: string | null) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = sessionExpiry(new Date(), sessionPolicy());
  const [session] = await sql`
    insert into sessions (user_id, device_id, token_hash, expires_at, last_used_at)
    values (${userId}, ${deviceId ?? null}, ${tokenHash(token)}, ${expiresAt}, now())
    returning id, expires_at
  `;
  return { token, sessionId: publicId(session), expiresAt: session.expires_at };
}

export async function issueEmailVerification(userId: string, email: string, displayName: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const [record] = await sql`
    insert into email_verification_tokens (user_id, token_hash, expires_at)
    values (${userId}, ${tokenHash(token)}, ${expiresAt}) returning id
  `;
  try {
    await sendEmailVerification({ to: email, displayName, token, expiresAt });
  } catch (error) {
    await sql`delete from email_verification_tokens where id = ${record.id}`;
    throw error;
  }
}

export async function requireAuth(request: FastifyRequest): Promise<AuthContext> {
  const token = bearerToken(request);
  if (!token) throw new Error('Unauthorized');
  const [session] = await sql`
    update sessions set last_used_at = now()
    where token_hash = ${tokenHash(token)} and revoked_at is null and expires_at > now()
      and coalesce(last_used_at, created_at) > ${sessionIdleCutoff(new Date(), sessionPolicy())}
    returning id, user_id
  `;
  if (!session) throw new Error('Unauthorized');
  return { userId: requireString(session.user_id, 'user_id'), sessionId: publicId(session) };
}
