# Session Retention

PROVIDES archive (move to archive/ directory) and prune (retention-based deletion from archive/) for session lifecycle cleanup
SO THAT session-cli enabler
CAN offer `spx session archive` and `spx session prune` commands without reimplementing retention logic

## Assertions

### Scenarios

- Given 10 archived sessions, when prune --keep 5 is invoked, then the 5 oldest archived sessions are deleted and the 5 newest remain ([test](tests/session-retention.unit.test.ts))
- Given no --keep argument, when prune is invoked, then the default retention of 5 archived sessions applies ([test](tests/session-retention.unit.test.ts))
- Given a session in todo or doing, when archive is invoked, then the session moves to the archive directory ([test](tests/session-retention.unit.test.ts))
- Given a session already in archive, when archive is invoked, then an error indicates the session is already archived ([test](tests/session-retention.unit.test.ts))
- Given --dry-run flag, when prune --dry-run is invoked, then output shows what would be deleted without deleting anything ([test](tests/session-retention.unit.test.ts))

### Properties

- Prune never deletes sessions from todo or doing directories — only archive ([test](tests/session-retention.unit.test.ts))
- Prune with --keep N where N >= total archived sessions deletes nothing ([test](tests/session-retention.unit.test.ts))

### Compliance

- ALWAYS: use rename() for archive status transitions per ADR 21-atomic-claiming ([review](../21-atomic-claiming.adr.md))
- ALWAYS: derive path components from DEFAULT_CONFIG per ADR 21-directory-structure ([review](../21-directory-structure.adr.md))
