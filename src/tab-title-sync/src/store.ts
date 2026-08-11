/**
 * Title store — sql.js (pure WASM, no native compilation).
 *
 * Schema:
 *   sessions(session_id TEXT PK, first_message TEXT NOT NULL, title TEXT,
 *            created_at INTEGER, updated_at INTEGER)
 *
 * The database file lives next to the extension entry, resolved from
 * import.meta.url at module level. Tests use ":memory:".
 *
 * sql.js is synchronous for queries but async to initialise (WASM load).
 * The factory is therefore async.
 */

import initSqlJs, { type Database as SqlJsDb } from "sql.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    first_message TEXT NOT NULL,
    title TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER
  )
`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionRow {
  session_id: string;
  first_message: string;
  title: string | null;
  created_at: number;
  updated_at: number | null;
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface TitleStore {
  /** Look up the row for a session, or undefined if none. */
  get(sessionId: string): SessionRow | undefined;
  /** Insert a new row (first message persisted). */
  insertFirstMessage(sessionId: string, firstMessage: string): void;
  /** Set the title on an existing row. */
  updateTitle(sessionId: string, title: string): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a TitleStore backed by the given Database path.
 * Pass ":memory:" for tests.
 */
export async function createTitleStore(dbPath: string): Promise<TitleStore> {
  const SQL = await initSqlJs();

  const isInMemory = dbPath === ":memory:";

  let db: SqlJsDb;
  if (!isInMemory && existsSync(dbPath)) {
    db = new SQL.Database(readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }

  db.run(CREATE_TABLE);

  function persist(): void {
    if (isInMemory) return;
    writeFileSync(dbPath, Buffer.from(db.export()));
  }

  return {
    get(sessionId: string): SessionRow | undefined {
      const results = db.exec(
        "SELECT session_id, first_message, title, created_at, updated_at FROM sessions WHERE session_id = ?",
        [sessionId],
      );
      if (results.length === 0 || results[0].values.length === 0) return undefined;
      const row = results[0].values[0];
      return {
        session_id: row[0] as string,
        first_message: row[1] as string,
        title: (row[2] as string) ?? null,
        created_at: row[3] as number,
        updated_at: row[4] != null ? (row[4] as number) : null,
      };
    },

    insertFirstMessage(sessionId: string, firstMessage: string): void {
      db.run(
        "INSERT INTO sessions (session_id, first_message, created_at) VALUES (?, ?, ?)",
        [sessionId, firstMessage, Date.now()],
      );
      persist();
    },

    updateTitle(sessionId: string, title: string): void {
      db.run(
        "UPDATE sessions SET title = ?, updated_at = ? WHERE session_id = ?",
        [title, Date.now(), sessionId],
      );
      persist();
    },
  };
}

/**
 * Resolve the default database path relative to the extension directory.
 */
export function resolveDbPath(): string {
  const thisDir = new URL(".", import.meta.url).pathname;
  return `${thisDir}../sqlite.db`;
}
