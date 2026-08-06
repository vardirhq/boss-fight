export type RequestObject = Record<string, unknown>;

export function optionalBoolean(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'boolean') throw new Error('Expected boolean value');
  return value;
}

export function optionalBooleanOrNull(value: unknown): boolean | null {
  if (value === undefined || value === null) return null;
  return optionalBoolean(value);
}

export function optionalNumber(value: unknown, fallback = 0): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Expected numeric value');
  return value;
}

export function optionalNumberOrNull(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  return optionalNumber(value);
}

export function queryInteger(value: unknown, field: string, fallback = 0): number {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${field} must be a non-negative integer`);
  return parsed;
}

export function requireObjectArray(value: unknown, field: string, maximum = 200): RequestObject[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  if (value.length > maximum) throw new Error(`${field} must contain at most ${maximum} items`);
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Expected JSON object');
    return item as RequestObject;
  });
}
