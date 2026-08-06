import type { FastifyInstance, FastifyRequest } from 'fastify';
import { sql } from './db.js';
import {
  assertRedemptionFunds, assertRedemptionManagerRole, initialRedemption,
  redemptionTransition, requestedRedemptionStatus,
} from './redemption.js';
import {
  optionalBoolean, optionalBooleanOrNull, optionalNumber, optionalNumberOrNull,
  optionalString, requiredString, requireObjectArray, stringValue,
} from './requestValidation.js';
import { syncPushSchema } from './routeSchemas.js';
import { expectedRevision, mutationError } from './sync.js';
import { validatedAvatar } from './avatarValidation.js';

type JsonObject = Record<string, unknown>;
type PrincipalContext = { userId: string | null; sessionId?: string; deviceId?: string; kind: 'user' | 'household_device' };
type HouseholdRole = 'owner' | 'parent' | 'member' | 'child';
type FighterOwnerRow = { user_id?: unknown };

export interface SyncPushRouteDependencies {
  requireHouseholdPrincipal(request: FastifyRequest, householdId: string): Promise<PrincipalContext>;
  requireHouseholdMember(userId: string, householdId: string): Promise<JsonObject>;
  requireHouseholdRole(userId: string, householdId: string, roles: HouseholdRole[]): Promise<unknown>;
  assertHouseholdRow(table: 'bosses' | 'chores' | 'fighters' | 'rewards' | 'devices', id: string, householdId: string): Promise<void>;
  assertNullableHouseholdRow(table: 'fighters' | 'rewards' | 'devices', id: string | null, householdId: string): Promise<void>;
  entityId(householdId: string, entity: string, clientId: string): string;
  serverCycleKey(boss: JsonObject, timezone: string, now?: Date): string;
  serverBossAvailable(boss: JsonObject, householdId: string, timezone: string, now?: Date): boolean;
  serverBossElite(boss: JsonObject, householdId: string, timezone: string, now?: Date): boolean;
}

const appendTables = [
  'chore_completions', 'boss_resets', 'boss_victories',
  'wallet_transactions', 'reward_redemptions',
] as const;
const mutableTables = [
  'households', 'household_members', 'devices', 'fighters',
  'fighter_avatars', 'bosses', 'chores', 'rewards',
] as const;
const requireString = requiredString;

function requireObject(body: unknown): JsonObject {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Expected JSON object');
  return body as JsonObject;
}

function requireObjects(value: unknown, field: string): JsonObject[] {
  return requireObjectArray(value, field);
}

function publicId(row: JsonObject) {
  return requireString(row.id, 'id');
}

function mayPrincipalActAsFighter(auth: PrincipalContext, fighter: FighterOwnerRow | undefined) {
  if (!fighter) return false;
  const fighterUserId = typeof fighter.user_id === 'string' ? fighter.user_id : null;
  return fighterUserId === null || (auth.kind === 'user' && fighterUserId === auth.userId);
}

