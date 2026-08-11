# Title store uses sql.js, not better-sqlite3

**Status:** accepted
**Supersedes:** [ADR-0003](./0003-node-runtime-sqlite.md)

## Context

ADR-0003 chose `better-sqlite3` for the title store because extensions run on Node (not Bun). `better-sqlite3` is a C++ native addon that must be compiled for the exact Node.js version of the pi process.

pi's Node version is determined by its shebang (`#!/opt/homebrew/opt/node/bin/node`), which on Homebrew tracks the latest stable Node — currently **v26** (MODULE_VERSION 147). However, `pi install` runs `npm install` using the user's shell PATH, which may point to a different Node version (e.g. v24 via nvm). `better-sqlite3`'s `prebuild-install` downloads prebuilt binaries for the *install-time* Node, not the *runtime* Node. When the versions differ, the native addon fails to load with a MODULE_VERSION mismatch, and the entire extension fails silently.

Even if versions matched at install time, any pi update that bumps its Node requirement would silently break the extension for all users.

## Decision

Replace `better-sqlite3` + `drizzle-orm` with `sql.js` — a pure-WASM SQLite with zero native compilation. The store schema and TitleStore interface remain unchanged; only the driver layer swaps out. The factory becomes async (WASM init), which is fine since the extension entry point is already async.

We also drop `drizzle-orm`: the store is three trivial methods (get, insertFirstMessage, updateTitle) against a single table. Raw sql.js keeps the dependency count low and avoids an ORM layer whose sql.js driver support may lag behind.

## Consequences

- **Portability:** `pi install` works on any Node version without build tools — no prebuild version mismatches, no `node-gyp`, no C++ compiler needed.
- **Performance:** sql.js writes are slower than better-sqlite3 (~5-10× for bulk operations). The title store does at most two writes per session (insert + update), so this is negligible.
- **Persistence:** sql.js is in-memory by default; the store manually persists to disk via `db.export()` after each write. This adds a few lines but keeps the same file-based `sqlite.db` behavior.
- **Async init:** `createTitleStore()` becomes async because `initSqlJs()` loads the WASM module. The extension factory already returns a Promise, so this requires only an `await`.
