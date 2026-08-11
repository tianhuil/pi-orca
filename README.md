# Pi × Orca

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node.js-ESM-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pi extension](https://img.shields.io/badge/pi-extension-7C3AED.svg)](https://github.com/earendil-works/pi-coding-agent)
[![Orca](https://img.shields.io/badge/Orca-integrated-0EA5E9.svg)](https://orca.dev)

A [pi](https://github.com/earendil-works/pi-coding-agent) extension that keeps your Orca terminal tab titles in sync with the pi session running inside each one — and lets you spawn new pi tabs from within pi.

## Install

```bash
pi install npm:@tianhuil/pi-orca
```

Then reload pi (`/reload`). The extension loads automatically via the `pi.extensions` field in `package.json`.

Prefer living on main? Install straight from the repo instead:

```bash
pi install git:github.com/tianhuil/pi-orca
```

<details>
<summary>Manual install</summary>

```bash
# Clone the repo into your pi extensions directory
git clone https://github.com/tianhuil/pi-orca.git ~/.pi/extensions/pi-orca
cd ~/.pi/extensions/pi-orca

# Install dependencies (Node.js required — extensions run on Node, not Bun)
npm install
```

Then reload pi (`/reload`).

</details>

**Requirements:** Node.js 18+, the [Orca](https://orca.dev) app. No API keys needed — title summarization uses a free model endpoint out of the box.

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
npm install
npm test          # run unit tests (vitest)
npm test:watch    # watch mode
```

Tests use in-memory SQLite and injectable model/executor fakes — no real Orca, no real API calls.

### E2E smoke test (Orca-only)

An end-to-end smoke test validates that the extension loads inside pi without errors and that the pi-in-Orca integration (tab rename, summarization) works end-to-end. This requires the Orca app — it is **not** run in CI.

```bash
# From any Orca terminal whose worktree is this repo:
npm run smoke:e2e

# Or skip the Orca integration check (startup-error scan only):
npm run smoke:e2e -- --skip-orca
```

**What it checks:**

1. **Startup errors** — scans the most recent pi session log (`~/.pi/agent/sessions/`) for this repo and flags unexpected `errorMessage` fields, missing `session`/`model_change` records, and suspicious tool errors. Best-effort heuristics; benign exit codes and user-initiated aborts are ignored.

2. **Pi-in-Orca integration** — spawns a fresh pi tab in the current worktree, waits for pi to become ready, verifies the tab title is `Pi` (confirming the `session_start` handler fired), sends a test message, and verifies the title changes (confirming the summarization pipeline ran). The test tab is cleaned up automatically.

**Prerequisites:** Orca must be running and this repo must be open as a worktree. The `ORCA_TERMINAL_HANDLE` environment variable must be set (Orca sets this automatically in its terminals).

## Publishing

Published to npm and auto-listed on the [pi.dev/packages](https://pi.dev/packages) gallery — the gallery is an npm keyword index (`keywords:pi-package`), not a registry with a submission step.

```bash
npm login            # once per machine, with your npmjs.com account
npm publish          # runs the tests (prepublishOnly), then publishes
npm run release      # patch-bump + git tag + publish in one step
npm run preview      # dry-run: inspect tarball contents before publishing
```

`npm publish` is gated by the `prepublishOnly` script (full test suite). For bigger bumps run `npm version <minor|major>` and then `npm publish`; `npm version` also creates the matching git tag, which `pi install git:github.com/tianhuil/pi-orca@v1` can pin to.

After publishing, verify the listing (note the scoped name is URL-encoded as `@tianhuil%2fpi-orca` in the registry URL):

```bash
# 1. keyword on the published manifest (drives the card badge + preview)
curl -s https://registry.npmjs.org/@tianhuil%2fpi-orca/latest | jq -r '.keywords[]' | grep -qx pi-package

# 2. visible to the gallery's exact query
curl -s "https://registry.npmjs.org/-/v1/search?text=keywords:pi-package%20@tianhuil/pi-orca&size=20" \
  | jq -r '.objects[].package.name' | grep -x "@tianhuil/pi-orca"
```

Both should exit 0; the search index can lag a publish by a few minutes. (The package is scoped, so `publishConfig.access: "public"` in `package.json` is what makes plain `npm publish` list it publicly — don't remove it.)

## License

[MIT](LICENSE) © 2026 Tianhui Michael Li