export function registerSyncPushRoutes(app: FastifyInstance, dependencies: SyncPushRouteDependencies) {
  const {
    requireHouseholdPrincipal, requireHouseholdMember, requireHouseholdRole, assertHouseholdRow,
    assertNullableHouseholdRow, entityId, serverCycleKey, serverBossAvailable, serverBossElite,
  } = dependencies;
  app.post('/api/sync/push', { schema: syncPushSchema }, async (request) => {
    const body = requireObject(request.body);
    const householdId = requireString(body.householdId, 'householdId');
    const auth = await requireHouseholdPrincipal(request, householdId);

    const mutations = requireObjectArray(body.mutations, 'mutations');
    const results: JsonObject[] = [];

    for (const mutation of mutations) {
      const item = requireObject(mutation);
      const mutationId = optionalString(requireObject(item.payload).id);
      try {
        const accepted = await sql.begin(async (tx) => {
          const accepted: JsonObject[] = [];
          const type = requireString(item.type, 'type');
          const payload = requireObject(item.payload);

        if (type === 'configuration_replace') {
          if (!auth.userId) throw new Error('Forbidden');
          await requireHouseholdRole(auth.userId, householdId, ['owner', 'parent']);
          const revision = expectedRevision(payload.expectedRevision);
          const [lockedHousehold] = await tx`
            select configuration_revision from households
            where id = ${householdId} and deleted_at is null
            for update
          `;
          if (!lockedHousehold || Number(lockedHousehold.configuration_revision) !== revision) {
            throw new Error('Configuration revision conflict');
          }
          const fighters = requireObjects(payload.fighters, 'fighters');
          const bosses = requireObjects(payload.bosses, 'bosses');
          const chores = requireObjects(payload.chores, 'chores');
          const rewards = requireObjects(payload.rewards, 'rewards');
          const ids = {
            fighters: {} as Record<string, string>,
            bosses: {} as Record<string, string>,
            chores: {} as Record<string, string>,
            rewards: {} as Record<string, string>
          };
          const bossesNeedingReset = new Set<string>();

          for (const [sort, fighterBody] of fighters.entries()) {
            const clientId = requireString(fighterBody.clientId, 'fighter.clientId');
            const stableId = entityId(householdId, 'fighter', clientId);
            const [existing] = await tx`
              select id from fighters
              where household_id = ${householdId} and id = ${stableId}
              for update
            `;
            const [fighter] = existing
              ? await tx`
                  update fighters set
                    name = ${requireString(fighterBody.name, 'fighter.name')},
                    color = ${requireString(fighterBody.color, 'fighter.color')},
                    sort = ${optionalNumber(fighterBody.sort, sort)},
                    deleted_at = null, version = version + 1
                  where id = ${existing.id}
                  returning id
                `
              : await tx`
                  insert into fighters (id, household_id, name, color, sort, created_by_user_id)
                  values (
                    ${stableId}, ${householdId}, ${requireString(fighterBody.name, 'fighter.name')},
                    ${requireString(fighterBody.color, 'fighter.color')},
                    ${optionalNumber(fighterBody.sort, sort)}, ${auth.userId}
                  ) returning id
                `;
            const fighterId = publicId(fighter);
            ids.fighters[clientId] = fighterId;
            if (fighterBody.avatar !== undefined && fighterBody.avatar !== null) {
              const { mime, bytes, hash } = validatedAvatar(fighterBody.avatar);
              await tx`
                insert into fighter_avatars (fighter_id, mime, bytes, hash)
                values (${fighterId}, ${mime}, ${bytes}, ${hash})
                on conflict (fighter_id) do update
                set mime = excluded.mime, bytes = excluded.bytes, hash = excluded.hash
              `;
              await tx`update fighters set avatar_hash = ${hash} where id = ${fighterId}`;
            } else {
              await tx`delete from fighter_avatars where fighter_id = ${fighterId}`;
              await tx`update fighters set avatar_hash = null where id = ${fighterId}`;
            }
          }

          for (const [sort, bossBody] of bosses.entries()) {
            const clientId = requireString(bossBody.clientId, 'boss.clientId');
            const stableId = entityId(householdId, 'boss', clientId);
            const trigger = requireObject(bossBody.trigger);
            const [existing] = await tx`
              select id from bosses
              where household_id = ${householdId} and id = ${stableId}
              for update
            `;
            const values = {
              name: requireString(bossBody.name, 'boss.name'),
              sprite: requireString(bossBody.sprite, 'boss.sprite'),
              frames: optionalNumber(bossBody.frames),
              rare: optionalBoolean(bossBody.rare),
              hue: optionalNumberOrNull(bossBody.hue),
              triggerType: requireString(trigger.type, 'trigger.type'),
              triggerDay: optionalNumberOrNull(trigger.day),
              triggerDate: optionalNumberOrNull(trigger.date),
              triggerNote: optionalString(trigger.note),
              dormant: optionalBoolean(bossBody.dormant),
              unlockAt: optionalNumber(bossBody.unlockAt),
              sort: optionalNumber(bossBody.sort, sort)
            };
            const [boss] = existing
              ? await tx`
                  update bosses set
                    name = ${values.name}, sprite = ${values.sprite}, frames = ${values.frames},
                    rare = ${values.rare}, hue = ${values.hue}, trigger_type = ${values.triggerType},
                    trigger_day = ${values.triggerDay}, trigger_date = ${values.triggerDate},
                    trigger_note = ${values.triggerNote}, dormant = ${values.dormant},
                    unlock_at = ${values.unlockAt}, sort = ${values.sort}, deleted_at = null,
                    version = version + 1
                  where id = ${existing.id}
                  returning id
                `
              : await tx`
                  insert into bosses (
                    id, household_id, name, sprite, frames, rare, hue,
                    trigger_type, trigger_day, trigger_date, trigger_note, dormant, unlock_at, sort
                  ) values (
                    ${stableId}, ${householdId}, ${values.name}, ${values.sprite}, ${values.frames},
                    ${values.rare}, ${values.hue}, ${values.triggerType}, ${values.triggerDay},
                    ${values.triggerDate}, ${values.triggerNote}, ${values.dormant}, ${values.unlockAt}, ${values.sort}
                  ) returning id
                `;
            ids.bosses[clientId] = publicId(boss);
          }

          for (const [sort, choreBody] of chores.entries()) {
            const clientId = requireString(choreBody.clientId, 'chore.clientId');
            const stableId = entityId(householdId, 'chore', clientId);
            const submittedBossId = requireString(choreBody.bossClientId, 'chore.bossClientId');
            const bossId = ids.bosses[submittedBossId] ?? submittedBossId;
            if (!Object.values(ids.bosses).includes(bossId)) throw new Error('chore.bossClientId does not reference a submitted boss');
            const [existing] = await tx`
              select id, boss_id, title, damage, repeatable, deleted_at from chores
              where household_id = ${householdId} and id = ${stableId}
              for update
            `;
            if (!existing
              || existing.boss_id !== bossId
              || String(existing.title) !== stringValue(choreBody.title, 'chore.title')
              || Number(existing.damage) !== optionalNumber(choreBody.damage)
              || Boolean(existing.repeatable) !== optionalBoolean(choreBody.repeatable)
              || existing.deleted_at) {
              bossesNeedingReset.add(bossId);
              if (existing?.boss_id) bossesNeedingReset.add(String(existing.boss_id));
            }
            const [chore] = existing
              ? await tx`
                  update chores set boss_id = ${bossId}, title = ${stringValue(choreBody.title, 'chore.title')},
                    damage = ${optionalNumber(choreBody.damage)}, repeatable = ${optionalBoolean(choreBody.repeatable)},
                    sort = ${optionalNumber(choreBody.sort, sort)}, deleted_at = null, version = version + 1
                  where id = ${existing.id}
                  returning id
                `
              : await tx`
                  insert into chores (id, household_id, boss_id, title, damage, repeatable, sort)
                  values (
                    ${stableId}, ${householdId}, ${bossId}, ${stringValue(choreBody.title, 'chore.title')},
                    ${optionalNumber(choreBody.damage)}, ${optionalBoolean(choreBody.repeatable)},
                    ${optionalNumber(choreBody.sort, sort)}
                  ) returning id
                `;
            ids.chores[clientId] = publicId(chore);
          }

          for (const [sort, rewardBody] of rewards.entries()) {
            const clientId = requireString(rewardBody.clientId, 'reward.clientId');
            const stableId = entityId(householdId, 'reward', clientId);
            const [existing] = await tx`
              select id from rewards
              where household_id = ${householdId} and id = ${stableId}
              for update
            `;
            const [reward] = existing
              ? await tx`
                  update rewards set scope = ${requireString(rewardBody.scope, 'reward.scope')},
                    icon = ${stringValue(rewardBody.icon, 'reward.icon')},
                    title = ${requireString(rewardBody.title, 'reward.title')},
                    descr = ${stringValue(rewardBody.description, 'reward.description')},
                    cost = ${optionalNumber(rewardBody.cost)}, sort = ${optionalNumber(rewardBody.sort, sort)},
                    deleted_at = null, version = version + 1
                  where id = ${existing.id}
                  returning id
                `
              : await tx`
                  insert into rewards (id, household_id, scope, icon, title, descr, cost, sort)
                  values (
                    ${stableId}, ${householdId}, ${requireString(rewardBody.scope, 'reward.scope')},
                    ${stringValue(rewardBody.icon, 'reward.icon')}, ${requireString(rewardBody.title, 'reward.title')},
                    ${stringValue(rewardBody.description, 'reward.description')}, ${optionalNumber(rewardBody.cost)},
                    ${optionalNumber(rewardBody.sort, sort)}
                  ) returning id
                `;
            ids.rewards[clientId] = publicId(reward);
          }

          const activeFighters = Object.values(ids.fighters);
          const activeBosses = Object.values(ids.bosses);
          const activeChores = Object.values(ids.chores);
          const activeRewards = Object.values(ids.rewards);
          const fighterIds = tx.array(activeFighters, 2950);
          const bossIds = tx.array(activeBosses, 2950);
          const choreIds = tx.array(activeChores, 2950);
          const rewardIds = tx.array(activeRewards, 2950);
          const removedChores = await tx`
            select boss_id from chores
            where household_id = ${householdId} and deleted_at is null and not (id = any(${choreIds}))
          `;
          removedChores.forEach((row) => bossesNeedingReset.add(String(row.boss_id)));
          const omittedClaimedFighters = await tx`
            select id from fighters
            where household_id = ${householdId} and deleted_at is null and user_id is not null
              and not (id = any(${fighterIds}))
          `;
          if (omittedClaimedFighters.length > 0) throw new Error('Claimed fighters require explicit account governance');
          await tx`update chores set deleted_at = now(), version = version + 1 where household_id = ${householdId} and deleted_at is null and not (id = any(${choreIds}))`;
          await tx`update bosses set deleted_at = now(), version = version + 1 where household_id = ${householdId} and deleted_at is null and not (id = any(${bossIds}))`;
          await tx`update fighters set deleted_at = now(), version = version + 1 where household_id = ${householdId} and deleted_at is null and not (id = any(${fighterIds}))`;
          await tx`update rewards set deleted_at = now(), version = version + 1 where household_id = ${householdId} and deleted_at is null and not (id = any(${rewardIds}))`;
          const [household] = await tx`select timezone from households where id = ${householdId}`;
          const timezone = requireString(household.timezone, 'timezone');
          for (const bossId of bossesNeedingReset) {
            const [boss] = await tx`
              select id, trigger_type, trigger_day, trigger_date from bosses
              where id = ${bossId} and household_id = ${householdId} and deleted_at is null
            `;
            if (!boss) continue;
            const cycleKey = serverCycleKey(boss, timezone);
            const [latest] = await tx`
              select coalesce(max(reset_seq), 0)::integer as reset_seq from boss_resets
              where household_id = ${householdId} and boss_id = ${bossId} and cycle_key = ${cycleKey}
            `;
            await tx`
              insert into boss_resets (household_id, boss_id, cycle_key, reset_seq, reason, created_by_user_id)
              values (${householdId}, ${bossId}, ${cycleKey}, ${Number(latest.reset_seq) + 1}, 'chores_edited', ${auth.userId})
              on conflict do nothing
            `;
          }
          const [updatedHousehold] = await tx`
            update households
            set configuration_revision = configuration_revision + 1, version = version + 1
            where id = ${householdId}
            returning configuration_revision
          `;
          accepted.push({ type, id: optionalString(payload.id), ids, configurationRevision: Number(updatedHousehold.configuration_revision) });
        } else if (type === 'chore_completion') {
          const bossId = requireString(payload.bossId, 'bossId');
          const choreId = requireString(payload.choreId, 'choreId');
          const fighterId = requireString(payload.fighterId, 'fighterId');
          const eventId = requireString(payload.id, 'id');
          const performedByDeviceId = auth.deviceId ?? null;
          const [duplicate] = await tx`
            select id, server_seq from chore_completions
            where id = ${eventId} and household_id = ${householdId}
          `;
          if (duplicate) {
            accepted.push({ type, id: duplicate.id, serverSeq: duplicate.server_seq, duplicate: true });
            return accepted;
          }
          const [boss] = await tx`
            select id, rare, dormant, unlock_at, trigger_type, trigger_day, trigger_date from bosses
            where id = ${bossId} and household_id = ${householdId} and deleted_at is null
            for update
          `;
          if (!boss) throw new Error('bosses row does not belong to household');
          const [household] = await tx`select timezone from households where id = ${householdId} and deleted_at is null`;
          const timezone = requireString(household?.timezone, 'timezone');
          if (boss.dormant) {
            const [progress] = await tx`
              select h.victories_baseline + count(v.id)::integer as victories
              from households h left join boss_victories v on v.household_id = h.id
              where h.id = ${householdId}
              group by h.victories_baseline
            `;
            if (Number(boss.unlock_at) <= 0 || Number(progress?.victories) < Number(boss.unlock_at)) {
              throw new Error('Boss is not currently available');
            }
          }
          const [chore] = await tx`
            select boss_id, title, damage, repeatable from chores
            where id = ${choreId} and household_id = ${householdId} and deleted_at is null
          `;
          if (!chore || chore.boss_id !== bossId) throw new Error('Chore does not belong to boss');
          const [fighter] = await tx`
            select id, user_id from fighters
            where id = ${fighterId} and household_id = ${householdId} and deleted_at is null
          `;
          if (!fighter) throw new Error('fighters row does not belong to household');

          if (!mayPrincipalActAsFighter(auth, fighter)) throw new Error('Fighter belongs to another account');
          const actedOnBehalf = Boolean(auth.userId && fighter.user_id !== auth.userId);

          const cycleKey = requireString(payload.cycleKey, 'cycleKey');
          if (cycleKey !== serverCycleKey(boss, timezone)) throw new Error('Cycle key is no longer current');
          if (!serverBossAvailable(boss, householdId, timezone)) throw new Error('Boss is not currently available');
          const resetSeq = optionalNumber(payload.resetSeq);
          if (!chore.repeatable) {
            const [alreadyCompleted] = await tx`
              select id from chore_completions
              where household_id = ${householdId} and chore_id = ${choreId}
                and cycle_key = ${cycleKey} and reset_seq = ${resetSeq} and voided_at is null
              limit 1
            `;
            if (alreadyCompleted) throw new Error('Chore is already completed for this cycle');
          }

          const [row] = await tx`
            insert into chore_completions (
              id, household_id, boss_id, chore_id, fighter_id, cycle_key, reset_seq,
              chore_title, damage, performed_by_user_id, performed_by_device_id,
              acted_on_behalf, completed_at
            )
            values (
              ${eventId}::uuid,
              ${householdId}, ${bossId},
              ${choreId}, ${fighterId},
              ${cycleKey}, ${resetSeq},
              ${chore.title}, ${Number(chore.damage)},
              ${auth.userId}, ${performedByDeviceId}::uuid,
              ${actedOnBehalf}, ${requireString(payload.completedAt, 'completedAt')}::timestamptz
            )
            on conflict (id) do nothing
            returning id, server_seq
          `;
          if (row) {
            await tx`
              update fighters
              set career_xp_cached = career_xp_cached + ${Number(chore.damage)}, version = version + 1
              where id = ${fighterId}
            `;
            const [health] = await tx`
              select
                (select coalesce(sum(damage), 0) from chores
                  where household_id = ${householdId} and boss_id = ${bossId} and deleted_at is null)::integer as max_hp,
                (select coalesce(sum(damage), 0) from chore_completions
                  where household_id = ${householdId} and boss_id = ${bossId}
                    and cycle_key = ${cycleKey} and reset_seq = ${resetSeq} and voided_at is null)::integer as damage
            `;
            let victoryCreated = false;
            if (Number(health.damage) >= Number(health.max_hp) && Number(health.max_hp) > 0) {
              const elite = serverBossElite(boss, householdId, timezone);
              const [victory] = await tx`
                insert into boss_victories (household_id, boss_id, cycle_key, reset_seq, elite, rare, won_at)
                values (${householdId}, ${bossId}, ${cycleKey}, ${resetSeq}, ${elite}, ${Boolean(boss.rare)}, now())
                on conflict (household_id, boss_id, cycle_key, reset_seq) do nothing
                returning id
              `;
              if (victory) {
                victoryCreated = true;
                const contributions = await tx`
                  select fighter_id, round((sum(damage) / 4.0) * ${elite ? 1.5 : 1})::integer as amount
                  from chore_completions
                  where household_id = ${householdId} and boss_id = ${bossId}
                    and cycle_key = ${cycleKey} and reset_seq = ${resetSeq} and voided_at is null
                  group by fighter_id
                `;
                for (const contribution of contributions) {
                  const amount = Number(contribution.amount);
                  if (amount <= 0) continue;
                  await tx`
                    insert into wallet_transactions (
                      household_id, fighter_id, amount, kind, reference_type, reference_id, created_by_user_id
                    ) values (
                      ${householdId}, ${contribution.fighter_id}, ${amount}, 'boss_reward',
                      'boss_victory', ${victory.id}, ${auth.userId}
                    ) on conflict do nothing
                  `;
                }
              }
            }
            accepted.push({ type, id: row.id, serverSeq: row.server_seq, victoryCreated });
          }
        } else if (type === 'boss_reset') {
          const bossId = requireString(payload.bossId, 'bossId');
          const fighterId = requireString(payload.fighterId, 'fighterId');
          const [actingFighter] = await tx`
            select user_id from fighters
            where id = ${fighterId} and household_id = ${householdId} and deleted_at is null
          `;
          if (!actingFighter) throw new Error('fighters row does not belong to household');
          if (!mayPrincipalActAsFighter(auth, actingFighter)) throw new Error('Fighter belongs to another account');
          const cycleKey = requireString(payload.cycleKey, 'cycleKey');
          const resetSeq = optionalNumber(payload.resetSeq);
          const [duplicate] = await tx`
            select id, server_seq from boss_resets
            where household_id = ${householdId} and boss_id = ${bossId}
              and cycle_key = ${cycleKey} and reset_seq = ${resetSeq}
          `;
          if (duplicate) {
            accepted.push({ type, id: duplicate.id, serverSeq: duplicate.server_seq, duplicate: true });
            return accepted;
          }
          const [boss] = await tx`
            select id, trigger_type, trigger_day, trigger_date from bosses
            where id = ${bossId} and household_id = ${householdId} and deleted_at is null
            for update
          `;
          if (!boss) throw new Error('bosses row does not belong to household');
          const [household] = await tx`select timezone from households where id = ${householdId}`;
          if (cycleKey !== serverCycleKey(boss, requireString(household.timezone, 'timezone'))) {
            throw new Error('Cycle key is no longer current');
          }
          const [latest] = await tx`
            select coalesce(max(reset_seq), 0)::integer as reset_seq from boss_resets
            where household_id = ${householdId} and boss_id = ${bossId} and cycle_key = ${cycleKey}
          `;
          if (resetSeq !== Number(latest.reset_seq) + 1) throw new Error('Reset sequence conflict');
          const [row] = await tx`
            insert into boss_resets (
              id, household_id, boss_id, cycle_key, reset_seq, reason, created_by_user_id
            )
            values (
              coalesce(${optionalString(payload.id)}::uuid, gen_random_uuid()),
              ${householdId}, ${bossId},
              ${cycleKey}, ${resetSeq},
              ${requireString(payload.reason, 'reason')}, ${auth.userId}
            )
            on conflict (household_id, boss_id, cycle_key, reset_seq) do nothing
            returning id, server_seq
          `;
          if (row) accepted.push({ type, id: row.id, serverSeq: row.server_seq });
        } else if (type === 'wallet_transfer') {
          const eventId = requireString(payload.id, 'id');
          const transferGroup = requireString(payload.transferGroup, 'transferGroup');
          const [duplicate] = await tx`
            select id, server_seq from wallet_transactions
            where household_id = ${householdId} and transfer_group = ${transferGroup}
            order by server_seq limit 1
          `;
          if (duplicate) {
            accepted.push({ type, id: duplicate.id, serverSeq: duplicate.server_seq, duplicate: true });
            return accepted;
          }
          const fighterId = requireString(payload.fighterId, 'fighterId');
          const amount = optionalNumber(payload.amount);
          if (amount <= 0) throw new Error('Transfer amount must be positive');
          const [fighter] = await tx`
            select user_id from fighters
            where id = ${fighterId} and household_id = ${householdId} and deleted_at is null
            for update
          `;
          if (!fighter) throw new Error('fighters row does not belong to household');
          if (!mayPrincipalActAsFighter(auth, fighter)) throw new Error('Fighter belongs to another account');
          const [balance] = await tx`
            select coalesce(sum(amount), 0)::integer as amount from wallet_transactions
            where household_id = ${householdId} and fighter_id = ${fighterId}
          `;
          if (Number(balance.amount) < amount) throw new Error('Insufficient wallet balance');
          const [row] = await tx`
            insert into wallet_transactions (
              id, household_id, fighter_id, amount, kind, transfer_group,
              reference_type, reference_id, note, created_by_user_id
            )
            values (
              ${eventId}::uuid,
              ${householdId}, ${fighterId}, ${-amount}, 'transfer',
              ${transferGroup}, 'transfer', ${transferGroup}, 'Transfer to shared pool', ${auth.userId}
            )
            on conflict (id) do nothing
            returning id, server_seq
          `;
          if (row) {
            await tx`
              insert into wallet_transactions (
                household_id, fighter_id, amount, kind, transfer_group,
                reference_type, reference_id, note, created_by_user_id
              ) values (
                ${householdId}, null, ${amount}, 'transfer', ${transferGroup},
                'transfer', ${transferGroup}, 'Transfer from fighter', ${auth.userId}
              ) on conflict do nothing
            `;
            accepted.push({ type, id: row.id, serverSeq: row.server_seq });
          }
        } else if (type === 'reward_redemption_update') {
          if (!auth.userId) throw new Error('Forbidden');
          const manager = await requireHouseholdMember(auth.userId, householdId);
          assertRedemptionManagerRole(manager.role);
          const redemptionId = requireString(payload.redemptionId, 'redemptionId');
          const status = requestedRedemptionStatus(payload.status);
          const [currentRedemption] = await tx`
            select id, server_seq, status, fighter_id, cost from reward_redemptions
            where id = ${redemptionId} and household_id = ${householdId}
            for update
          `;
          if (!currentRedemption) throw new Error('Not found');
          if (redemptionTransition(currentRedemption.status, status) === 'duplicate') {
            accepted.push({ type, id: currentRedemption.id, serverSeq: currentRedemption.server_seq, duplicate: true });
            return accepted;
          }
          const [redemption] = await tx`
            update reward_redemptions
            set status = ${status}, used_at = case when ${status} = 'used' then now() else used_at end,
                version = version + 1
            where id = ${redemptionId} and household_id = ${householdId}
              and status = 'active'
            returning id, server_seq
          `;
          if (!redemption) throw new Error('Not found');
          if (status === 'cancelled') {
            await tx`
              insert into wallet_transactions (
                household_id, fighter_id, amount, kind, reference_type, reference_id, created_by_user_id
              ) values (
                ${householdId}, ${currentRedemption.fighter_id}::uuid, ${Number(currentRedemption.cost)},
                'refund', 'reward_refund', ${redemptionId}, ${auth.userId}
              ) on conflict do nothing
            `;
          }
          accepted.push({ type, id: redemption.id, serverSeq: redemption.server_seq });
        } else if (type === 'reward_redemption') {
          const eventId = requireString(payload.id, 'id');
          const [duplicate] = await tx`
            select id, server_seq from reward_redemptions
            where id = ${eventId} and household_id = ${householdId}
          `;
          if (duplicate) {
            accepted.push({ type, id: duplicate.id, serverSeq: duplicate.server_seq, duplicate: true });
            return accepted;
          }
          const submittedRewardId = optionalString(payload.rewardId);
          const fighterId = optionalString(payload.fighterId);
          await assertNullableHouseholdRow('fighters', fighterId, householdId);
          const [reward] = submittedRewardId ? await tx`
            select id, scope, icon, title, cost from rewards
            where household_id = ${householdId} and deleted_at is null
              and id = ${entityId(householdId, 'reward', submittedRewardId)}
            limit 1
          ` : [null];
          if (!reward) throw new Error('rewards row does not belong to household');
          const scope = requireString(reward.scope, 'reward.scope');
          if ((scope === 'personal') !== Boolean(fighterId)) {
            throw new Error('Reward scope does not match fighter');
          }
          if (fighterId) {
            const [fighter] = await tx`
              select user_id from fighters
              where id = ${fighterId} and household_id = ${householdId} and deleted_at is null
              for update
            `;
            if (!mayPrincipalActAsFighter(auth, fighter)) throw new Error('Fighter belongs to another account');
          } else {
            if (auth.userId) {
              const [membership] = await tx`
                select role from household_members
                where household_id = ${householdId} and user_id = ${auth.userId} and status = 'active'
              `;
              if (!membership || (membership.role !== 'owner' && membership.role !== 'parent')) throw new Error('Forbidden');
            }
            await tx`select id from households where id = ${householdId} for update`;
          }
          const [balance] = await tx`
            select coalesce(sum(amount), 0)::integer as amount
            from wallet_transactions
            where household_id = ${householdId}
              and fighter_id is not distinct from ${fighterId}::uuid
          `;
          assertRedemptionFunds(balance.amount, reward.cost);
          const initial = initialRedemption();
          const [row] = await tx`
            insert into reward_redemptions (
              id, household_id, reward_id, scope, fighter_id, icon, title, cost,
              status, requested_by_user_id, approved_by_user_id
            )
            values (
              ${eventId}::uuid,
              ${householdId}, ${reward.id}::uuid,
              ${scope}, ${fighterId}::uuid,
              ${reward.icon}, ${reward.title},
              ${Number(reward.cost)}, ${initial.status},
              ${auth.userId}, ${initial.approvedByUserId}::uuid
            )
            on conflict (id) do nothing
            returning id, server_seq
          `;
          if (row) {
            const cost = Number(reward.cost);
            await tx`
              insert into wallet_transactions (
                household_id, fighter_id, amount, kind, reference_type, reference_id, created_by_user_id
              )
              values (${householdId}, ${fighterId}::uuid, ${-cost}, 'redemption', 'reward_redemption', ${row.id}, ${auth.userId})
              on conflict do nothing
            `;
            accepted.push({ type, id: row.id, serverSeq: row.server_seq });
          }
        } else {
          throw new Error(`Unsupported mutation type: ${type}`);
        }
          return accepted;
        });
        for (const result of accepted) {
          results.push({
            ...result,
            resourceId: result.id,
            id: mutationId ?? result.id,
            outcome: result.duplicate ? 'duplicate' : 'accepted'
          });
        }
      } catch (error) {
        results.push({ type: optionalString(item.type), id: mutationId, ...mutationError(error) });
      }
    }

    return {
      results,
      accepted: results.filter((result) => result.outcome === 'accepted' || result.outcome === 'duplicate')
    };
  });
}
