# Session Store

PROVIDES directory-backed CRUD primitives (list, show, create, delete, handoff) for session files
SO THAT session-claim, session-retention, and session-cli enablers
CAN enumerate, read, write, and remove sessions without reimplementing filesystem access or directory traversal

## Assertions

### Scenarios

- Given an empty sessions directory, when content is piped to handoff, then a session file is created in todo/ with a timestamp ID and the `<HANDOFF_ID>` tag is emitted ([test](tests/session-store.scenario.l1.test.ts))
- Given empty or whitespace-only content piped to handoff, when validated, then handoff rejects the content with an error ([test](tests/session-store.scenario.l1.test.ts))
- Given handoff is invoked, when the session file is created, then `created_at` is written to YAML front matter as an ISO 8601 timestamp with timezone offset ([test](tests/session-store.scenario.l1.test.ts))
- Given `CLAUDE_SESSION_ID` is set in the calling environment, when handoff creates the session file, then `agent_session_id` is written to YAML front matter with its value ([test](tests/session-store.scenario.l1.test.ts))
- Given `CLAUDE_SESSION_ID` is absent and `CODEX_THREAD_ID` is set in the calling environment, when handoff creates the session file, then `agent_session_id` is written to YAML front matter with the value of `CODEX_THREAD_ID` ([test](tests/session-store.scenario.l1.test.ts))
- Given neither `CLAUDE_SESSION_ID` nor `CODEX_THREAD_ID` is set in the calling environment, when handoff creates the session file, then `agent_session_id` does not appear in YAML front matter ([test](tests/session-store.scenario.l1.test.ts))
- Given sessions in doing and todo, when list is invoked without --status, then only doing and todo sessions are shown, grouped by status and sorted by priority then timestamp ([test](tests/session-store.scenario.l1.test.ts))
- Given sessions in all directories, when list --status archive is invoked, then only archived sessions are shown ([test](tests/session-store.scenario.l1.test.ts))
- Given sessions in todo, when todo is invoked, then only todo sessions are shown sorted by priority then timestamp ([test](tests/session-store.scenario.l2.test.ts))
- Given a session exists, when show is invoked, then full session content is printed with metadata header ([test](tests/session-store.scenario.l1.test.ts))
- Given a session in any status directory, when delete is invoked, then the session file is removed ([test](tests/session-store.scenario.l1.test.ts))

### Properties

- Session sorting is deterministic when session file names do not match the timestamp pattern: sessions with unparsable IDs occupy stable positions relative to valid-ID sessions ([test](tests/session-store.scenario.l1.test.ts))

### Compliance

- ALWAYS: write `created_at` in ISO 8601 format with timezone offset per ADR 21-timestamp-format ([test](tests/session-store.compliance.l1.test.ts))
- ALWAYS: derive all path components from DEFAULT_CONFIG per ADR 21-directory-structure ([review](../21-directory-structure.adr.md))
- NEVER: hardcode status strings ("todo", "doing", "archive") outside of SESSION_STATUSES and DEFAULT_CONFIG per ADR 21-directory-structure ([review](../21-directory-structure.adr.md))
