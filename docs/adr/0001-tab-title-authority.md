# Tab titles are set via orca terminal rename, not pi's OSC writes

**Status:** accepted

**Context:** pi writes OSC title escape sequences that most terminals pick up as the window/tab title. Orca has its own `orca terminal rename` command that sets the tab label independently of OSC writes.

**Decision:** Set tab titles exclusively via `orca terminal rename`. This is sticky — once set, it survives pi's own OSC title writes, so the title stays stable for the lifetime of the session.

**Consequences:** Tab titles and pi's internal session name are two separate things that we keep in sync. The `/resume` picker shows the pi session name; the Orca tab shows the rename-set label.
