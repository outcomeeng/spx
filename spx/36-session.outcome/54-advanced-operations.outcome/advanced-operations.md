# Advanced Session Operations

WE BELIEVE THAT providing `spx session prune` and `spx session archive` commands
WILL cause agents to maintain organized session directories instead of accumulating stale sessions
CONTRIBUTING TO reduced filesystem clutter and faster session enumeration

## Assertions

### Scenarios

- Given 10 archived sessions, when `spx session prune --keep 5` is invoked, then the 5 oldest archived sessions are deleted and the 5 newest remain ([test](tests/advanced-operations.unit.test.ts))
- Given no `--keep` argument, when `spx session prune` is invoked, then the default retention of 5 archived sessions applies ([test](tests/advanced-operations.unit.test.ts))
- Given a session in todo or doing, when `spx session archive <id>` is invoked, then the session moves to the archive directory ([test](tests/advanced-operations.unit.test.ts))
- Given a session already in archive, when `spx session archive <id>` is invoked, then an error indicates the session is already archived ([test](tests/advanced-operations.unit.test.ts))
- Given `--dry-run` flag, when `spx session prune --dry-run` is invoked, then the output shows what would be deleted without deleting anything ([test](tests/advanced-operations.unit.test.ts))

### Properties

- Prune never deletes sessions from todo or doing directories — only archive ([test](tests/advanced-operations.unit.test.ts))
- Prune with `--keep N` where N >= total archived sessions deletes nothing ([test](tests/advanced-operations.unit.test.ts))
