import type { Boss, Chore, Lang } from './types';
import { DAY_LONG } from './i18n';

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
  const t = boss.trigger;
  if (t.type === 'daglig') return 'd' + now.toDateString();
  if (t.type === 'ukentlig') return 'w' + now.getFullYear() + '-' + weekOf(now);
  if (t.type === 'månedlig') return 'm' + now.getFullYear() + '-' + now.getMonth();
  return 'alltid';
}

/** Whether a boss is currently due (spawned) for its schedule. */
export function isDue(boss: Boss, goldenRevealed: boolean, now = new Date()): boolean {
  const t = boss.trigger;
  if (t.type === 'sjelden') {
    if (!goldenRevealed) return true;
    const seed = now.getFullYear() * 1000 + (weekOf(now) * 7 + now.getDay());
    let x = Math.sin(seed * 12.9898) * 43758.5453;
    x = x - Math.floor(x);
    return x < 0.12;
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

export function levelInfo(xp: number): LevelInfo {
  const per = 120;
  const level = Math.floor(xp / per) + 1;
  const into = xp % per;
  const titles = ['Væpner', 'Ridder', 'Kriger', 'Helt', 'Mester'];
  const title = titles[Math.min(titles.length - 1, Math.floor((level - 1) / 2))];
  return { level, title, into, per, pct: (into / per) * 100 };
}

export function todayShort(now = new Date()): string {
  return ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'][now.getDay()];
}

export function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
