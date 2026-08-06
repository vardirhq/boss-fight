export type MetricOutcome = 'success' | 'client_error' | 'server_error';

const requests = new Map<string, number>();
let startedAt = Date.now();

export function metricOutcome(statusCode: number): MetricOutcome {
  if (statusCode >= 500) return 'server_error';
  if (statusCode >= 400) return 'client_error';
  return 'success';
}

export function recordRequest(method: string, route: string, statusCode: number) {
  const key = `${method.toUpperCase()}|${route}|${metricOutcome(statusCode)}`;
  requests.set(key, (requests.get(key) ?? 0) + 1);
}

function label(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

export function renderMetrics() {
  const lines = [
    '# HELP boss_kamp_uptime_seconds API process uptime.',
    '# TYPE boss_kamp_uptime_seconds gauge',
    `boss_kamp_uptime_seconds ${Math.floor((Date.now() - startedAt) / 1_000)}`,
    '# HELP boss_kamp_http_requests_total Requests grouped by route and outcome.',
    '# TYPE boss_kamp_http_requests_total counter',
  ];
  for (const [key, value] of [...requests].sort(([left], [right]) => left.localeCompare(right))) {
    const [method, route, outcome] = key.split('|');
    lines.push(`boss_kamp_http_requests_total{method="${label(method)}",route="${label(route)}",outcome="${label(outcome)}"} ${value}`);
  }
  return `${lines.join('\n')}\n`;
}

export function resetMetricsForTest() {
  requests.clear();
  startedAt = Date.now();
}

export function metricsAuthorized(configuredToken: string | undefined, authorization: string | undefined) {
  return Boolean(configuredToken && authorization === `Bearer ${configuredToken}`);
}
