# Pi × Orca — tab title sync + `/spawn`

Status: ready-for-agent

## Problem Statement

Running pi inside an Orca tab leaves the tab labelled with pi's default terminal title (`Pi - <session> - <cwd>`), which is identical across sessions and says nothing about the conversation. With several pi tabs open, there is no way to tell which conversation is which at a glance, or to distinguish a fresh session from a resumed one. Starting a new pi session also requires leaving pi to open a new Orca tab and type `pi` by hand.

## Solution

An extension loaded into pi that:

- Renames its own Orca tab to the session's stored title, or the default title convention (`Pi`) when there is none.
- On the first user message of a fresh session, asynchronously asks a free summarizer model for a ≤50-character title, persists it in the title store keyed by the session id, and applies it to the tab. The title also becomes the session's display name inside pi.
- Restores stored titles whenever a session is opened or resumed — regardless of how pi was launched.
- Adds `/spawn`, which opens a new Orca tab running pi in the current worktree with a fresh session, titled `Pi`.

## User Stories

1. As a user running pi in an Orca tab, I want a new session's tab to be titled `Pi`, so that I can recognize it as a fresh conversation.
2. As a user running pi in an Orca tab, I want my first message to be summarized into the tab title within a few seconds, so that I can tell conversations apart at a glance.
3. As a user, I want the summary to be at most 50 characters, so that it fits the tab label.
4. As a user with many pi tabs open, I want each tab to show a distinct short summary, so that I can switch to the right conversation.
5. As a user who resumes a session, I want the tab to show the stored title immediately, so that I can recognize the conversation.
6. As a user who reopens a session with `pi --session <id>`, `pi -c`, or `pi -r`, I want the stored title restored, so that the tab identifies the conversation.
7. As a user who starts pi from a plain Orca bash tab, I want title sync to behave the same as launching from inside pi, so that titles don't depend on how pi was launched.
8. As a user who runs `/new`, I want the tab to become `Pi` again, so that the fresh session is not confused with the old one.
9. As a user who runs `/fork` or `/clone`, I want the new tab titled `Pi` with its own first-message summary, so that the fork is treated as a new conversation.
10. As a user whose session crashed before a title was written, I want `/resume` to re-summarize from the stored first message, so that the title is eventually recovered.
11. As a user with a session created before the extension existed, I want the tab to show `Pi` and never have my next input treated as a first message, so that old sessions aren't mislabeled by an arbitrary message.
12. As a user running pi outside Orca, I want the extension to do nothing harmful, so that my terminal keeps working normally.
13. As a user, I want the session's display name (as shown in pi's session picker) to match the tab title, so that pi's own UI agrees with the tab.
14. As a user typing `/spawn`, I want a new Orca tab to open running pi in the current worktree with a fresh session, so that I can start a parallel conversation without leaving pi.
15. As a user typing `/spawn` outside Orca, I want a clear error, so that I understand why it can't work.
16. As a user, I want title summaries to be computed with zero model configuration on my machine, so that the feature works out of the box.
17. As a user, I want the summarizer to never interfere with my configured default model, so that my normal pi usage is unchanged.
18. As a user, I want titles persisted across restarts, so that tabs restore correctly on the next launch.
19. As a user whose first input is a command line (starts with `/`), I want it not to be summarized, so that command lines don't become tab titles.
20. As a user, I want the tab title to stay stable once set, so that it doesn't flicker or get overwritten by later terminal title writes.

## Implementation Decisions

- **Extension shape**: a directory extension (`{ "pi": { "extensions": ["./src/index.ts"] } }`) whose entry is an async factory that registers the provider, wires the `session_start` and `input` handlers, and registers the `spawn` command.
- **Provider registration**: self-registered provider with a distinct id (`pi-orca-zen`) so it never collides with a user's own `models.json` entries. Model `mimo-v2.5-free` at `https://opencode.ai/zen/v1`, `api: "openai-completions"`, `apiKey: "public"`, 200K context window, `maxTokens` 32000. `compat` (`supportsStore: false`, `supportsDeveloperRole: false`, `maxTokensField: "max_tokens"`) lives on the model entry, since `ProviderConfig` has no top-level `compat`. Registration happens in the factory, before any handler can fire.
- **Title resolution is reason-independent**: the tab title comes from the title store keyed by session id alone — never from how pi was launched nor from the `session_start` reason. A session with no stored title falls back to the default title convention. This matters because every CLI launch path (`pi`, `pi --session`, `pi -c`, `pi -r`, pi typed in a bash tab) emits `reason: "startup"`; only in-TUI `/resume`, `/new`, `/fork` emit the specific reasons.

  The entry-point matrix that must hold:

  | How pi starts | Tab title |
  |---|---|
  | bare `pi` (anywhere) | `Pi` (fresh session) |
  | `/new` | `Pi` |
  | `pi --session <id>` / `pi -c` / `pi -r` | stored title if present; else `Pi` |
  | `/resume` | stored title; re-summarize only when the row has a `first_message` but no `title` (crash recovery) |
  | `/fork`, `/clone` | `Pi` (new session id → no row) |
  | old session with history but no row | `Pi`; the next input is **never** treated as a first message |
  | outside Orca (no handle) | no rename; store lookup + `setSessionName` still apply |

