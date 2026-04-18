# Session Identity

PROVIDES timestamp-based session ID generation, ID parsing, and YAML front-matter metadata extraction
SO THAT session-store, session-claim, session-retention, and session-cli enablers
CAN identify sessions uniquely, determine sort order, and extract priority and file-injection targets without reimplementing parsing

## Assertions

### Scenarios

- Given valid YAML front matter with priority and tags, when metadata is parsed, then the extracted priority and tags match the input ([test](tests/session-identity.unit.test.ts))
- Given malformed YAML front matter, when metadata is parsed, then default metadata is returned without error ([test](tests/session-identity.unit.test.ts))
- Given a session ID string in valid format, when parsed, then a Date object with matching components is returned ([test](tests/session-identity.unit.test.ts))
- Given an invalid session ID string, when parsed, then null is returned ([test](tests/session-identity.unit.test.ts))

### Properties

- Session ID generation produces strings matching `YYYY-MM-DD_HH-mm-ss` with zero-padded components ([test](tests/session-identity.unit.test.ts))
- Lexicographic ordering of session IDs matches chronological ordering ([test](tests/session-identity.unit.test.ts))
- Session content without YAML front matter yields default metadata: priority "medium", empty tags array ([test](tests/session-identity.unit.test.ts))

### Compliance

- ALWAYS: use underscores to separate date from time, hyphens within components per ADR 21-timestamp-format ([review](../21-timestamp-format.adr.md))
- NEVER: use colons in session IDs per ADR 21-timestamp-format ([review](../21-timestamp-format.adr.md))
- NEVER: omit leading zeros per ADR 21-timestamp-format ([review](../21-timestamp-format.adr.md))
