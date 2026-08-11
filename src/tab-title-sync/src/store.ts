/**
 * Title store — better-sqlite3 + drizzle (WAL mode).
 *
 * Schema:
 *   sessions(session_id TEXT PK, first_message TEXT NOT NULL, title TEXT,
 *            created_at INTEGER, updated_at INTEGER)
 *
 * The database file lives next to the extension entry, resolved from
 * import.meta.url at module level. Tests use ":memory:".
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { text, integer, sqliteTable } from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const sessions = sqliteTable("sessions", {
  sessionId: text("session_id").primaryKey(),
  firstMessage: text("first_message").notNull(),
  title: text("title"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at"),
});

export type SessionRow = typeof sessions.$inferSelect;
export type NewSessionRow = typeof sessions.$inferInsert;

// ---------------------------------------------------------------------------
// Store
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
export function createTitleStore(dbPath: string): TitleStore {
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      first_message TEXT NOT NULL,
      title TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER
    )
  `);

  const db = drizzle(sqlite);

  return {
    get(sessionId: string): SessionRow | undefined {
      const rows = db
        .select()
        .from(sessions)
        .where(eq(sessions.sessionId, sessionId))
        .all();
      return rows[0];
    },

    insertFirstMessage(sessionId: string, firstMessage: string): void {
      const now = Date.now();
      db.insert(sessions).values({
        sessionId,
        firstMessage,
        createdAt: now,
      }).run();
    },

    updateTitle(sessionId: string, title: string): void {
      db.update(sessions)
        .set({ title, updatedAt: Date.now() })
        .where(eq(sessions.sessionId, sessionId))
        .run();
    },
  };
}

/**
 * Resolve the default database path relative to the extension directory.
 */
export function resolveDbPath(): string {
  // import.meta.url points to this file; the db lives in the extension root.
  const thisDir = new URL(".", import.meta.url).pathname;
  return `${thisDir}../sqlite.db`;
}
