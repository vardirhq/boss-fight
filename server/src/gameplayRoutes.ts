import type { FastifyInstance, FastifyRequest } from 'fastify';
import { sql } from './db.js';
import {
  optionalBoolean, optionalBooleanOrNull, optionalNumber, optionalNumberOrNull,
  optionalString, requiredString,
} from './requestValidation.js';
import {
  bossCreateSchema, bossParamsSchema, bossPatchSchema, choreCreateSchema,
  choreParamsSchema, chorePatchSchema, rewardCreateSchema, rewardParamsSchema,
  rewardPatchSchema,
} from './routeSchemas.js';

type JsonObject = Record<string, unknown>;
type AuthContext = { userId: string; sessionId: string };
type HouseholdRole = 'owner' | 'parent' | 'member' | 'child';

export interface GameplayRouteDependencies {
  requireAuth(request: FastifyRequest): Promise<AuthContext>;
  requireHouseholdRole(userId: string, householdId: string, roles: HouseholdRole[]): Promise<unknown>;
  assertHouseholdRow(table: 'bosses', id: string, householdId: string): Promise<void>;
}

function bodyObject(body: unknown): JsonObject {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Expected JSON object');
  return body as JsonObject;
}

export function registerGameplayRoutes(app: FastifyInstance, dependencies: GameplayRouteDependencies) {
  const { requireAuth, requireHouseholdRole, assertHouseholdRow } = dependencies;
  const requireString = requiredString;

  app.post('/api/households/:householdId/bosses', { schema: bossCreateSchema }, async (request) => {
    const auth = await requireAuth(request);
    const householdId = (request.params as { householdId: string }).householdId;
    await requireHouseholdRole(auth.userId, householdId, ['owner', 'parent']);
    const body = bodyObject(request.body);
    const [boss] = await sql`
      insert into bosses (household_id, name, sprite, frames, rare, hue, trigger_type, trigger_day, trigger_date, trigger_note, dormant, unlock_at, sort)
      values (${householdId}, ${requireString(body.name, 'name')}, ${requireString(body.sprite, 'sprite')},
        ${optionalNumber(body.frames)}, ${optionalBoolean(body.rare)}, ${optionalNumberOrNull(body.hue)},
        ${optionalString(body.triggerType) ?? 'alltid'}, ${optionalNumberOrNull(body.triggerDay)},
        ${optionalNumberOrNull(body.triggerDate)}, ${optionalString(body.triggerNote)},
        ${optionalBoolean(body.dormant)}, ${optionalNumber(body.unlockAt)}, ${optionalNumber(body.sort)}) returning *
    `;
    return { boss };
  });

  app.patch('/api/households/:householdId/bosses/:bossId', { schema: bossPatchSchema }, async (request) => {
    const auth = await requireAuth(request);
    const { householdId, bossId } = request.params as { householdId: string; bossId: string };
    await requireHouseholdRole(auth.userId, householdId, ['owner', 'parent']);
    const body = bodyObject(request.body);
    const [boss] = await sql`
      update bosses set name = coalesce(${optionalString(body.name)}, name), sprite = coalesce(${optionalString(body.sprite)}, sprite),
        frames = coalesce(${optionalNumberOrNull(body.frames)}, frames), rare = coalesce(${optionalBooleanOrNull(body.rare)}, rare),
        hue = coalesce(${optionalNumberOrNull(body.hue)}, hue), trigger_type = coalesce(${optionalString(body.triggerType)}, trigger_type),
        trigger_day = coalesce(${optionalNumberOrNull(body.triggerDay)}, trigger_day), trigger_date = coalesce(${optionalNumberOrNull(body.triggerDate)}, trigger_date),
        trigger_note = coalesce(${optionalString(body.triggerNote)}, trigger_note), dormant = coalesce(${optionalBooleanOrNull(body.dormant)}, dormant),
        unlock_at = coalesce(${optionalNumberOrNull(body.unlockAt)}, unlock_at), sort = coalesce(${optionalNumberOrNull(body.sort)}, sort), version = version + 1
      where id = ${bossId} and household_id = ${householdId} and deleted_at is null returning *
    `;
    if (!boss) throw new Error('Not found');
    return { boss };
  });

  app.delete('/api/households/:householdId/bosses/:bossId', { schema: bossParamsSchema }, async (request) => {
    const auth = await requireAuth(request);
    const { householdId, bossId } = request.params as { householdId: string; bossId: string };
    await requireHouseholdRole(auth.userId, householdId, ['owner', 'parent']);
    const [boss] = await sql`update bosses set deleted_at = now(), version = version + 1 where id = ${bossId} and household_id = ${householdId} and deleted_at is null returning id`;
    if (!boss) throw new Error('Not found');
    return { ok: true };
  });

  app.post('/api/households/:householdId/chores', { schema: choreCreateSchema }, async (request) => {
    const auth = await requireAuth(request);
    const householdId = (request.params as { householdId: string }).householdId;
    await requireHouseholdRole(auth.userId, householdId, ['owner', 'parent']);
    const body = bodyObject(request.body);
    const bossId = requireString(body.bossId, 'bossId');
    await assertHouseholdRow('bosses', bossId, householdId);
    const [chore] = await sql`
      insert into chores (household_id, boss_id, title, damage, repeatable, sort)
      values (${householdId}, ${bossId}, ${requireString(body.title, 'title')}, ${optionalNumber(body.damage)}, ${optionalBoolean(body.repeatable)}, ${optionalNumber(body.sort)}) returning *
    `;
    return { chore };
  });

  app.patch('/api/households/:householdId/chores/:choreId', { schema: chorePatchSchema }, async (request) => {
    const auth = await requireAuth(request);
    const { householdId, choreId } = request.params as { householdId: string; choreId: string };
    await requireHouseholdRole(auth.userId, householdId, ['owner', 'parent']);
    const body = bodyObject(request.body);
    if (body.bossId) await assertHouseholdRow('bosses', requireString(body.bossId, 'bossId'), householdId);
    const [chore] = await sql`
      update chores set boss_id = coalesce(${optionalString(body.bossId)}::uuid, boss_id), title = coalesce(${optionalString(body.title)}, title),
        damage = coalesce(${optionalNumberOrNull(body.damage)}, damage), repeatable = coalesce(${optionalBooleanOrNull(body.repeatable)}, repeatable),
        sort = coalesce(${optionalNumberOrNull(body.sort)}, sort), version = version + 1
      where id = ${choreId} and household_id = ${householdId} and deleted_at is null returning *
    `;
    if (!chore) throw new Error('Not found');
    return { chore };
  });

  app.delete('/api/households/:householdId/chores/:choreId', { schema: choreParamsSchema }, async (request) => {
    const auth = await requireAuth(request);
    const { householdId, choreId } = request.params as { householdId: string; choreId: string };
    await requireHouseholdRole(auth.userId, householdId, ['owner', 'parent']);
    const [chore] = await sql`update chores set deleted_at = now(), version = version + 1 where id = ${choreId} and household_id = ${householdId} and deleted_at is null returning id`;
    if (!chore) throw new Error('Not found');
    return { ok: true };
  });

  app.post('/api/households/:householdId/rewards', { schema: rewardCreateSchema }, async (request) => {
    const auth = await requireAuth(request);
    const householdId = (request.params as { householdId: string }).householdId;
    await requireHouseholdRole(auth.userId, householdId, ['owner', 'parent']);
    const body = bodyObject(request.body);
    const [reward] = await sql`
      insert into rewards (household_id, scope, icon, title, descr, cost, sort)
      values (${householdId}, ${requireString(body.scope, 'scope')}, ${optionalString(body.icon) ?? ''}, ${requireString(body.title, 'title')},
        ${optionalString(body.descr) ?? ''}, ${optionalNumber(body.cost)}, ${optionalNumber(body.sort)}) returning *
    `;
    return { reward };
  });

  app.patch('/api/households/:householdId/rewards/:rewardId', { schema: rewardPatchSchema }, async (request) => {
    const auth = await requireAuth(request);
    const { householdId, rewardId } = request.params as { householdId: string; rewardId: string };
    await requireHouseholdRole(auth.userId, householdId, ['owner', 'parent']);
    const body = bodyObject(request.body);
    const [reward] = await sql`
      update rewards set scope = coalesce(${optionalString(body.scope)}, scope), icon = coalesce(${optionalString(body.icon)}, icon),
        title = coalesce(${optionalString(body.title)}, title), descr = coalesce(${optionalString(body.descr)}, descr),
        cost = coalesce(${optionalNumberOrNull(body.cost)}, cost), sort = coalesce(${optionalNumberOrNull(body.sort)}, sort), version = version + 1
      where id = ${rewardId} and household_id = ${householdId} and deleted_at is null returning *
    `;
    if (!reward) throw new Error('Not found');
    return { reward };
  });

  app.delete('/api/households/:householdId/rewards/:rewardId', { schema: rewardParamsSchema }, async (request) => {
    const auth = await requireAuth(request);
    const { householdId, rewardId } = request.params as { householdId: string; rewardId: string };
    await requireHouseholdRole(auth.userId, householdId, ['owner', 'parent']);
    const [reward] = await sql`update rewards set deleted_at = now(), version = version + 1 where id = ${rewardId} and household_id = ${householdId} and deleted_at is null returning id`;
    if (!reward) throw new Error('Not found');
    return { ok: true };
  });
}
