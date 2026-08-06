import { createHash } from 'node:crypto';
import { requiredString } from './requestValidation.js';

type JsonObject = Record<string, unknown>;
const requireString = requiredString;

function householdDate(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return {
    iso: `${part('year')}-${part('month')}-${part('day')}`,
    year: Number(part('year')),
    month: Number(part('month')),
    day: Number(part('day')),
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(part('weekday')),
  };
}

export function serverCycleKey(boss: JsonObject, timezone: string, now = new Date()) {
  const date = householdDate(timezone, now);
  const type = requireString(boss.trigger_type, 'trigger_type');
  if (type === 'daglig' || type === 'sjelden') return `d${date.iso}`;
  if (type === 'ukentlig') {
    const start = new Date(Date.UTC(date.year, 0, 1));
    const current = new Date(Date.UTC(date.year, date.month - 1, date.day));
    const week = Math.floor(((current.getTime() - start.getTime()) / 86400000 + start.getUTCDay()) / 7);
    return `w${date.year}-${week}`;
  }
  if (type === 'månedlig') return `m${date.year}-${date.month}`;
  return 'alltid';
}

export function serverBossAvailable(boss: JsonObject, householdId: string, timezone: string, now = new Date()) {
  const date = householdDate(timezone, now);
  const type = requireString(boss.trigger_type, 'trigger_type');
  if (type === 'sjelden') {
    const digest = createHash('sha256').update(`${householdId}|${boss.id}|${date.iso}|rare`).digest();
    return digest.readUInt32BE(0) % 100 < 3;
  }
  if (type === 'ukentlig') return ((date.weekday + 6) % 7) >= ((Number(boss.trigger_day ?? 0) + 6) % 7);
  if (type === 'månedlig') return date.day >= Number(boss.trigger_date ?? 1);
  return true;
}

export function serverBossElite(boss: JsonObject, householdId: string, timezone: string, now = new Date()) {
  if (Boolean(boss.rare)) return false;
  const cycle = requireString(boss.trigger_type, 'trigger_type') === 'alltid'
    ? `d${householdDate(timezone, now).iso}`
    : serverCycleKey(boss, timezone, now);
  const digest = createHash('sha256').update(`${householdId}|${boss.id}|${cycle}|elite`).digest();
  return digest.readUInt32BE(0) % 100 < 22;
}

export function decorateBosses(rows: JsonObject[], householdId: string, timezone: string) {
  return rows.map((boss) => ({
    ...boss,
    current_cycle_key: serverCycleKey(boss, timezone),
    available: serverBossAvailable(boss, householdId, timezone),
    elite: serverBossElite(boss, householdId, timezone),
  }));
}
