import type { FastifyInstance, FastifyRequest } from 'fastify';
import { sql } from './db.js';
import { queryInteger, requiredString } from './requestValidation.js';
import { syncPullSchema } from './routeSchemas.js';
import { boundedRows } from './sync.js';
import { publicSyncRows } from './syncProjection.js';

type JsonObject = Record<string, unknown>;
type PrincipalContext = { userId: string | null; sessionId?: string; deviceId?: string; kind: 'user' | 'household_device' };

export interface SyncPullRouteDependencies {
  requireHouseholdPrincipal(request: FastifyRequest, householdId: string): Promise<PrincipalContext>;
  decorateBosses(rows: JsonObject[], householdId: string, timezone: string): JsonObject[];
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const requireString = requiredString;

export function registerSyncPullRoutes(app: FastifyInstance, dependencies: SyncPullRouteDependencies) {
  const { requireHouseholdPrincipal, decorateBosses } = dependencies;

  app.get('/api/sync/pull', { schema: syncPullSchema }, async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const householdId = requireString(query.household_id, 'household_id');
    await requireHouseholdPrincipal(request, householdId);

    const since = {
      chore_completions: queryInteger(query.since_chore_completions, 'since_chore_completions'),
      boss_resets: queryInteger(query.since_boss_resets, 'since_boss_resets'),
      boss_victories: queryInteger(query.since_boss_victories, 'since_boss_victories'),
      wallet_transactions: queryInteger(query.since_wallet_transactions, 'since_wallet_transactions'),
      reward_redemptions: queryInteger(query.since_reward_redemptions, 'since_reward_redemptions'),
    };
    const eventLimit = queryInteger(query.event_limit, 'event_limit', 250);
    if (!Number.isSafeInteger(eventLimit) || eventLimit < 1 || eventLimit > 500) {
      throw new Error('event_limit must be an integer between 1 and 500');
    }
    const knownConfigurationRevision = query.known_configuration_revision === undefined
      ? null
      : queryInteger(query.known_configuration_revision, 'known_configuration_revision');
    if (knownConfigurationRevision !== null && (!Number.isSafeInteger(knownConfigurationRevision) || knownConfigurationRevision < 0)) {
      throw new Error('known_configuration_revision must be a non-negative integer');
    }

    let knownAvatarHashes: Record<string, string> = {};
    if (query.known_avatar_hashes) {
      try {
        const parsed = JSON.parse(query.known_avatar_hashes) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).length > 50) throw new Error();
        knownAvatarHashes = Object.fromEntries(Object.entries(parsed).filter(([id, hash]) => (
          uuidPattern.test(id) && typeof hash === 'string' && /^[a-f0-9]{64}$/i.test(hash)
        )));
        if (Object.keys(knownAvatarHashes).length !== Object.keys(parsed).length) throw new Error();
      } catch {
        throw new Error('known_avatar_hashes must be valid');
      }
    }

    const households = await sql`
      select id, name, timezone, victories_baseline, configuration_revision
      from households where id = ${householdId} and deleted_at is null
    `;
    const configurationRevision = Number(households[0]?.configuration_revision ?? 0);
    const configurationUnchanged = knownConfigurationRevision === configurationRevision;
    const [fighters, avatars, bosses, chores] = configurationUnchanged
      ? [[], [], [], []]
      : await Promise.all([
        sql`
          select f.id, f.user_id, f.name, f.color, f.avatar_hash, f.streak, f.coins_cached,
            f.career_xp_cached, f.sort, (f.deleted_at is not null) as deleted,
            u.kind as user_kind, hm.status as account_status, hm.role as account_role
          from fighters f
          left join users u on u.id = f.user_id
          left join household_members hm on hm.household_id = f.household_id and hm.user_id = f.user_id
          where f.household_id = ${householdId}
          order by f.sort, f.created_at, f.id
        `,
        sql`
          select fa.fighter_id, fa.mime, encode(fa.bytes, 'base64') as bytes_base64, fa.hash
          from fighter_avatars fa join fighters f on f.id = fa.fighter_id
          where f.household_id = ${householdId}
        `,
        sql`
          select id, name, sprite, frames, rare, hue, trigger_type, trigger_day,
            trigger_date, trigger_note, dormant, unlock_at, sort,
            (deleted_at is not null) as deleted
          from bosses where household_id = ${householdId}
          order by sort, created_at, id
        `,
        sql`
          select id, boss_id, title, damage, repeatable, sort,
            (deleted_at is not null) as deleted
          from chores where household_id = ${householdId}
          order by boss_id, sort, created_at, id
        `,
      ]);

    const [completions, resets, victories, wallet, redemptions] = await Promise.all([
      sql`select id, boss_id, chore_id, fighter_id, cycle_key, reset_seq,
        chore_title, damage, voided_at, server_seq from chore_completions
        where household_id = ${householdId} and server_seq > ${since.chore_completions}
        order by server_seq limit ${eventLimit + 1}`,
      sql`select id, boss_id, cycle_key, reset_seq, server_seq from boss_resets
        where household_id = ${householdId} and server_seq > ${since.boss_resets}
        order by server_seq limit ${eventLimit + 1}`,
      sql`select id, boss_id, cycle_key, reset_seq, elite, rare, server_seq from boss_victories
        where household_id = ${householdId} and server_seq > ${since.boss_victories}
        order by server_seq limit ${eventLimit + 1}`,
      sql`select id, fighter_id, amount, server_seq from wallet_transactions
        where household_id = ${householdId} and server_seq > ${since.wallet_transactions}
        order by server_seq limit ${eventLimit + 1}`,
      sql`select id, reward_id, fighter_id, icon, title, cost, status, created_at, server_seq from reward_redemptions
        where household_id = ${householdId} and server_seq > ${since.reward_redemptions}
        order by server_seq limit ${eventLimit + 1}`,
    ]);

    const eventPages = {
      chore_completions: boundedRows(completions, eventLimit),
      boss_resets: boundedRows(resets, eventLimit),
      boss_victories: boundedRows(victories, eventLimit),
      wallet_transactions: boundedRows(wallet, eventLimit),
      reward_redemptions: boundedRows(redemptions, eventLimit),
    };
    const timezone = requireString(households[0]?.timezone, 'timezone');
    return {
      serverTime: new Date().toISOString(),
      configurationRevision,
      configurationUnchanged,
      mutable: {
        households: configurationUnchanged ? [] : publicSyncRows('households', households),
        fighters: publicSyncRows('fighters', fighters),
        fighter_avatars: publicSyncRows('fighter_avatars', avatars.filter((avatar) => (
          knownAvatarHashes[String(avatar.fighter_id)] !== avatar.hash
        ))),
        bosses: publicSyncRows('bosses', decorateBosses(bosses, householdId, timezone)),
        chores: publicSyncRows('chores', chores),
      },
      events: {
        chore_completions: publicSyncRows('chore_completions', eventPages.chore_completions.rows),
        boss_resets: publicSyncRows('boss_resets', eventPages.boss_resets.rows),
        boss_victories: publicSyncRows('boss_victories', eventPages.boss_victories.rows),
        wallet_transactions: publicSyncRows('wallet_transactions', eventPages.wallet_transactions.rows),
        reward_redemptions: publicSyncRows('reward_redemptions', eventPages.reward_redemptions.rows),
      },
      eventHasMore: Object.fromEntries(Object.entries(eventPages).map(([stream, page]) => [stream, page.hasMore])),
    };
  });
}
