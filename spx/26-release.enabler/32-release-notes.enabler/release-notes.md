# Release Notes

PROVIDES agent-authored release notes generated from the release data
SO THAT a published release
CAN carry human-readable notes that describe and group the release's changes

## Assertions

### Scenarios

- Given computed release data, when release notes are generated, then the notes are written to the release-notes output path resolved from that data ([review])

### Compliance

- ALWAYS: the release-notes prompt is assembled only from the release data, so generation depends on no spec-tree or domain state ([review])
- ALWAYS: generated release notes describe and group the release's changes faithfully to the underlying commits ([review])
