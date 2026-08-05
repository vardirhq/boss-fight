import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bossFilter,
  cycleKey,
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
