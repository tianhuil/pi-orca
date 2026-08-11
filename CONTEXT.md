# Pi × Orca

A pi extension that keeps the Orca terminal tab title in sync with the pi session running inside it, and spawns new pi tabs from pi.

## Language

**Session**:
A pi conversation, persisted to a session file, addressed by a stable session id (UUID) that survives `/resume` and restarts.
_Avoid_: conversation, thread

**Session title**:
The human-readable display name of a session inside pi (what the `/resume` picker shows; set via `pi.setSessionName()`).
_Avoid_: tab title, conversation name

**Tab title**:
The label Orca shows on a terminal tab. Set with `orca terminal rename`; it is sticky — OSC title writes from the running process do not override it.
_Avoid_: window title, terminal title

**First message**:
The first non-command user input in a session's thread; the only message the extension persists into the title store.
_Avoid_: prompt, initial message

**Title store**:
The extension's `sqlite.db`, located in the extension directory, keyed by session id, holding the first message and the derived title.
_Avoid_: database, state store

**Default title convention**:
The tab title for a session with no stored title: `Pi`.
_Avoid_: default name, fallback title

**Spawn**:
The `/spawn` command — open a new Orca tab running pi in the current worktree with a fresh session.
_Avoid_: open, new tab
