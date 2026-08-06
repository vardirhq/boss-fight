import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bossFilter,
  cycleKey,
  dayKey,
  householdStreak,
  mergeActiveDays,
  recordActiveDay,
  streakFrom,
  isAwake,
  isDue,
  isElite,
  levelInfo,
  maxHpOf,
  scheduleLabel,
  slumberInfo,
  statusOf,
  todayShort,
  whenText,
} from './logic.ts';
import type { Boss } from './types.ts';

function boss(overrides: Partial<Boss> = {}): Boss {
  return {
    id: 'boss-1', name: 'Boss', sprite: '/boss.webp', frames: 0, rare: false,
    trigger: { type: 'daglig' }, chores: [], hp: 10, clearedCycle: '', usedChores: [],
    dormant: false, unlockAt: 0, ...overrides,
  };
}

test('maximum HP sums finite chore damage and ignores invalid numeric values', () => {
  assert.equal(maxHpOf([
    { id: 'a', title: 'A', damage: 12, repeatable: false },
    { id: 'b', title: 'B', damage: Number.NaN, repeatable: false },
    { id: 'c', title: 'C', damage: 18, repeatable: true },
  ]), 30);
});

test('cycle keys change at daily, weekly, and monthly recurrence boundaries', () => {
  const saturday = new Date(2026, 7, 1, 12);
  const sunday = new Date(2026, 7, 2, 12);
  assert.notEqual(cycleKey(boss({ trigger: { type: 'daglig' } }), saturday), cycleKey(boss(), sunday));
  assert.notEqual(cycleKey(boss({ trigger: { type: 'ukentlig' } }), saturday), cycleKey(boss({ trigger: { type: 'ukentlig' } }), sunday));
  assert.notEqual(cycleKey(boss({ trigger: { type: 'månedlig' } }), new Date(2026, 6, 31, 12)), cycleKey(boss({ trigger: { type: 'månedlig' } }), new Date(2026, 7, 1, 12)));
  assert.equal(cycleKey(boss({ currentCycleKey: 'server-cycle' }), sunday), 'server-cycle');
});

test('dormant bosses wake only at configured victory milestones', () => {
  const bosses = [boss(), boss({ id: 'two', dormant: true, unlockAt: 2 }), boss({ id: 'manual', dormant: true, unlockAt: 0 })];
  assert.equal(isAwake(bosses[1], 1), false);
  assert.equal(isAwake(bosses[1], 2), true);
  assert.deepEqual(slumberInfo(bosses, 1), { count: 2, next: 2 });
  assert.deepEqual(slumberInfo(bosses, 2), { count: 1, next: null });
});

test('schedule availability respects weekly/monthly boundaries and server authority', () => {
  const weekly = boss({ trigger: { type: 'ukentlig', day: 3 } });
  assert.equal(isDue(weekly, false, new Date(2026, 7, 4, 12)), false);
  assert.equal(isDue(weekly, false, new Date(2026, 7, 5, 12)), true);
  const monthly = boss({ trigger: { type: 'månedlig', date: 15 } });
  assert.equal(isDue(monthly, false, new Date(2026, 7, 14, 12)), false);
  assert.equal(isDue(monthly, false, new Date(2026, 7, 15, 12)), true);
  assert.equal(isDue(boss({ available: false }), false), false);
});

test('elite rolls are deterministic, rare bosses are excluded, and server values win', () => {
  const now = new Date(2026, 7, 5, 12);
  const candidate = boss();
  assert.equal(isElite(candidate, now), isElite(candidate, now));
  assert.equal(isElite(boss({ rare: true }), now), false);
  assert.equal(isElite(boss({ rare: true, elite: true }), now), true);
  assert.equal(bossFilter(boss({ hue: 90 }), true), 'hue-rotate(90deg) saturate(1.25) saturate(1.6) contrast(1.12) drop-shadow(0 0 12px rgba(224,86,74,.6))');
});

