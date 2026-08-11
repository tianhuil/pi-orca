## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Using the five canonical default labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Publishing

npm publishing is set up for this repo; the full workflow lives in `README.md` § Publishing. Rules agents must follow:

- **Metadata**: keep the `pi-package` + `extension` keywords and the `pi` manifest (`pi.extensions`) in `package.json`. Core pi packages (`@earendil-works/*`, `typebox`) go in `peerDependencies` with `"*"` and are never bundled; third-party runtime deps (e.g. `sql.js`) go in `dependencies`.
- **Publish**: `npm publish` (tests run via `prepublishOnly`) or `npm run release` (patch bump + git tag + publish). Use `npm run preview` to dry-run tarball contents first.
- **Verify after publish**: the `pi-package` keyword must appear on the registry manifest and the package must show up in the gallery query (`keywords:pi-package <name>`). The pi.dev/packages gallery is a keyword index — there is no submission step.
- **⚠️ Blocked**: the npm name `pi-orca` is taken by an unrelated package. Do **not** run `npm publish` until `name` in `package.json` is changed to a free name.
