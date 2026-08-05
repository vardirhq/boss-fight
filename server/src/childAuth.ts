export const childAuthRateLimit = {
  max: Number(process.env.CHILD_AUTH_RATE_LIMIT_MAX ?? 20),
  timeWindow: process.env.CHILD_AUTH_RATE_LIMIT_WINDOW ?? '10 minutes',
};

export type ChildPairAuthentication<T> =
  | { authenticated: true; value: T }
  | { authenticated: false };

/**
 * Convert a committed child-pairing result into the route result. Authentication
 * failure is intentionally thrown only after the transaction promise resolves,
 * so its failed-attempt and lockout writes are not rolled back.
 */
export async function committedChildPairAuthentication<T>(
  transaction: () => Promise<ChildPairAuthentication<T> | undefined>,
): Promise<T> {
  const result = await transaction();
  if (!result?.authenticated) throw new Error('Unauthorized');
  return result.value;
}