- **session_start handler (all reasons)**: resolve `id = getSessionId()`; look up the row → row with a `title` → apply (`setSessionName(title)` then `orca terminal rename` — rename last, per ADR-0001, since renames are sticky and pi's OSC title writes are ignored afterwards); row with only a `first_message` → summarize asynchronously, write the title, apply; no row → rename the tab to `Pi` only (no `setSessionName`, so pi's picker keeps showing the first message once it arrives) and record `canPersist = getEntries().length === 0`.
- **input handler**: skip anything with `source === "extension"` and raw text starting with `/`. If `canPersist` and there is still no store row for the session, persist the first message, then summarize asynchronously and apply. The `getEntries()` freshness check at `session_start` is the mechanism that keeps old row-less sessions from being mis-persisted — it must be preserved.
- **Summarizer** (ADR-0002): prompt asks for output of *less than 50 characters*; input truncated to ~2,000 chars; `maxTokens` small (~80); post-processing strips newlines/quotes and truncates on a codepoint boundary; fallback (no second model in the chain) = first line of the message truncated to 50. Uses `ctx.modelRegistry.find("pi-orca-zen", "mimo-v2.5-free")` + `complete()` from `@earendil-works/pi-ai/compat`. Never touches `defaultModel`.
- **Title store** (ADR-0003): better-sqlite3 through drizzle (`drizzle-orm/better-sqlite3`), synchronous, WAL mode; DB file at `<extension-dir>/sqlite.db` resolved from `import.meta.url`; in-memory for tests. Schema: `sessions(session_id TEXT PK, first_message TEXT NOT NULL, title TEXT, created_at, updated_at)`. Toolchain is pnpm + vitest + TypeScript — bun cannot run the extension runtime and `bun:sqlite` is unavailable, so the driver must not be "simplified" back to it.
- **Spawn command**: `/spawn` runs `orca terminal create --worktree active --command "pi" --title "Pi" --json` (bare `pi` = fresh session). Guard: if `ORCA_TERMINAL_HANDLE` is absent, print an error (not in Orca).
- **Modules**: the factory/handlers entry; the store; title helpers (prompt builder, normalizer); the summarizer (with injectable model call); Orca CLI interaction (rename/create arg builders + injectable executor, handle read from `ORCA_TERMINAL_HANDLE`).

## Testing Decisions

- **Seams** (unit-level only, matching the handoff): (1) pure helpers — `normalizeTitle`, `buildPrompt`, Orca arg builders — testable with zero mocking; (2) the first-message / title-resolution state machine, exercised with an injected store and fake ctx (no real pi, no real Orca); (3) the summarizer with an injectable model call; (4) the store on `:memory:` better-sqlite3. The Orca CLI and the zen endpoint are both mocked; there are no integration or E2E tests in CI — live verification is manual (see Further Notes).
- **What makes a good test**: assert external behavior — the resulting title string, whether a rename was issued and with what args, whether a store row was written — never implementation internals. State-machine tests pin the observable matrix: first input persists once (second input skipped), existing row backstops, `extension`-source and `/`-prefixed inputs are skipped.
- **Modules covered**:
  - `normalizeTitle`: strips newlines/quotes, truncates to ≤50 codepoints (multibyte-safe).
  - `buildPrompt`: text requests output of less than 50 characters.
  - First-message state machine: persists once (second input skipped); row-exists backstop; `extension`-source and `/`-prefixed skipped.
  - Store: upsert/lookup on `:memory:`.
  - Resume logic: row with title → restore, no model call; row without title → re-summarize; no row + history → no persist; no row + fresh → `Pi`.
  - Orca arg builders: rename with/without title, create, handle from env.
  - Summarizer fallback: model call rejects → first-line-truncated title.
- **Prior art**: the repo has no existing test suite — this is the first. It follows the vitest unit-testing convention set by ADR-0003, and mirrors the injectable-model-call seam style of the pi extension examples (`examples/extensions/summarize.ts`).

## Out of Scope

- Manual/live verification — the checklist in the handoff is run by hand after install, not automated.
- Retry/backoff or SLA management for the free zen endpoint.
- Editing or clearing titles by hand.
- Anything beyond `orca terminal rename` / `orca terminal create` — no OSC title handling, no window title management.
- Cleanup of title store rows for deleted sessions.
- `/spawn` variants (e.g., with a specific session id, or choosing a worktree).
- Multi-machine or shared title stores.

## Further Notes

- Risks carried into implementation: mimo is a free public endpoint with no SLA — the first-line-truncated fallback covers failures; two pi instances on the same session in different tabs each rename their own tab (harmless); ephemeral in-memory sessions get a row if a first message arrives but are never restored (harmless).
- Live verification checklist (manual, after install): `/reload` then `/new` → tab reads `Pi`; type a message → tab becomes a ≤50-char summary shortly after; `/resume` that session → stored title restored without re-summarizing; `/spawn` → new Orca tab running pi titled `Pi`; from an existing Orca bash tab, `pi --session <id>` → tab shows the stored title; outside Orca → no crash and `setSessionName` applied.
