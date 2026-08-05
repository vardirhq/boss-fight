const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizedEmail(value: unknown): string {
  if (typeof value !== 'string') throw new Error('email is required');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !emailPattern.test(email)) throw new Error('email must be valid');
  return email;
}

export function configuredCorsOrigins(value: string | undefined, production: boolean): string[] {
  const origins = (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.includes('*')) throw new Error('CORS_ORIGIN must list explicit origins');
  if (production && origins.length === 0) throw new Error('CORS_ORIGIN is required in production');
  return origins.length > 0 ? origins : ['http://localhost:5173'];
}

export function trustProxyEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

export const apiSecurityHeaders = {
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  'cross-origin-resource-policy': 'same-site',
  'referrer-policy': 'no-referrer',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
} as const;
