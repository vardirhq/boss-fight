export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type StorageResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: unknown };

export function readStoredExport(
  storage: StorageLike,
  key: string,
  decode: (value: string) => Uint8Array,
): StorageResult<Uint8Array | null> {
  try {
    const value = storage.getItem(key);
    return { ok: true, value: value ? decode(value) : null };
  } catch (error) {
    return { ok: false, error };
  }
}

export function writeStoredExport(storage: StorageLike, key: string, value: string): StorageResult<void> {
  try {
    storage.setItem(key, value);
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error };
  }
}

export function removeStoredExport(storage: StorageLike, key: string): StorageResult<void> {
  try {
    storage.removeItem(key);
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error };
  }
}
