# Session Store

PROVIDES directory-backed CRUD primitives (list, show, create, delete, handoff) for session files
SO THAT session-claim, session-retention, and session-cli enablers
CAN enumerate, read, write, and remove sessions without reimplementing filesystem access or directory traversal

The frontmatter shape every primitive writes and reads is governed by [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md).

## Assertions

### Scenarios

- Given an empty sessions directory, when a JSON header with non-empty `goal` and `next_step` is piped at the start of stdin followed by a body, then a session file appears in `todo/` with a timestamp ID, the on-disk filename matches the emitted `<HANDOFF_ID>` tag, and `priority`, `branch`, `worktree`, `goal`, `next_step` keys are present in its frontmatter ([test](tests/session-store.scenario.l1.test.ts))
- Given empty or whitespace-only stdin to handoff, when handoff is invoked, then no file is written and the command rejects with `SessionInvalidContentError` per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) ([test](tests/session-store.scenario.l1.test.ts))
- Given a JSON header with empty `goal` piped to handoff, when handoff is invoked, then no file is written and the command rejects with `SessionInvalidGoalError` per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) ([test](tests/session-store.scenario.l1.test.ts))
- Given a JSON header with empty `next_step` piped to handoff, when handoff is invoked, then no file is written and the command rejects with `SessionInvalidNextStepError` per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) ([test](tests/session-store.scenario.l1.test.ts))
- Given stdin opening with the YAML-frontmatter delimiter `---`, when handoff is invoked, then no file is written and the command rejects with `SessionLegacyFrontmatterInputError` per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) ([test](tests/session-store.scenario.l1.test.ts))
- Given a JSON header whose bytes after the opening brace do not form a valid JSON object, when handoff is invoked, then no file is written and the command rejects with `SessionInvalidJsonHeaderError` per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) ([test](tests/session-store.scenario.l1.test.ts))
- Given a JSON header with `goal` containing the character `#`, when handoff is invoked, then the written session file's parsed `goal` equals the caller-supplied string in full ([test](tests/session-store.scenario.l1.test.ts))
- Given a JSON header with `next_step` containing the character `#`, when handoff is invoked, then the written session file's parsed `next_step` equals the caller-supplied string in full ([test](tests/session-store.scenario.l1.test.ts))
- Given a JSON header with `next_step` containing an embedded colon, when handoff is invoked, then the written session file's parsed `next_step` equals the caller-supplied string in full ([test](tests/session-store.scenario.l1.test.ts))
- Given handoff is invoked from a non-worktree repository, when the session file is created, then `branch` is the current branch reported by `git rev-parse --abbrev-ref HEAD` and `worktree` is the empty string per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) ([test](tests/session-store.scenario.l1.test.ts))
- Given handoff is invoked from a linked worktree, when the session file is created, then `worktree` is the path from the Git common-dir parent to the worktree root per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) ([test](tests/session-store.scenario.l2.test.ts))
- Given HEAD is detached, when handoff is invoked, then no file is written and the command rejects with `SessionDetachedHeadError` per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) ([test](tests/session-store.scenario.l1.test.ts))
- Given handoff is invoked, when the session file is created, then `created_at` matches `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/` per [`spx/36-session.enabler/21-timestamp-format.adr.md`](../21-timestamp-format.adr.md) ([test](tests/session-store.compliance.l1.test.ts))
- Given `CLAUDE_SESSION_ID` is set in the calling environment, when handoff creates the session file, then `agent_session_id` is written to YAML front matter with its value ([test](tests/session-store.scenario.l1.test.ts))
- Given `CLAUDE_SESSION_ID` is absent and `CODEX_THREAD_ID` is set in the calling environment, when handoff creates the session file, then `agent_session_id` is written to YAML front matter with the value of `CODEX_THREAD_ID` ([test](tests/session-store.scenario.l1.test.ts))
- Given neither `CLAUDE_SESSION_ID` nor `CODEX_THREAD_ID` is set in the calling environment, when handoff creates the session file, then `agent_session_id` does not appear in YAML front matter ([test](tests/session-store.scenario.l1.test.ts))
- Given sessions of mixed priorities in doing and todo, when list is invoked without `--status`, then doing sessions and todo sessions appear in separate groups and within each group sessions are ordered by descending priority then by ascending timestamp ([test](tests/session-store.scenario.l1.test.ts))
- Given sessions in all directories, when list `--status archive` is invoked, then only archived sessions are shown ([test](tests/session-store.scenario.l1.test.ts))
- Given sessions of mixed priorities in todo, when todo subcommand is invoked, then sessions appear in descending priority order, ties broken by ascending timestamp ([test](tests/session-store.scenario.l2.test.ts))
- Given a session exists on disk, when show is invoked through `showCommand`, then `priority`, `branch`, `worktree`, `goal`, `next_step`, `result`, and `agent_session_id` values appear in the printed output along with the session body ([test](tests/session-store.scenario.l1.test.ts))
- Given a session in any status directory, when delete is invoked through `deleteCommand`, then the file is absent from every status directory after the call returns ([test](tests/session-store.scenario.l1.test.ts))
- Given a session whose frontmatter omits structured fields (`branch`, `worktree`, `goal`, `next_step`), when list, show, pickup, or release reads the session, then the command renders the missing fields as empty strings and does not reject the session per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) ([test](tests/session-store.scenario.l1.test.ts))

### Properties

- For every input array of sessions where one or more session IDs are unparsable, `sortSessions` produces the same output array on repeated calls and unparsable-ID sessions occupy positions after every parsable-ID session of the same priority ([test](tests/session-store.scenario.l1.test.ts))
- For every JSON header with arbitrary unicode-string values for `priority` (drawn from the SESSION_PRIORITY enum), `goal`, `next_step`, and arbitrary unicode-string arrays for `specs` and `files`, the parsed metadata of the written session file equals the caller-supplied values exactly per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) ([test](tests/session-store.property.l1.test.ts))

### Compliance

- ALWAYS: `created_at` is written in ISO-8601 format with timezone offset per [`spx/36-session.enabler/21-timestamp-format.adr.md`](../21-timestamp-format.adr.md) ([test](tests/session-store.compliance.l1.test.ts))
- ALWAYS: every frontmatter key declared by [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) is read and written through `SESSION_FRONT_MATTER` constants — no string literal name appears at any call site per [`spx/36-session.enabler/37-frontmatter-key-enforcement.adr.md`](../37-frontmatter-key-enforcement.adr.md) ([test](tests/session-store.compliance.l1.test.ts))
- ALWAYS: every path component is derived from `DEFAULT_CONFIG` per [`spx/36-session.enabler/21-directory-structure.adr.md`](../21-directory-structure.adr.md) ([review])
- NEVER: hardcode status strings (`"todo"`, `"doing"`, `"archive"`) outside of `SESSION_STATUSES` and `DEFAULT_CONFIG` per [`spx/36-session.enabler/21-directory-structure.adr.md`](../21-directory-structure.adr.md) ([review])
- NEVER: a `tags` key is written to any session this PDR governs — the frontmatter shape excludes `tags` per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) ([review])
- NEVER: handoff parses caller-supplied stdin as YAML — input opening with the YAML-frontmatter delimiter is rejected with `SessionLegacyFrontmatterInputError` per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) ([test](tests/session-store.compliance.l1.test.ts))
