import assert from 'node:assert/strict';
import test from 'node:test';
import { clearDiagnostics, diagnosticExport, loadDiagnostics, recordDiagnostic } from './diagnostics';

const values = new Map<string, string>();
Object.assign(globalThis, { localStorage: {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
} });

test('diagnostics retain bounded privacy-safe operational metadata', () => {
  clearDiagnostics();
  for (let index = 0; index < 105; index += 1) {
    recordDiagnostic({ area: 'api', operation: `/api/households/123e4567-e89b-12d3-a456-426614174000/config?secret=no`, outcome: 'error', code: 'server', requestId: `req-${index}` });
  }
  const events = loadDiagnostics();
  assert.equal(events.length, 100);
  assert.equal(events[0].requestId, 'req-5');
  assert.equal(events[0].operation, '/api/households/:id/config');
  assert.equal(JSON.stringify(diagnosticExport()).includes('secret=no'), false);
});
