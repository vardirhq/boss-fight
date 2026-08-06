const STORAGE_KEY = 'boss-kamp-diagnostics-v1';
const MAX_EVENTS = 100;

export type DiagnosticOutcome = 'success' | 'rejected' | 'offline' | 'error';

export interface DiagnosticEvent {
  at: string;
  area: 'api' | 'sync' | 'storage';
  operation: string;
  outcome: DiagnosticOutcome;
  code?: string;
  requestId?: string;
}

function safeOperation(operation: string) {
  return operation.split('?')[0]
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')
    .slice(0, 120);
}

export function loadDiagnostics(): DiagnosticEvent[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((event): event is DiagnosticEvent => Boolean(
      event && typeof event === 'object'
      && typeof (event as DiagnosticEvent).at === 'string'
      && typeof (event as DiagnosticEvent).area === 'string'
      && typeof (event as DiagnosticEvent).operation === 'string'
      && typeof (event as DiagnosticEvent).outcome === 'string',
    )).slice(-MAX_EVENTS);
  } catch {
    return [];
  }
}

export function recordDiagnostic(event: Omit<DiagnosticEvent, 'at'> & { at?: string }) {
  const next: DiagnosticEvent = {
    at: event.at ?? new Date().toISOString(), area: event.area,
    operation: safeOperation(event.operation), outcome: event.outcome,
    ...(event.code ? { code: event.code.slice(0, 80) } : {}),
    ...(event.requestId ? { requestId: event.requestId.slice(0, 100) } : {}),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...loadDiagnostics(), next].slice(-MAX_EVENTS)));
  } catch {
    // Diagnostics must never interfere with the primary operation.
  }
}

export function clearDiagnostics() {
  localStorage.removeItem(STORAGE_KEY);
}

export function diagnosticExport() {
  return {
    format: 'boss-kamp-diagnostics', version: 1,
    exportedAt: new Date().toISOString(), events: loadDiagnostics(),
  };
}
