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

export function requireObjectArray(value: unknown, field: string, maximum = 200): RequestObject[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  if (value.length > maximum) throw new Error(`${field} must contain at most ${maximum} items`);
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Expected JSON object');
    return item as RequestObject;
  });
}
