# Session Identity

PROVIDES timestamp-based session ID generation, ID parsing, and YAML front-matter metadata extraction per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md)
SO THAT session-store, session-claim, session-retention, and session-cli enablers
CAN identify sessions uniquely, determine sort order, and extract every governed frontmatter field without reimplementing parsing

## Assertions

### Scenarios

- Given a session ID string in valid format, when parsed, then a Date object with matching components is returned ([test](tests/session-identity.scenario.l1.test.ts))
- Given an invalid session ID string, when parsed, then null is returned ([test](tests/session-identity.scenario.l1.test.ts))
- Given valid YAML front matter with `priority`, `branch`, `worktree`, `goal`, and `next_step` set, when metadata is parsed, then the extracted values match the input ([test](tests/session-identity.scenario.l1.test.ts))
- Given YAML front matter with `specs: [...]` and `files: [...]` arrays of strings, when metadata is parsed, then `specs` and `files` are returned as the corresponding string arrays ([test](tests/session-identity.scenario.l1.test.ts))
- Given malformed YAML front matter, when metadata is parsed, then default metadata is returned without error ([test](tests/session-identity.scenario.l1.test.ts))
- Given YAML front matter that contains a `tags` key (sessions written under the previous frontmatter shape), when metadata is parsed, then the returned object does not include a `tags` key and no error or warning is raised — the `tags` field is silently dropped per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) ([test](tests/session-identity.scenario.l1.test.ts))

### Properties

- For every valid Date instance produced by the arbitrary `arbitraryValidSessionInstant`, `generateSessionId` returns a string matching `/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/` ([test](tests/session-identity.property.l1.test.ts))
- For every pair of distinct Date instances `d1`, `d2` produced by `arbitraryValidSessionInstant`, the lexicographic comparison of their generated IDs has the same sign as the chronological comparison of `d1` and `d2` ([test](tests/session-identity.property.l1.test.ts))
- For every YAML content string `s` produced by `arbitraryNonFrontMatterContent` (the arbitrary `fc.string()` filtered to inputs where `s.startsWith("---\n")` is `false` — strings that do not open a YAML frontmatter document), `parseSessionMetadata(s)` returns `{ priority: "medium", specs: [], files: [], branch: "", worktree: "", goal: "", next_step: "" }` and never throws ([test](tests/session-identity.property.l1.test.ts))

### Compliance

- ALWAYS: the session ID separator between date and time is `_` and the separator within date and time components is `-` per [`spx/36-session.enabler/21-timestamp-format.adr.md`](../21-timestamp-format.adr.md) ([test](tests/session-identity.compliance.l1.test.ts))
- ALWAYS: `parseSessionMetadata` returns the seven default-valued fields declared by [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) (`priority`, `specs`, `files`, `branch`, `worktree`, `goal`, `next_step`) as required keys with the PDR-declared defaults. `agent_session_id` and `created_at` are optional in the return type — present when the input YAML carries the corresponding key, absent otherwise. The asymmetry reflects what a default can mean for each field: `goal: ""` and `next_step: ""` are meaningful "field not yet populated" sentinels that downstream code reads as such, whereas a default `created_at: ""` or `agent_session_id: ""` would falsify the data (claiming a session was created at no time, or attributing it to no runtime). Sessions written by `spx session handoff` under this PDR always carry `created_at`; sessions whose frontmatter omits the key are read-tolerated and the field is absent from the parsed result ([review])
- NEVER: a session ID contains a colon character — the timestamp format excludes colons per [`spx/36-session.enabler/21-timestamp-format.adr.md`](../21-timestamp-format.adr.md) ([test](tests/session-identity.compliance.l1.test.ts))
- NEVER: `parseSessionMetadata` returns a `tags` key — the frontmatter shape excludes `tags` per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) ([test](tests/session-identity.compliance.l1.test.ts))
