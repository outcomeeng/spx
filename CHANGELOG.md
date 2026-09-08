# Changelog

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
