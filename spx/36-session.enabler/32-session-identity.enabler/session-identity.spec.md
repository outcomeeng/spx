---
id: 01a1f5ad-9728-7b41-8cbe-291654eaa093
---

# Session Identity

PROVIDES timestamp-based session ID generation, agent-session environment identity resolution, ID parsing, and YAML front-matter metadata extraction per [spx/36-session.enabler/11-session-frontmatter.pdr.md](spx/36-session.enabler/11-session-frontmatter.pdr.md)
SO THAT session-store, compact, session-claim, session-retention, and session-cli enablers
CAN identify sessions uniquely, determine sort order, resolve agent-session tokens, and extract every governed frontmatter field without reimplementing parsing

## Assertions

### Test.Scenario: session ids and metadata

- [valid-id-parsed](tests/session-identity.scenario.l1.test.ts):
  - Given a session ID string in valid format
  - When it is parsed
  - Then a Date object with matching UTC components is returned
- [invalid-id-parsed](tests/session-identity.scenario.l1.test.ts):
  - Given an invalid session ID string
  - When it is parsed
  - Then null is returned
- [metadata-fields-extracted](tests/session-identity.scenario.l1.test.ts):
  - Given valid YAML front matter with `priority`, `git_ref`, `goal`, and `next_step` set
  - When metadata is parsed
  - Then the extracted values match the input
- [path-arrays-extracted](tests/session-identity.scenario.l1.test.ts):
  - Given YAML front matter with `specs: [...]` and `files: [...]` arrays of strings
  - When metadata is parsed
  - Then `specs` and `files` are returned as the corresponding string arrays
- [malformed-front-matter](tests/session-identity.scenario.l1.test.ts):
  - Given malformed YAML front matter
  - When metadata is parsed
  - Then default metadata is returned without error
- [undeclared-keys-ignored](tests/session-identity.scenario.l1.test.ts):
  - Given YAML front matter that carries keys outside the declared shape
  - When metadata is parsed
  - Then the returned object contains only the declared fields, and no error or warning is raised, per [spx/36-session.enabler/11-session-frontmatter.pdr.md](spx/36-session.enabler/11-session-frontmatter.pdr.md)
- [agent-session-identity](tests/session-identity.scenario.l1.test.ts):
  - Given each subset of `CLAUDE_CODE_SESSION_ID`, `CODEX_THREAD_ID`, `ANTIGRAVITY_CONVERSATION_ID`, and `PI_SESSION_ID`, generated from the source-owned identity-variable keys, whose members are non-empty while every other identity variable is empty or absent
  - When agent-session identity is resolved
  - Then a one-member subset returns that member's value, the empty subset returns no identity, and a subset of two or more members returns no identity and names every member

### Test.Property: session ids and tokens

- [id-format](tests/session-identity.property.l1.test.ts): For every valid Date instance produced by the arbitrary `arbitraryValidSessionInstant`, `generateSessionId` returns a string matching `/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/`.
- [id-sort-order](tests/session-identity.property.l1.test.ts): For every pair of distinct Date instances `d1`, `d2` produced by `arbitraryValidSessionInstant`, the lexicographic comparison of their generated IDs has the same sign as the chronological comparison of `d1` and `d2`.
- [non-front-matter-defaults](tests/session-identity.property.l1.test.ts): For every YAML content string `s` produced by `arbitraryNonFrontMatterContent` (the arbitrary `fc.string()` filtered to inputs where `s.startsWith("---\n")` is `false`), `parseSessionMetadata(s)` returns `{ priority: "medium", specs: [], files: [], git_ref: "", goal: "", next_step: "" }` and never throws.
- [safe-session-token](tests/session-identity.property.l1.test.ts): For every path-unsafe non-empty agent-session identity produced by `arbitraryPathUnsafeAgentSessionIdentity` as the one non-empty identity variable, `resolveAgentSessionId` returns a deterministic token that matches `/^[A-Za-z0-9_-]+$/` and differs from the raw unsafe identity.

### Test.Compliance: session ids and metadata

- [id-separators](tests/session-identity.compliance.l1.test.ts): ALWAYS: the session ID separator between date and time is `_` and the separator within date and time components is `-` per [spx/36-session.enabler/21-timestamp-format.adr.md](spx/36-session.enabler/21-timestamp-format.adr.md).
- [no-colon-in-id](tests/session-identity.compliance.l1.test.ts): NEVER: a session ID contains a colon character; the timestamp format excludes colons per [spx/36-session.enabler/21-timestamp-format.adr.md](spx/36-session.enabler/21-timestamp-format.adr.md).
- [declared-shape-only](tests/session-identity.compliance.l1.test.ts): NEVER: `parseSessionMetadata` returns a key outside the declared shape; only `priority`, `specs`, `files`, `git_ref`, `goal`, `next_step`, and (when the input carries them) `agent_session_id` and `created_at` appear in the parsed result per [spx/36-session.enabler/11-session-frontmatter.pdr.md](spx/36-session.enabler/11-session-frontmatter.pdr.md).

### Audit: metadata defaults

- default-valued-fields: ALWAYS: `parseSessionMetadata` returns the six default-valued fields declared by [spx/36-session.enabler/11-session-frontmatter.pdr.md](spx/36-session.enabler/11-session-frontmatter.pdr.md) (`priority`, `specs`, `files`, `git_ref`, `goal`, `next_step`) as required keys with the PDR-declared defaults, while `agent_session_id` and `created_at` are optional in the return type, present when the input YAML carries the corresponding key and absent otherwise, because a default `created_at: ""` or `agent_session_id: ""` would falsify the data where `goal: ""` and `next_step: ""` are meaningful "not yet populated" sentinels.
