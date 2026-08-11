# Extensions run on Node — use better-sqlite3 + drizzle, not bun:sqlite

pi loads extensions via jiti under Node (`#!/opt/homebrew/opt/node/bin/node`), so `bun:sqlite` is unavailable in the extension runtime even though bun is the project's toolchain. The title store therefore uses `better-sqlite3` through `drizzle-orm/better-sqlite3` (native addon, synchronous — keeps the first-message handler simple) with WAL mode; tests use `:memory:`.

Toolchain: **pnpm + vitest + TypeScript** — a deliberate deviation from the earlier "bun" instruction, since bun cannot run the extension and pnpm/vitest are the native Node pairing. Do not "simplify" the driver back to `bun:sqlite`; it will fail at runtime.
