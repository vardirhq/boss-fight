import type { Boss, Chore, Lang } from './types';
import { DAY_LONG, DAY_SHORT, STRINGS } from './i18n';

export type BossStatus = 'aktiv' | 'beseiret' | 'planlagt';

export function maxHpOf(chores: Chore[]): number {
  return chores.reduce((s, c) => s + (Number(c.damage) || 0), 0);
}

export function weekOf(d: Date): number {
  const s = new Date(d.getFullYear(), 0, 1);
  return Math.floor(((d.getTime() - s.getTime()) / 86400000 + s.getDay()) / 7);
}

/** A stable key for the boss's current recurrence window. */
export function cycleKey(boss: Boss, now = new Date()): string {
  if (boss.currentCycleKey) return boss.currentCycleKey;
  const t = boss.trigger;
  if (t.type === 'daglig') return 'd' + now.toDateString();
  if (t.type === 'ukentlig') return 'w' + now.getFullYear() + '-' + weekOf(now);
  if (t.type === 'månedlig') return 'm' + now.getFullYear() + '-' + now.getMonth();
  return 'alltid';
}

/**
 * Day streaks.
 *
 * The durable record is the set of local calendar days each fighter completed a chore
 * on; `Fighter.streak` is a cached projection of it, the same way the server caches
 * coins and career XP. Deriving rather than incrementing keeps the count correct when
 * the same day arrives twice — a retry, a second device, or a replayed sync page.
 */
const ACTIVE_DAY_LIMIT = 90;

/** Local calendar day, e.g. `2026-08-06`. Local on purpose: a chore belongs to the day the family did it. */
export function dayKey(date: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function previousDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  // Constructing from local parts lets the platform handle month, year and DST rollover.
  return dayKey(new Date(year, month - 1, date - 1));
}

export function recordActiveDay(days: string[] | undefined, day: string, limit = ACTIVE_DAY_LIMIT): string[] {
  if (days?.includes(day)) return days;
  return [...(days ?? []), day].sort().slice(-limit);
}

export function mergeActiveDays(
  current: Record<string, string[]> | undefined,
  incoming: Record<string, string[]> | undefined,
  limit = ACTIVE_DAY_LIMIT,
): Record<string, string[]> {
  const merged: Record<string, string[]> = {};
  for (const source of [current ?? {}, incoming ?? {}]) {
    for (const [fighterId, days] of Object.entries(source)) {
      merged[fighterId] = [...new Set([...(merged[fighterId] ?? []), ...days])].sort().slice(-limit);
    }
  }
  return merged;
}

/**
 * Consecutive days up to and including today.
 *
 * A streak counts from yesterday while today's chores have not happened yet, so it
 * only breaks once a whole day is actually missed rather than every midnight.
 */
export function streakFrom(days: string[] | undefined, today: string = dayKey()): number {
  if (!days?.length) return 0;
  const active = new Set(days);
  let cursor = active.has(today) ? today : previousDay(today);
  if (!active.has(cursor)) return 0;
  let streak = 0;
  while (active.has(cursor)) {
    streak += 1;
    cursor = previousDay(cursor);
  }
  return streak;
}

/** The family's streak: any fighter's chore keeps the household's run alive. */
export function householdStreak(activeDays: Record<string, string[]> | undefined, today: string = dayKey()): number {
  return streakFrom(Object.values(activeDays ?? {}).flat(), today);
}

/** Small stable string hash (djb2), used for deterministic per-cycle rolls. */
export function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

/**
 * Whether a dormant boss has woken up. Non-dormant bosses are always awake;
 * a dormant boss awakens once the family reaches its `unlockAt` victory count.
 * A parent-slept boss (dormant with unlockAt 0) stays asleep until woken by hand.
 */
export function isAwake(boss: Boss, victories: number): boolean {
  return !boss.dormant || (boss.unlockAt > 0 && victories >= boss.unlockAt);
}

/** Number of still-slumbering bosses, and the next victory milestone that wakes one. */
export function slumberInfo(bosses: Boss[], victories: number): { count: number; next: number | null } {
  const locked = bosses.filter((b) => !isAwake(b, victories));
  const thresholds = locked
    .map((b) => b.unlockAt)
    .filter((v) => v > victories)
    .sort((a, b) => a - b);
  return { count: locked.length, next: thresholds[0] ?? null };
}

/** Percentage chance that any given active-boss cycle spawns an enraged "elite" variant. */
export const ELITE_CHANCE = 22;
/** Coin multiplier awarded for defeating an elite (enraged) boss. */
export const ELITE_COIN_MULT = 1.5;
/** Percentage chance that a rare boss appears on any calendar day. */
export const RARE_DAILY_CHANCE = 3;

