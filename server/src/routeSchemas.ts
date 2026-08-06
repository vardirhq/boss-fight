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

export const emptyBodySchema = { body: { type: 'object', additionalProperties: false, maxProperties: 0 } } as const;
export const tokenSchema = { body: { type: 'object', additionalProperties: false, required: ['token'], properties: { token: boundedText(512) } } } as const;
export const emailSchema = { body: { type: 'object', additionalProperties: false, required: ['email'], properties: { email: boundedText(254) } } } as const;
export const resetConfirmSchema = { body: { type: 'object', additionalProperties: false, required: ['token', 'password'], properties: { token: boundedText(512), password: boundedText(256, 10) } } } as const;
export const childLoginSchema = {
  body: { type: 'object', additionalProperties: false, required: ['householdId', 'fighterId', 'pin'], properties: {
    householdId: boundedText(128), fighterId: boundedText(128), pin: boundedText(32),
    deviceName: boundedText(120, 0), platform: boundedText(64, 0),
  } },
} as const;
export const childPairSchema = {
  body: { type: 'object', additionalProperties: false, required: ['code', 'pin'], properties: {
    code: boundedText(128), pin: boundedText(32), deviceName: boundedText(120, 0), platform: boundedText(64, 0),
  } },
} as const;
export const sessionParamsSchema = { params: { type: 'object', additionalProperties: false, required: ['sessionId'], properties: { sessionId: boundedText(128) } } } as const;
export const eraseAdultSchema = { body: { type: 'object', additionalProperties: false, required: ['password', 'confirmedEmail'], properties: { password: boundedText(256), confirmedEmail: boundedText(254) } } } as const;

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
