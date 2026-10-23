# Changelog

## [0.10.0]

### Added

- `spx orchestration lock -- <command> [arguments...]` runs a command under one host-wide slot. Only one guarded command tree runs at a time across every repository, worktree and session that uses the same lock file. A command starts after it holds the slot and host load stays quiet for a fresh sampling window of at least 30 seconds. The slot stays held until the last process that inherited the lock exits, even if the supervisor dies first. The command's own output and exit code pass through, and the last line on standard error is a JSON result line. `--run-id` sets the run id, and `--wait-seconds` shortens the default 14400-second wait cap. When the cap expires the command does not start, the result reports `not_ready`, and the exit code is 3. A guarded command started inside a running one runs under the outer slot without a second admission. The lock file is `$SPX_ORCHESTRATION_LOCK_PATH` when that holds an absolute path, otherwise `$XDG_STATE_HOME/engineering.outcome/orchestration.lock`, otherwise `~/.local/state/engineering.outcome/orchestration.lock`. The only supported platform is macOS on arm64 with local storage. Every other platform fails before the command starts.
- `spx verification run paths --verification-type <type> --scope-type <scope-type> --scope <scope>` reports, as JSON, the canonical scope, the branch key, and the journal and verification-context directories a run of that type and scope will write. For each directory it gives the resolved path, whether the directory exists, and which missing directories would need to be created. A host can grant write access before it launches a verification session. The command creates nothing.
- `spx verification run start --expectations <source>` binds a changeset run to the paths it must judge. Changeset runs now record their change inventory at start. Scope evidence can name judged deletions next to judged files. The new `spx verification run reconcile --run <token>` reports unaccounted, unexpected and drifted paths as one JSON result and exits zero only when the run reconciles. The first `finish` of a bound run seals it only when it reconciles. Otherwise it reports the reconciliation result and leaves the run unsealed.
- `spx verification run start --verifier <person|agent>:<id>` records who judges a run, and `status` reports it.
- Review findings can be unanchored: tied to a path or to the whole changeset, without a line, side or diff hunk. A finding that carries only part of an anchor is rejected, and the rejection names the missing field.
- `spx test` records a verdict for each test file (`passed`, `failed` or `not-run`), read from Vitest's JSON report or pytest's JUnit XML. A failing file no longer marks the files that ran beside it as failed. A missing report records every path as `not-run`. TypeScript test runs also record which product files each test module read.
- `spx spec status --update` writes `spx.status.json` in the 4.0 claim shape when the product declares methodology 4.0. Each result carries its verdict, a pin of the commit and the paths it read, and its verifier and run where applicable. Sealed audit runs contribute audit and evidence entries. Version-1 claims remain readable. `spx spec status --json` reports each claim's shape and state, plus every result's verdict, pin, actor, run, and whether its pin is still current against the checkout.
- `spx spec status --update --check` compares committed status claims with the regenerated projection without writing anything. It reports differing node states, verdicts or read sets and exits non-zero, and it ignores differences in pin commits alone.
- `spx worktree release --session-id <id>` removes the claim that recorded that session id, even when a different live process holds it.

### Changed

- The spec tree is read with the grammar the product's methodology declaration selects. `methodology.version` on the 4.0 line selects the 4.0 grammar: substrate, capability, domain, interface, surface and variant nodes, `{slug}.spec.md` spec files, and a root `{name}.spec.md` whose front matter declares `kind: product`. A version on the 3.0–3.2 lines selects the 3.x grammar. A declared `methodology.migratingFrom` adds the source grammar for as long as it is declared. A declared version on any other line fails the read and names the lines spx reads. So does a tree with more than one root spec. Lint and release product context judge names by the same declaration, and release reads each endpoint with the grammar declared at that endpoint.
- A `kinds` field in the `specTree` configuration section is now rejected. Kind vocabulary comes from the methodology declaration.
- The `order` field of the spec-tree projection is now the list of an index's numeric segments (for example `20.10` projects as `[20, 10]`). Sibling, decision and context ordering compare indices segment by segment.
- `spx agent resume --since` and `spx agent search --since` name the missing unit when given a bare number, suggest an accepted form such as `120m`, and print a single `Error:` prefix.

### Fixed

