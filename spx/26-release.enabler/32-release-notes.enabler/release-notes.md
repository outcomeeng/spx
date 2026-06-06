# Release Notes

PROVIDES agent-authored release notes generated from the release data
SO THAT a published release
CAN carry human-readable notes that describe and group the release's changes

## Assertions

### Scenarios

- Given computed release data, when the release-notes output path is resolved, then it is derived from that release data ([test](tests/release-notes.scenario.l1.test.ts))
- Given computed release data, when release notes are generated, then the notes file exists at the path derived from that release data ([test](tests/release-notes.scenario.l1.test.ts))

### Conformance

- Generated release notes conform to the Keep a Changelog structure ([test](tests/release-notes.conformance.l1.test.ts))

### Compliance

- ALWAYS: the release-notes prompt is assembled only from the release data, so generation depends on no spec-tree or domain state ([test](tests/release-notes.compliance.l1.test.ts))
- ALWAYS: generated release notes describe and group the release's changes faithfully to the underlying commits, introducing no claim absent from them ([audit])
