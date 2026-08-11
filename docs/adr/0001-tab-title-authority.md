# Tab titles are set via `orca terminal rename`, not pi's OSC titles

Orca tab titles are renamed with the orca CLI (`orca terminal rename --terminal <handle> --title <text>`), never via `ctx.ui.setTitle()` or by relying on pi's built-in title logic. Verified live in Orca 1.4.x: after a rename, subsequent OSC-0 title writes from the terminal process are ignored, so the extension fully owns the tab title.

pi's built-in `updateTerminalTitle` writes `Pi - <session> - <cwd>` via OSC at startup and on session rename, so `pi.setSessionName()` alone cannot produce an exact short title or the literal `Pi` for new sessions. The extension may still call `pi.setSessionName()` for pi's internal session picker, but the Orca rename is applied last and is the source of truth for the tab.