- `spx spec context list` and `show` fail with a diagnostic and empty standard output when the product root holds no recognized product spec, instead of succeeding with no output.
- The methodology foundation that `spx spec context show --methodology` delivers resolves its reference paths against the shipped bundle, so no skill-directory placeholder reaches the agent.
- Context entries and decision selection order indices numerically, so `2.9` precedes `2.10`.
- A variant node's Digest uses its parent kind's opening. A 4.0 root spec with malformed front matter fails the read and names the file.
- `spx test --agent` no longer lists a failing runner group's requested paths as failing tests when the runner reported none. It states that no failed paths were reported and names the group's artifacts.
- Python test runs pin pytest's rootdir to the product directory, so an ini-file nearer to the test files no longer turns every verdict into `not-run`.
- `spx agent resume` escapes control bytes in error messages written to standard error.

## [0.9.0] - 2026-10-09

### Added

- `spx verification run start --change <owner/repo#N>` records the Change a verification run serves. A Change identity outside the `owner/repo#N` form is rejected before any run is created, and `status` reports the recorded identity.
- `spx verification run list --change <owner/repo#N>` lists the runs recorded for one Change as JSON, grouped by verification type, across every branch of the shared local store. Each run reports its token, drive mode, sealed state, terminal status and finding counts per disposition. The command requires `--change`, and it appends no journal event and seals no run.
- `spx verification run compare --change <owner/repo#N> --run <token> --run <token>` compares two runs of a Change file by file, reporting whether each file both runs judged changed or stayed the same between their head commits. It refuses runs that do not both belong to the Change, runs without a recorded head commit, and any count of `--run` other than two. A lookup failure names the Change, the run token and the searched target.
- Verification runs record their head commit at start for every scope type, and scope evidence can name the files a run judged. A judged path is rejected when the run's head commit does not hold it. A run opened outside a Git repository or in a repository without a commit records no head commit.
- The shipped methodology 4.0 foundation is refreshed to the current spec-tree plugin (0.101.3), so `spx spec context show --methodology` teaches the node kinds, layers and malleabilities the installed `/understand` teaches.

### Changed

- Text output of `spx spec context list` names the methodology version and any migration source as `MAJOR.MINOR`, whichever accepted form configuration declares. `list --json` keeps the declared values.
- Methodology diagnostics, including `spx diagnose` text reports and their fix actions, name the version as `methodology MAJOR.MINOR`, without a patch component. The `spx diagnose` text report lists a declared migration source as "Migrating from".

## [0.8.0] - 2026-10-04

### Added

- `spx spec context list` and `spx spec context show` load a target's complete Product Tree context deterministically: the product spec, ancestor specs, the decisions along the path, sibling and child contracts, cited decisions with the documents that cite them, and the coordination notes on the path, each with its selection reason and projection mode.
- The `SpecTreeProjection` contract is published as a JSON Schema.
- Markdown validation enforces the methodology 4.0 spec-tree link shapes: tree-absolute decision citations, node-local evidence links, and spx links that resolve to tracked files.
- Release notes and documentation updates interpret a release through the product's specs and decisions, resolving the governing node context of each changed path across both release-range endpoints.

### Fixed

- Context operands whose every candidate escapes the product root fail as unresolved.
- Spec status and next output is composed as terminal text, escaping externally sourced values.
- Spec-tree link segments are classified on both slash and backslash separators, and backslash-separated spx link hrefs are rejected.
- `--ignore-file` applies under `--no-ignore`.
- Release product context binds cited decisions only through Markdown links, orders its documents ordinally, attributes a root decision's audit claim to the product, and skips a node directory whose specification the release endpoint does not commit.

## [0.7.2]

### Added

- The methodology version in project configuration accepts the `MAJOR.MINOR` form.
- Verification accepts `filed` and `stale` as finding dispositions.

### Fixed

- Methodology version ranges resolve correctly: a provider is matched by its methodology line, range operands are kept in the patched form, and the range diagnostic names the operand form it expects.
- Journal appends that hit an explained sequence collision re-allocate their sequence and retry. Every retry re-checks the seal barrier and decides the seal before handling the collision, so a sealed journal is honored on each attempt.
- Verification run recording serializes recorder appends, and an append that is lost is surfaced rather than silently dropped.

## [0.7.1] - 2026-09-18

### Added

- `spx verification test run [paths...]` runs the product's test runner over the selected product paths as a recorded verification run. Each module and each failing case is written to the run journal as it resolves, the run is sealed when the runner ends, and the command exits zero exactly when the run passes. The run reads back through `spx verification run status` and `spx verification run render`.
- A run whose selected verification type has no runner for the product's language is reported without opening a run, naming the directory searched. A run rooted outside a git repository proceeds with a warning. A failure the command cannot recover from is rendered with its diagnostic.

### Changed

