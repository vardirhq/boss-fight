import assert from 'node:assert/strict';
import test from 'node:test';
import { metricOutcome, metricsAuthorized, recordRequest, renderMetrics, resetMetricsForTest } from './observability.js';

test('operational metrics are bounded to route templates and outcome classes', () => {
  resetMetricsForTest();
  recordRequest('get', '/api/households/:householdId/config', 200);
  recordRequest('GET', '/api/households/:householdId/config', 503);
  const metrics = renderMetrics();
  assert.match(metrics, /route="\/api\/households\/:householdId\/config",outcome="success"} 1/);
  assert.match(metrics, /outcome="server_error"} 1/);
  assert.equal(metrics.includes('123e4567'), false);
  assert.equal(metricOutcome(422), 'client_error');
});

test('metrics require a configured bearer secret', () => {
  assert.equal(metricsAuthorized(undefined, undefined), false);
  assert.equal(metricsAuthorized('secret', 'Bearer wrong'), false);
  assert.equal(metricsAuthorized('secret', 'Bearer secret'), true);
});