test('boss status, bilingual schedule copy, levels, and weekday labels cover boundaries', () => {
  assert.equal(statusOf(boss({ available: false })), 'planlagt');
  assert.equal(statusOf(boss({ available: true, hp: 0 })), 'beseiret');
  assert.equal(statusOf(boss({ available: true, hp: 1 })), 'aktiv');
  const monthly = boss({ trigger: { type: 'månedlig', date: 21 } });
  assert.equal(scheduleLabel(monthly, 'en'), 'The 21st each month');
  assert.equal(whenText(monthly, 'no'), 'den 21.');
  assert.deepEqual(levelInfo(119), { level: 1, title: 'Væpner', into: 119, per: 120, pct: (119 / 120) * 100 });
  assert.deepEqual(levelInfo(120), { level: 2, title: 'Væpner', into: 0, per: 120, pct: 0 });
  assert.equal(todayShort(new Date(2026, 7, 5, 12)), 'ons');
  assert.equal(levelInfo(240, 'en').title, 'Knight');
  assert.equal(todayShort(new Date(2026, 7, 5, 12), 'en'), 'wed');
});

test('day keys are local calendar days and roll over correctly', () => {
  assert.equal(dayKey(new Date(2026, 7, 6, 23, 59)), '2026-08-06');
  assert.equal(dayKey(new Date(2026, 0, 1, 0, 0)), '2026-01-01');
  assert.equal(dayKey(new Date(2026, 11, 31, 12, 0)), '2026-12-31');
});

test('an active day is recorded once and the record stays bounded', () => {
  assert.deepEqual(recordActiveDay([], '2026-08-06'), ['2026-08-06']);
  // A retry, a second device, or a replayed sync page must not add the day twice.
  assert.deepEqual(recordActiveDay(['2026-08-06'], '2026-08-06'), ['2026-08-06']);
  assert.deepEqual(recordActiveDay(['2026-08-06'], '2026-08-05'), ['2026-08-05', '2026-08-06']);
  const many = Array.from({ length: 200 }, (_, index) => `2026-01-${String((index % 28) + 1).padStart(2, '0')}`);
  assert.ok(recordActiveDay(many, '2026-08-06', 90).length <= 90);
});

test('a streak counts consecutive days and survives a day not yet played', () => {
  const days = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06'];
  assert.equal(streakFrom(days, '2026-08-06'), 4);
  // Today has no chore yet: the run is still alive, counted from yesterday.
  assert.equal(streakFrom(days, '2026-08-07'), 4);
  // A whole day was missed, so the run is over.
  assert.equal(streakFrom(days, '2026-08-08'), 0);
  assert.equal(streakFrom([], '2026-08-06'), 0);
  assert.equal(streakFrom(undefined, '2026-08-06'), 0);
});

test('a gap breaks the streak rather than counting total days', () => {
  const days = ['2026-08-01', '2026-08-02', '2026-08-05', '2026-08-06'];
  assert.equal(streakFrom(days, '2026-08-06'), 2, 'only the run ending today counts');
});

test('a streak spans month and year boundaries', () => {
  assert.equal(streakFrom(['2026-01-30', '2026-01-31', '2026-02-01'], '2026-02-01'), 3);
  assert.equal(streakFrom(['2025-12-31', '2026-01-01'], '2026-01-01'), 2);
});

test('the household streak is alive if any fighter kept it going', () => {
  const activeDays = {
    ada: ['2026-08-04', '2026-08-06'],
    bob: ['2026-08-05'],
  };
  // Neither fighter has three days alone, but between them the family never missed one.
  assert.equal(streakFrom(activeDays.ada, '2026-08-06'), 1);
  assert.equal(householdStreak(activeDays, '2026-08-06'), 3);
  assert.equal(householdStreak({}, '2026-08-06'), 0);
  assert.equal(householdStreak(undefined, '2026-08-06'), 0);
});

test('merging day records from two devices keeps the union without duplicates', () => {
  const merged = mergeActiveDays(
    { ada: ['2026-08-05', '2026-08-06'] },
    { ada: ['2026-08-06', '2026-08-07'], bob: ['2026-08-07'] },
  );
  assert.deepEqual(merged.ada, ['2026-08-05', '2026-08-06', '2026-08-07']);
  assert.deepEqual(merged.bob, ['2026-08-07']);
});
