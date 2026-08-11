# Pi × Orca

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node.js-ESM-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pi extension](https://img.shields.io/badge/pi-extension-7C3AED.svg)](https://github.com/earendil-works/pi-coding-agent)
[![Orca](https://img.shields.io/badge/Orca-integrated-0EA5E9.svg)](https://orca.dev)

A [pi](https://github.com/earendil-works/pi-coding-agent) extension that keeps your Orca terminal tab titles in sync with the pi session running inside each one — and lets you spawn new pi tabs from within pi.

## Install

```bash
# Clone the repo into your pi extensions directory
git clone https://github.com/tianhuil/pi-orca.git ~/.pi/extensions/pi-orca
cd ~/.pi/extensions/pi-orca

# Install dependencies (Node.js required — extensions run on Node, not Bun)
pnpm install
```

Then reload pi (`/reload`) — the extension loads automatically via the `pi.extensions` field in `package.json`.

**Requirements:** Node.js 18+, pnpm, the [Orca](https://orca.dev) app. No API keys needed — title summarization uses a free model endpoint out of the box.

## How it works

### Tab title sync

When pi starts inside an Orca tab, the extension looks up the session ID in a local SQLite title store:

| Situation | Tab title |
|---|---|
| Brand-new session | `Pi` |
| Resumed session with a stored title | The stored summary (≤ 50 chars) |
| Resumed session whose title was never written (crash recovery) | Re-summarized from the stored first message |

On the **first user message** of a fresh session, the extension:

1. Persists the message text to the title store, keyed by session ID.
2. Sends a truncated excerpt to a free summarizer model ([Mimo v2.5](https://opencode.ai/zen)), asking for a title under 50 characters.
3. Writes the summarized title to the store and renames the Orca tab to match.

The title is also set as pi's internal session name, so pi's `/resume` picker shows the same summary as the tab. Once set, the title stays stable — Orca's `terminal rename` is sticky and overrides any later OSC title writes from pi.

If the summarizer is unreachable, the fallback is the first line of your message truncated to 50 characters.

### `/spawn` command

Type `/spawn` inside pi to open a new Orca tab running a fresh pi session in the current worktree — without leaving pi or switching apps. The new tab opens already titled `Pi` and gets its own summary once you start typing.

### Outside Orca

The extension degrades gracefully when pi runs outside Orca (no `ORCA_TERMINAL_HANDLE` environment variable): no tab renaming, but session names inside pi are still set. No crashes, no errors.

## Architecture

```
src/
├── index.ts        # Extension entry — registers provider, wires handlers & /spawn
├── orca.ts         # Orca CLI arg builders + injectable executor
├── store.ts        # SQLite title store (better-sqlite3 + Drizzle ORM, WAL mode)
├── summarizer.ts   # Model-call abstraction with fallback
└── title.ts        # Pure helpers: prompt builder, title normalizer
```

Key design decisions are documented in the [`docs/adr/`](docs/adr/) directory:

- **ADR-0001** — Tab titles are set via `orca terminal rename`, not pi's OSC writes
- **ADR-0002** — Summarization uses a self-registered free provider, not your configured model
- **ADR-0003** — Extensions run on Node, so the store uses better-sqlite3 (not bun:sqlite)

## Development

```bash
pnpm install
pnpm test          # run unit tests (vitest)
pnpm test:watch    # watch mode
```

Tests use in-memory SQLite and injectable model/executor fakes — no real Orca, no real API calls.

## License

[MIT](LICENSE) © 2026 Tianhui Michael Li
