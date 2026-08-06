import type { FastifyInstance } from 'fastify';

const validationMessages = [
  'is required', 'must be an array', 'must be a string', 'must contain at most', 'Expected JSON object',
  'Expected numeric value', 'Expected boolean value', 'Expected string value', 'Numeric value is outside',
  'Avatar must be an object', 'Avatar MIME type must be', 'Avatar bytes must be', 'Avatar exceeds the',
  'Avatar bytes do not match', 'Avatar hash must be', 'must be a non-negative integer',
  'Password must be at least', 'PIN must be at least', 'Invalid pairing role', 'Invalid invite role',
  'Unsupported redemption status', 'email must be valid', 'Household name confirmation does not match',
  'Account email confirmation does not match', 'Invalid or expired password reset token',
  'Invalid or expired email verification token', 'known_avatar_hashes must be valid',
  'known_configuration_revision must be a non-negative integer',
  'event_limit must be an integer between 1 and 500',
] as const;

const domainMessages = [
  'does not belong to household', 'Chore does not belong to boss', 'does not reference a submitted boss',
  'Avatar hash does not match bytes', 'Fighter belongs to another account',
  'Chore is already completed for this cycle', 'Insufficient wallet balance',
  'Reward scope does not match fighter', 'Fighter is already claimed or missing',
  'Cycle key is no longer current', 'Boss is not currently available', 'Reset sequence conflict',
  'Transfer amount must be positive', 'Victory payout amount must be positive', 'Unsupported mutation type',
  'Cannot administer your own membership', 'Parents cannot administer owners or other parents',
  'Household must retain an active owner', 'Claimed fighters require explicit account governance',
  'Transfer or erase owned households before deleting the account',
] as const;

export type PublicApiError = { status: number; body: { error: string; code: string }; unexpected: boolean };

export function publicApiError(error: unknown): PublicApiError {
  const message = error instanceof Error ? error.message : 'Bad request';
  const info = error as Error & { code?: string; statusCode?: number; validation?: unknown };
  if (info.statusCode === 400 || info.validation || info.code?.startsWith('22')) return { status: 400, body: { error: 'Invalid request data', code: 'invalid_request' }, unexpected: false };
  if (info.statusCode === 429) return { status: 429, body: { error: 'Too many requests', code: 'rate_limited' }, unexpected: false };
  if (info.code === 'mail_delivery_failed') return { status: 502, body: { error: 'Email could not be delivered', code: 'mail_delivery_failed' }, unexpected: false };
  if (message === 'Unauthorized') return { status: 401, body: { error: 'Unauthorized', code: 'unauthenticated' }, unexpected: false };
  if (message === 'Forbidden') return { status: 403, body: { error: 'Forbidden', code: 'forbidden' }, unexpected: false };
  if (message === 'Not found') return { status: 404, body: { error: 'Not found', code: 'not_found' }, unexpected: false };
  if (info.code === '23505') return { status: 409, body: { error: 'A conflicting record already exists', code: 'conflict' }, unexpected: false };
  if (validationMessages.some((part) => message.includes(part))) return { status: 400, body: { error: message, code: 'invalid_request' }, unexpected: false };
  if (domainMessages.some((part) => message.includes(part))) return { status: 422, body: { error: message, code: 'domain_rule' }, unexpected: false };
  return { status: 500, body: { error: 'Internal server error', code: 'internal_error' }, unexpected: true };
}

export function installApiErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    const response = publicApiError(error);
    if (response.unexpected) request.log.error({ err: error }, 'Unhandled API error');
    reply.code(response.status).send(response.body);
  });
}
