# Changelog

## [Unreleased]

### Changed

- Generated release notes now focus on user-visible behavior and omit spec-only, test-only, release-mechanics, and internal implementation changes.

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
