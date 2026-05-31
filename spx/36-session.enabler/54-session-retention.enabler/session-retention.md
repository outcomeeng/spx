# Session Retention

PROVIDES archive (move to `archive/` directory) and prune (retention-based deletion from `archive/`) for session lifecycle cleanup
SO THAT session-cli enabler
CAN offer `spx session archive` and `spx session prune` commands without reimplementing retention logic

Archive validates the `result` field declared by [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) before moving a canonical session to `archive/`. A session whose frontmatter does not parse into that shape is non-canonical and is moved to `archive/` without a `result` requirement.

## Assertions

### Scenarios

- Given 10 archived sessions with distinct timestamps, when `spx session prune --keep 5` is invoked, then the 5 sessions with the oldest timestamps are absent from `archive/` after the call and the 5 sessions with the newest timestamps remain in `archive/` ([test](tests/session-retention.scenario.l1.test.ts))
- Given no `--keep` argument, when prune is invoked, then the default retention of 5 archived sessions applies ([test](tests/session-retention.scenario.l1.test.ts))
- Given a canonical session in `todo` or `doing` with a non-empty `result` field, when `spx session archive` is invoked, then the session file moves to `archive/` ([test](tests/session-retention.scenario.l1.test.ts))
- Given a canonical session with an empty or absent `result` field, when `spx session archive` is invoked, then no file is moved and the command rejects with `SessionInvalidResultError` per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) ([test](tests/session-retention.scenario.l1.test.ts))
- Given a non-canonical session whose frontmatter does not parse into the canonical shape — a `priority`/`tags`-only frontmatter or malformed YAML — when `spx session archive` is invoked, then the file moves to `archive/` unchanged and no `result` is required per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) ([test](tests/session-retention.scenario.l1.test.ts))
- Given a session whose frontmatter carries the full canonical shape plus a key outside it such as `tags`, when `spx session archive` is invoked, then the session is non-canonical and moves to `archive/` without a `result` requirement per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) ([test](tests/session-retention.scenario.l1.test.ts))
- Given a session already in `archive/`, when archive is invoked, then no file is moved and the command rejects with an error indicating the session is already archived ([test](tests/session-retention.scenario.l1.test.ts))
- Given the `--dry-run` flag, when `spx session prune --dry-run` is invoked, then output names the sessions that would be deleted and no file is removed from `archive/` ([test](tests/session-retention.scenario.l1.test.ts))

### Properties

- For every input filesystem state produced by the arbitrary `arbitraryRetentionFixture(todoCount, doingCount, archiveCount, keep)`, the set of session files in `todo/` and `doing/` after `spx session prune` matches the set before `spx session prune` ([test](tests/session-retention.property.l1.test.ts))
- For every pair `(archiveCount, keep)` where `keep >= archiveCount`, the set of session files in `archive/` after `spx session prune --keep <keep>` equals the set before ([test](tests/session-retention.property.l1.test.ts))
- For every input archive fixture produced by `arbitraryArchiveFixture` where one or more session filenames are unparsable, the deterministic ordering function ranks every unparsable-ID session before every parsable-ID session of the same priority, and repeated calls on the same fixture produce the same ranking ([test](tests/session-retention.property.l1.test.ts))
- For every frontmatter value produced by `arbitraryNonCanonicalFrontmatter` — frontmatter for which reading the session as the canonical shape throws — `spx session archive` moves the file to `archive/` and does not reject ([test](tests/session-retention.property.l1.test.ts))

### Compliance

- ALWAYS: `spx session archive` uses `fs.rename()` for the status transition per [`spx/36-session.enabler/21-atomic-claiming.adr.md`](../21-atomic-claiming.adr.md) ([review])
- ALWAYS: every path component in retention operations is derived from `DEFAULT_CONFIG` per [`spx/36-session.enabler/21-directory-structure.adr.md`](../21-directory-structure.adr.md) ([review])
- ALWAYS: `spx session archive` reads a canonical session's `result` field through `SESSION_FRONT_MATTER.RESULT` and rejects when the field is missing or empty per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) ([test](tests/session-retention.compliance.l1.test.ts))
- ALWAYS: `spx session archive` moves a non-canonical session to `archive/` without the `result` check — a session whose frontmatter does not parse into the canonical shape is admitted as-is per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) ([test](tests/session-retention.compliance.l1.test.ts))
- NEVER: `spx session archive` moves a canonical file whose `result` field is empty or absent — incomplete canonical sessions are not added to the archived log per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) ([test](tests/session-retention.compliance.l1.test.ts))
