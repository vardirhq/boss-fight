import assert from 'node:assert/strict';
import test from 'node:test';
import { entityId } from './entityIds.js';

test('entity IDs preserve server UUIDs and deterministically scope local IDs', () => {
  const serverId = 'A73FCB8B-DC0E-4A03-A79D-F1B12B09BB44';
  assert.equal(entityId('household', 'fighter', serverId), serverId.toLowerCase());
  const first = entityId('household-a', 'fighter', 'local-1');
  assert.equal(first, entityId('household-a', 'fighter', 'local-1'));
  assert.notEqual(first, entityId('household-b', 'fighter', 'local-1'));
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
