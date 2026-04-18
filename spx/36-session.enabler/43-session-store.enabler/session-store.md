# Session Store

PROVIDES directory-backed CRUD primitives (list, show, create, delete, handoff) for session files
SO THAT session-claim, session-retention, and session-cli enablers
CAN enumerate, read, write, and remove sessions without reimplementing filesystem access or directory traversal

## Assertions

### Scenarios

- Given an empty sessions directory, when content is piped to handoff, then a session file is created in todo/ with a timestamp ID and the `<HANDOFF_ID>` tag is emitted ([test](tests/session-store.unit.test.ts))
- Given sessions in doing and todo, when list is invoked without --status, then only doing and todo sessions are shown, grouped by status and sorted by priority then timestamp ([test](tests/session-store.unit.test.ts))
- Given sessions in all directories, when list --status archive is invoked, then only archived sessions are shown ([test](tests/session-store.unit.test.ts))
- Given sessions in todo, when todo is invoked, then only todo sessions are shown sorted by priority then timestamp ([test](tests/session-store.integration.test.ts))
- Given a session exists, when show is invoked, then full session content is printed with metadata header ([test](tests/session-store.unit.test.ts))
- Given a session in any status directory, when delete is invoked, then the session file is removed ([test](tests/session-store.unit.test.ts))

### Compliance

- ALWAYS: derive all path components from DEFAULT_CONFIG per ADR 21-directory-structure ([review](../21-directory-structure.adr.md))
- NEVER: hardcode status strings ("todo", "doing", "archive") outside of SESSION_STATUSES and DEFAULT_CONFIG per ADR 21-directory-structure ([review](../21-directory-structure.adr.md))