- `spx test` and `spx verification test run` resolve path operands through one shared rule. An operand resolves against the product root; `.` or the product root's own path selects the whole tree; an absolute path inside the product resolves like its relative spelling; a path outside the product root, written absolutely or by climbing out with `..`, is reported as unresolved.
- Verification runs resolve operands from the worktree the invocation directory belongs to and store the run under the repository's shared `.spx/` root, so a run started in a linked worktree is readable from every worktree.

### Fixed

- The extensionless-source validation rule no longer flags the product's root build configuration files.

## [0.7.0] - 2026-09-16

### Added

- `spx change draft create`, `list`, and `delete` manage local Markdown drafts without a remote store. The `create` command returns a stable identifier and file paths.
- File-scoped audit runs accept `auditClass: coordination` with `auditKind: change`. Independent auditors use this pair to record findings against a local Change draft.
- Changeset audits accept `auditClass: changeset` with `auditKind: coherence`. SPX rejects runs that record more than one review unit.
- SPX ships methodology foundation trees. Projects whose trees use an earlier supported version can set `methodology.migratingFrom`.

### Changed

- Foundation loading, compaction recovery, and methodology diagnostics read the shipped methodology tree. Each checks its provider declaration.

### Fixed

- Release-note validation and publication accept dated version headings. Both reject duplicate versions across dated and undated headings.
- The release publisher waits for registry provenance on new and resumed publications. This wait prevents an immediate confirmation failure when attestations arrive late.
- Changeset audit roots must match the run's subject and required coverage. This rule covers coverage-gap roots.
- Compaction recovery selects the methodology tree for the invoking agent. For an unidentified invocation, SPX uses the sole available agent tree. SPX reports ambiguity when multiple trees are available.
- Worktree status distinguishes an unreadable occupancy record from an unresolved target. It escapes external values in diagnostics.

## [0.6.27]

### Added

- Releases are published automatically when a release tag triggers them, with the publication recorded as evidence of what was released.
- Agent search finds a session by its store address and locates transcripts through a dedicated lookup that validates the search term before scanning.

### Changed

- Release notes generation refuses a release that carries no user-visible change, and holds back non-behavioral commits so notes describe observable effects only.
- Agent search reads transcripts directly from stored bytes, deciding which ones to search before decoding them.
- Confirming that a package release already exists now uses that package's own published record.

### Fixed

- Release publication verifies the triggering tag, the checked-out commit, and the committed inputs before publishing, and reads the changelog exactly as committed at the release tag.
- A publication command that ends without an exit code is now treated as a failure instead of passing silently.
- Releases with an empty package identity are rejected, and changes that reach a release only through a merge are now included.
- `spx release` reports command failures, changelog paths, document paths, and tags as external text, so those values are escaped in terminal output.
- CLI diagnostics escape rejected argument values everywhere they appear, including messages raised by the argument parser.
- `spx diagnose` truncates the manifest token it echoes to the display width and writes its report as escaped terminal text.
- `spx worktree` escapes its status output, both as JSON and as the rendered status tree.
- Agent search treats a ripgrep run that cannot start or that is terminated by a signal as a failure rather than an empty result, and skips branch lookups for stores that record no transcript branch.
- Agent resume classifies worktree scope from recent records only, distinguishes command-execution records from scope claims, and reads transcript names as they are produced.

## [0.6.25]

### Fixed

- `spx diagnose` now labels every detail line with the provenance of its value.
- CLI output now escapes external values at every point they enter terminal text, so unescaped input can no longer reach the terminal.

## [0.6.23] - 2026-07-22

### Added

- `spx session reconcile` reports a verdict for each recorded session reference.
- Verification context includes runs recorded during the merge period.

### Fixed

- CLI diagnostics escape control bytes before displaying external input.
- Journal writes recover from interrupted publication and preserve record order during concurrent writes.

## [0.6.22] - 2026-07-18

### Fixed

- `spx diagnose` treats orphaned session counts as information and no longer recommends releasing sessions.

## [0.6.21] - 2026-07-18

### Added

- Native Pi sessions can be resumed and their transcripts searched from the CLI.
- Verification audit runs can target individual files and report projected scope units.

### Fixed

- Worktree detection recognizes Pi controlling processes and suffixed command scripts.
- Verification scope resolution rejects parent segments and overlapping separators while preserving audit-root order.

## [0.6.20] - 2026-07-16

### Added

- TypeScript source graphs report coverage and reachability facts.
- Documentation sync adds the release version when a configured document has no previous release-version reference.

### Fixed

- Release documentation generation confines file access to the staging workspace and carries the exact release version in its instructions.
