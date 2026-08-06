export type RequestObject = Record<string, unknown>;

function stringLimit(field: string) {
  const key = field.toLowerCase();
  if (key.includes('password')) return 256;
  if (key.includes('email')) return 254;
  if (key.includes('token')) return 512;
  if (key.includes('description') || key.includes('descr') || key.includes('note') || key.includes('reason')) return 1_000;
  if (key.includes('name') || key.includes('title')) return 120;
  if (key.includes('timezone')) return 64;
  if (key.includes('color')) return 32;
  if (key.includes('sprite')) return 256;
  if (key.includes('scope') || key.includes('role') || key.includes('kind') || key.includes('type')) return 64;
  if (key.includes('pin')) return 32;
  if (key === 'id' || key.endsWith('id') || key.includes('clientid')) return 128;
  return 512;
}

export function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${field} is required`);
  const trimmed = value.trim();
  const maximum = stringLimit(field);
  if (trimmed.length > maximum) throw new Error(`${field} must contain at most ${maximum} characters`);
  return trimmed;
}

export function optionalString(value: unknown, maximum = 1_000): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error('Expected string value');
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (trimmed.length > maximum) throw new Error(`String value must contain at most ${maximum} characters`);
  return trimmed;
}

export function stringValue(value: unknown, field: string, maximum = 2_000): string {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  if (value.length > maximum) throw new Error(`${field} must contain at most ${maximum} characters`);
  return value;
}

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
  if (Math.abs(value) > 1_000_000_000) throw new Error('Numeric value is outside the supported range');
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
