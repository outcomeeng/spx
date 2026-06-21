# Session Store Test Harness

PROVIDES session-file parsing fixtures — `parseFrontMatter` parsing a session file's YAML frontmatter into a record, and `extractSessionFile` reading the handoff command's emitted session-file path from its output
SO THAT the session-store enabler's L1 tests
CAN read back frontmatter and handoff output without reimplementing the delimiter and tag parsing

## Assertions

### Scenarios

- Given session-file content whose frontmatter declares a key, when `parseFrontMatter` runs, then the returned record carries that key ([test](tests/test-harness.scenario.l1.test.ts))

### Compliance

- ALWAYS: frontmatter boundaries are read through the production `SESSION_FRONT_MATTER_OPEN` and `SESSION_FRONT_MATTER_CLOSE` delimiters, so parsing tracks the session-file format under test ([audit])
- ALWAYS: the helpers are pure — `parseFrontMatter` and `extractSessionFile` perform no filesystem, subprocess, or network I/O ([audit])