/** Stable key for the window an elite roll belongs to (daily for always-on bosses). */
function eliteKey(boss: Boss, now: Date): string {
  if (boss.trigger.type === 'alltid') return boss.id + '|d' + now.toDateString();
  return boss.id + '|' + cycleKey(boss, now);
}

/**
 * Deterministic per-cycle "enraged" roll. Same boss + same cycle always agrees,
 * and it re-rolls when the cycle rolls over. Rare (Golden) bosses are never elite —
 * they are already their own spectacle.
 */
export function isElite(boss: Boss, now = new Date()): boolean {
  if (boss.elite !== undefined) return boss.elite;
  if (boss.rare) return false;
  return hashStr(eliteKey(boss, now)) % 100 < ELITE_CHANCE;
}

/** Composed CSS filter for a boss sprite: permanent hue variant + optional enraged tint. */
export function bossFilter(boss: Boss, elite = false): string {
  const parts: string[] = [];
  if (boss.hue) parts.push(`hue-rotate(${boss.hue}deg)`, 'saturate(1.25)');
  if (elite) parts.push('saturate(1.6)', 'contrast(1.12)', 'drop-shadow(0 0 12px rgba(224,86,74,.6))');
  return parts.join(' ');
}

/** Stable local-date key used for a once-per-day rare boss roll. */
function localDateKey(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Whether a boss is currently due (spawned) for its schedule. */
export function isDue(boss: Boss, _goldenRevealed: boolean, now = new Date()): boolean {
  if (boss.available !== undefined) return boss.available;
  const t = boss.trigger;
  if (t.type === 'sjelden') {
    // One stable roll per local calendar day. Reopening the app cannot re-roll it,
    // and the encounter automatically expires when the date changes.
    return hashStr(`${boss.id}|rare|${localDateKey(now)}`) % 100 < RARE_DAILY_CHANCE;
  }
  if (t.type === 'ukentlig') {
    const today = (now.getDay() + 6) % 7;
    const trig = ((t.day ?? 0) + 6) % 7;
    return today >= trig;
  }
  if (t.type === 'månedlig') return now.getDate() >= (t.date ?? 1);
  return true;
}

export function statusOf(boss: Boss, goldenRevealed: boolean, now = new Date()): BossStatus {
  if (!isDue(boss, goldenRevealed, now)) return 'planlagt';
  return boss.hp <= 0 ? 'beseiret' : 'aktiv';
}

function ord(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function scheduleLabel(boss: Boss, lang: Lang): string {
  const t = boss.trigger;
  const en = lang === 'en';
  const days = DAY_LONG[lang];
  if (t.type === 'alltid') return en ? 'Always active' : 'Alltid aktiv';
  if (t.type === 'sjelden') return en ? 'Legendary · rare spawn' : 'Legendarisk · sjelden';
  if (t.type === 'daglig') return en ? 'Every day' : 'Hver dag';
  if (t.type === 'ukentlig') return (en ? 'Every ' : 'Hver ') + days[t.day ?? 0].toLowerCase();
  if (t.type === 'månedlig') return en ? 'The ' + ord(t.date ?? 1) + ' each month' : 'Den ' + (t.date ?? 1) + '. hver måned';
  return '';
}

export function whenText(boss: Boss, lang: Lang): string {
  const t = boss.trigger;
  const en = lang === 'en';
  const days = DAY_LONG[lang];
  if (t.type === 'ukentlig') return days[t.day ?? 0].toLowerCase();
  if (t.type === 'sjelden') return en ? 'when least expected' : 'når minst man venter';
  if (t.type === 'månedlig') return en ? 'on the ' + ord(t.date ?? 1) : 'den ' + (t.date ?? 1) + '.';
  if (t.type === 'daglig') return en ? 'every day' : 'hver dag';
  return en ? 'always' : 'alltid';
}

export interface LevelInfo {
  level: number;
  title: string;
  into: number;
  per: number;
  pct: number;
}

export function levelInfo(xp: number, lang: Lang = 'no'): LevelInfo {
  const per = 120;
  const level = Math.floor(xp / per) + 1;
  const into = xp % per;
  const titles = STRINGS[lang].levelTitles;
  const title = titles[Math.min(titles.length - 1, Math.floor((level - 1) / 2))];
  return { level, title, into, per, pct: (into / per) * 100 };
}

export function todayShort(now = new Date(), lang: Lang = 'no'): string {
  return DAY_SHORT[lang][now.getDay()].toLowerCase();
}

export function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
