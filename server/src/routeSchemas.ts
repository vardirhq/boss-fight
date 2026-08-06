const boundedText = (maximum: number, minimum = 1) => ({ type: 'string', minLength: minimum, maxLength: maximum });

export const registerSchema = {
  body: {
    type: 'object', additionalProperties: false, required: ['email', 'displayName', 'password'],
    properties: { email: boundedText(254), displayName: boundedText(120), password: boundedText(256, 10) },
  },
} as const;

export const loginSchema = {
  body: {
    type: 'object', additionalProperties: false, required: ['email', 'password'],
    properties: { email: boundedText(254), password: boundedText(256) },
  },
} as const;

const cursor = { type: 'string', pattern: '^(0|[1-9][0-9]*)$', maxLength: 16 } as const;

export const syncPullSchema = {
  querystring: {
    type: 'object', additionalProperties: false, required: ['household_id'],
    properties: {
      household_id: { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' },
      since_chore_completions: cursor, since_boss_resets: cursor, since_boss_victories: cursor,
      since_wallet_transactions: cursor, since_reward_redemptions: cursor,
      known_configuration_revision: cursor,
      event_limit: { type: 'string', pattern: '^[1-9][0-9]{0,2}$' },
      known_avatar_hashes: { type: 'string', maxLength: 6_000 },
    },
  },
} as const;

export const syncPushSchema = {
  body: {
    type: 'object', additionalProperties: false, required: ['householdId', 'mutations'],
    properties: {
      householdId: { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' },
      mutations: {
        type: 'array', maxItems: 200,
        items: {
          type: 'object', additionalProperties: false, required: ['type', 'payload'],
          properties: {
            type: { type: 'string', minLength: 1, maxLength: 64 },
            payload: { type: 'object' },
          },
        },
      },
    },
  },
} as const;
