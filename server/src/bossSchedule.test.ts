import assert from 'node:assert/strict';
import test from 'node:test';
import { decorateBosses, serverBossAvailable, serverBossElite, serverCycleKey } from './bossSchedule.js';

const now = new Date('2026-08-06T12:00:00Z');

test('server boss cycles and availability follow the household calendar', () => {
  assert.equal(serverCycleKey({ trigger_type: 'daglig' }, 'Europe/Oslo', now), 'd2026-08-06');
  assert.equal(serverCycleKey({ trigger_type: 'månedlig' }, 'Europe/Oslo', now), 'm2026-8');
  assert.equal(serverBossAvailable({ trigger_type: 'månedlig', trigger_date: 6 }, 'household', 'Europe/Oslo', now), true);
  assert.equal(serverBossAvailable({ trigger_type: 'månedlig', trigger_date: 7 }, 'household', 'Europe/Oslo', now), false);
});

test('boss decoration is deterministic and rare bosses are never elite', () => {
  const boss = { id: 'boss', trigger_type: 'sjelden', rare: true };
  assert.equal(serverBossElite(boss, 'household', 'Europe/Oslo', now), false);
  assert.deepEqual(
    decorateBosses([boss], 'household', 'Europe/Oslo'),
    decorateBosses([boss], 'household', 'Europe/Oslo'),
  );
});
