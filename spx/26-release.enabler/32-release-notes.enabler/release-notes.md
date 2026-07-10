# Release Notes

PROVIDES agent-authored release notes generated from the release data
SO THAT a published release
CAN carry human-readable notes that describe and group the release's changes

## Assertions

### Scenarios

- Given the resolved configuration, when the release-notes output path is resolved, then it is the configured changelog file — `CHANGELOG.md` by default — within the product working tree ([test](tests/release-notes.scenario.l1.test.ts))
- Given a staged artifact carrying the release's version section, when release-notes generation completes, then that artifact exists at the resolved changelog path ([test](tests/release-notes.scenario.l1.test.ts))

### Conformance

- Only staged artifacts conforming to the Keep a Changelog structure are promoted to the resolved changelog path ([test](tests/release-notes.conformance.l1.test.ts))

### Compliance

- ALWAYS: the release-notes prompt carries the release version, the commit subjects, and the checked canonical staged artifact path seeded from existing changelog content, and structurally validated, faithfulness-audited staged notes atomically replace the checked canonical changelog path without exposing partial content ([test](tests/release-notes.compliance.l1.test.ts))
- ALWAYS: release-notes generation depends on no spec-tree or domain state — the prompt is assembled from nothing beyond the release data, the resolved configuration, and the checked canonical staged artifact path ([audit])
- ALWAYS: the resolved changelog path is lexically and canonically contained within the product working tree, staged and promoted read-back use checked canonical artifact paths through a no-follow artifact reader, promotion revalidates the checked final target binding before atomically replacing it from a fully written temporary sibling, final-path symlink swaps fail before promoted notes are accepted, ancestor-directory swaps fail before promotion is accepted, and a configured changelog path that escapes through traversal, symlink resolution, a final output-path symlink, an existing directory target, or an existing file ancestor is rejected ([test](tests/release-notes.compliance.l1.test.ts))
- ALWAYS: generated release notes describe and group the release's changes faithfully to the underlying commits, introducing no claim absent from them ([audit])
