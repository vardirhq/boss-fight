const boundedText = (maximum: number, minimum = 1) => ({ type: 'string', minLength: minimum, maxLength: maximum });
const identifier = boundedText(128);
const sortOrder = { type: 'integer', minimum: 0, maximum: 100_000 } as const;
const count = { type: 'integer', minimum: 0, maximum: 1_000_000_000 } as const;
const nullable = <T extends object>(schema: T) => ({ anyOf: [schema, { type: 'null' }] });
const householdParams = {
  type: 'object', additionalProperties: false, required: ['householdId'], properties: { householdId: identifier },
} as const;
const entityParams = (key: string) => ({
  type: 'object', additionalProperties: false, required: ['householdId', key],
  properties: { householdId: identifier, [key]: identifier },
});

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

const fighterProperties = {
  clientId: identifier, userId: identifier, name: boundedText(120), color: boundedText(32),
  avatarHash: boundedText(128), avatar: { type: ['object', 'null'] }, streak: count, coins: count,
  careerXp: count, sort: sortOrder,
} as const;
const bossProperties = {
  clientId: identifier, name: boundedText(120), sprite: boundedText(120),
  frames: { type: 'integer', minimum: 1, maximum: 1_000 }, rare: { type: 'boolean' },
  hue: nullable({ type: 'number', minimum: 0, maximum: 360 }),
  triggerType: boundedText(32), triggerDay: nullable({ type: 'integer', minimum: 0, maximum: 6 }),
  triggerDate: nullable({ type: 'integer', minimum: 1, maximum: 31 }), triggerNote: boundedText(500, 0),
  dormant: { type: 'boolean' }, unlockAt: count, sort: sortOrder,
} as const;
const choreProperties = {
  clientId: identifier, bossClientId: identifier, bossId: identifier, title: boundedText(200, 0),
  damage: count, repeatable: { type: 'boolean' }, sort: sortOrder,
} as const;
const rewardProperties = {
  clientId: identifier, scope: { type: 'string', enum: ['personal', 'group'] }, icon: boundedText(32, 0),
  title: boundedText(200), description: boundedText(1_000, 0), descr: boundedText(1_000, 0),
  cost: count, sort: sortOrder,
} as const;

export const bootstrapSchema = { body: {
  type: 'object', additionalProperties: false, required: ['householdName'], properties: {
    householdName: boundedText(120), timezone: boundedText(64), victoriesBaseline: count,
    ownerFighterClientId: identifier, pool: count,
    fighters: { type: 'array', maxItems: 100, items: { type: 'object', additionalProperties: false, required: ['clientId', 'name', 'color'], properties: fighterProperties } },
    bosses: { type: 'array', maxItems: 100, items: { type: 'object', additionalProperties: false, required: ['clientId', 'name', 'sprite', 'trigger'], properties: {
      ...bossProperties,
      trigger: { type: 'object', additionalProperties: false, required: ['type'], properties: {
        type: boundedText(32), day: nullable({ type: 'integer', minimum: 0, maximum: 6 }),
        date: nullable({ type: 'integer', minimum: 1, maximum: 31 }), note: boundedText(500, 0),
      } },
    } } },
    chores: { type: 'array', maxItems: 500, items: { type: 'object', additionalProperties: false, required: ['clientId', 'bossClientId'], properties: choreProperties } },
    rewards: { type: 'array', maxItems: 500, items: { type: 'object', additionalProperties: false, required: ['clientId', 'scope', 'title'], properties: rewardProperties } },
  },
} } as const;

export const householdParamsSchema = { params: householdParams } as const;
export const householdEraseSchema = { params: householdParams, body: { type: 'object', additionalProperties: false, required: ['password', 'confirmedName'], properties: { password: boundedText(256), confirmedName: boundedText(120) } } } as const;
export const householdPatchSchema = { params: householdParams, body: { type: 'object', additionalProperties: false, minProperties: 1, properties: { name: boundedText(120), timezone: boundedText(64) } } } as const;
export const fighterCreateSchema = { params: householdParams, body: { type: 'object', additionalProperties: false, required: ['name', 'color'], properties: fighterProperties } } as const;
export const fighterPatchSchema = { params: entityParams('fighterId'), body: { type: 'object', additionalProperties: false, minProperties: 1, properties: fighterProperties } } as const;
export const fighterParamsSchema = { params: entityParams('fighterId') } as const;
export const childCreateSchema = { params: householdParams, body: { type: 'object', additionalProperties: false, required: ['fighterId', 'pin', 'authorized', 'privacyNoticeVersion'], properties: { fighterId: identifier, pin: boundedText(32, 4), authorized: { const: true }, privacyNoticeVersion: boundedText(64) } } } as const;
export const pinSchema = { params: entityParams('fighterId'), body: { type: 'object', additionalProperties: false, required: ['pin'], properties: { pin: boundedText(32, 4) } } } as const;
export const suspendSchema = { params: entityParams('fighterId'), body: { type: 'object', additionalProperties: false, properties: { suspended: { type: 'boolean' } } } } as const;
export const childParamsSchema = { params: entityParams('fighterId') } as const;
export const pairingCreateSchema = { params: householdParams, body: { type: 'object', additionalProperties: false, properties: { role: { type: 'string', enum: ['household_device', 'fighter'] }, fighterId: identifier } } } as const;
export const inviteCreateSchema = { params: householdParams, body: { type: 'object', additionalProperties: false, required: ['email'], properties: { email: boundedText(254), role: { type: 'string', enum: ['parent', 'member'] }, fighterId: identifier } } } as const;
export const claimDeviceSchema = { body: { type: 'object', additionalProperties: false, required: ['code'], properties: { code: boundedText(128), name: boundedText(120, 0), platform: boundedText(64, 0) } } } as const;
export const bossCreateSchema = { params: householdParams, body: { type: 'object', additionalProperties: false, required: ['name', 'sprite'], properties: bossProperties } } as const;
export const bossPatchSchema = { params: entityParams('bossId'), body: { type: 'object', additionalProperties: false, minProperties: 1, properties: bossProperties } } as const;
export const bossParamsSchema = { params: entityParams('bossId') } as const;
export const choreCreateSchema = { params: householdParams, body: { type: 'object', additionalProperties: false, required: ['bossId', 'title'], properties: choreProperties } } as const;
export const chorePatchSchema = { params: entityParams('choreId'), body: { type: 'object', additionalProperties: false, minProperties: 1, properties: choreProperties } } as const;
export const choreParamsSchema = { params: entityParams('choreId') } as const;
export const rewardCreateSchema = { params: householdParams, body: { type: 'object', additionalProperties: false, required: ['scope', 'title'], properties: rewardProperties } } as const;
export const rewardPatchSchema = { params: entityParams('rewardId'), body: { type: 'object', additionalProperties: false, minProperties: 1, properties: rewardProperties } } as const;
export const rewardParamsSchema = { params: entityParams('rewardId') } as const;

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
