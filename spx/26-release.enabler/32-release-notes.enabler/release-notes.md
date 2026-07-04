# Release Notes

PROVIDES agent-authored release notes generated from the release data
SO THAT a published release
CAN carry human-readable notes that describe and group the release's changes

## Assertions

### Scenarios

- Given the resolved configuration, when the release-notes output path is resolved, then it is the configured changelog file — `CHANGELOG.md` by default — within the product working tree ([test](tests/release-notes.scenario.l1.test.ts))
- Given computed release data, when release notes are generated, then the changelog file exists at the resolved path and carries a section for the release's version ([test](tests/release-notes.scenario.l1.test.ts))

### Conformance

- Generated release notes conform to the Keep a Changelog structure ([test](tests/release-notes.conformance.l1.test.ts))

### Compliance

- ALWAYS: the release-notes prompt carries the release version, the commit subjects, and the checked canonical changelog path ([test](tests/release-notes.compliance.l1.test.ts))
- ALWAYS: release-notes generation depends on no spec-tree or domain state — the prompt is assembled from nothing beyond the release data and the resolved configuration ([audit])
- ALWAYS: the resolved changelog path is lexically and canonically contained within the product working tree, read-back uses the checked canonical artifact path through a no-follow artifact reader, final-path symlink swaps fail at read-back, ancestor-directory swaps fail before validation completes, and a configured changelog path that escapes through traversal, symlink resolution, a final output-path symlink, an existing directory target, or an existing file ancestor is rejected ([test](tests/release-notes.compliance.l1.test.ts))
- ALWAYS: generated release notes describe and group the release's changes faithfully to the underlying commits, introducing no claim absent from them ([audit])
