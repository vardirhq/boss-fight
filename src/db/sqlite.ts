import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

/**
 * Minimal, strongly-typed wrapper around sqlite-wasm.
 *
 * Persistence strategy:
 *  - Preferred: OPFS SAHPool VFS — a real on-disk SQLite database in the
 *    browser's Origin Private File System. Survives reloads, needs no COOP/COEP
 *    headers, and writes synchronously (so `flush()` is a no-op).
 *  - Fallback: an in-memory database whose contents are exported to
 *    localStorage on `flush()` and re-imported on boot. Keeps the app working
 *    (and persistent) where OPFS is unavailable.
 */

// The upstream types are loose; alias to keep our surface tidy.
type Sqlite3 = Awaited<ReturnType<typeof sqlite3InitModule>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OoDb = any;

export type Row = Record<string, string | number | null>;
export type Bindable = string | number | null | boolean;

const DB_FILE = '/boss-kamp.sqlite3';
const FALLBACK_KEY = 'boss-kamp.sqlite.export.v1';

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export class Db {
  private constructor(
    private readonly sqlite3: Sqlite3,
    private readonly db: OoDb,
    /** True when backed by OPFS (persistent without an explicit flush). */
    readonly persistent: boolean,
  ) {}

  static async open(): Promise<Db> {
    const sqlite3 = await sqlite3InitModule();

    // Try OPFS SAHPool first.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pool = await (sqlite3 as any).installOpfsSAHPoolVfs({ name: 'boss-kamp-pool' });
      const db = new pool.OpfsSAHPoolDb(DB_FILE);
      return new Db(sqlite3, db, true);
    } catch (err) {
      console.warn('[db] OPFS unavailable, using in-memory + localStorage fallback', err);
    }

    // Fallback: in-memory, seeded from a prior export if present.
    const db = new sqlite3.oo1.DB(':memory:', 'c');
    const stored = safeLocalStorageGet(FALLBACK_KEY);
    if (stored) {
      try {
        const bytes = fromBase64(stored);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const capi = (sqlite3 as any).capi;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wasm = (sqlite3 as any).wasm;
        const p = wasm.allocFromTypedArray(bytes);
        capi.sqlite3_deserialize(
          db.pointer, 'main', p, bytes.length, bytes.length,
          capi.SQLITE_DESERIALIZE_FREEONCLOSE | capi.SQLITE_DESERIALIZE_RESIZEABLE,
        );
      } catch (err) {
        console.warn('[db] failed to restore fallback export', err);
      }
    }
    return new Db(sqlite3, db, false);
  }

  /** Run a statement with no result set. */
  run(sql: string, params: Bindable[] = []): void {
    this.db.exec({ sql, bind: normalize(params) });
  }

  /** Run a query and return rows as plain objects. */
  query<T extends Row = Row>(sql: string, params: Bindable[] = []): T[] {
    const rows: T[] = [];
    this.db.exec({
      sql,
      bind: normalize(params),
      rowMode: 'object',
      callback: (row: T) => {
        rows.push(row);
      },
    });
    return rows;
  }

  /** Execute raw SQL (schema/migrations). */
  execScript(sql: string): void {
    this.db.exec(sql);
  }

  transaction(fn: () => void): void {
    this.db.exec('BEGIN');
    try {
      fn();
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  /** Persist to durable storage. No-op for OPFS; export for the fallback. */
  flush(): void {
    if (this.persistent) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const capi = (this.sqlite3 as any).capi;
      const bytes: Uint8Array = capi.sqlite3_js_db_export(this.db.pointer);
      safeLocalStorageSet(FALLBACK_KEY, toBase64(bytes));
    } catch (err) {
      console.warn('[db] flush failed', err);
    }
  }

  /** Wipe every table and the fallback export. */
  wipe(tables: string[]): void {
    this.transaction(() => {
      for (const t of tables) this.db.exec(`DELETE FROM ${t}`);
    });
    if (!this.persistent) safeLocalStorageRemove(FALLBACK_KEY);
  }
}

function normalize(params: Bindable[]): (string | number | null)[] {
  return params.map((p) => (typeof p === 'boolean' ? (p ? 1 : 0) : p));
}

function safeLocalStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeLocalStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    console.warn('[db] localStorage write failed', err);
  }
}
function safeLocalStorageRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
