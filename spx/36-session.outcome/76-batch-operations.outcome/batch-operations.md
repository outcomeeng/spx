# Batch Operations

WE BELIEVE THAT accepting one or more session IDs in `archive`, `delete`, `show`, `pickup`, and `release` subcommands
WILL cause agents to manage multiple sessions in a single invocation instead of issuing repeated commands
CONTRIBUTING TO reduced token usage and faster multi-session workflows

## Assertions

### Scenarios

- Given three sessions in todo, when `spx session archive <id1> <id2> <id3>` is invoked, then all three sessions move to the archive directory ([test](tests/batch-operations.unit.test.ts))
- Given three session IDs, when `spx session delete <id1> <id2> <id3>` is invoked, then all three session files are removed ([test](tests/batch-operations.unit.test.ts))
- Given two session IDs, when `spx session show <id1> <id2>` is invoked, then both session contents are printed with separators ([test](tests/batch-operations.unit.test.ts))
- Given one valid and one invalid session ID, when `spx session archive <valid> <invalid>` is invoked, then the valid session is archived, the invalid one reports an error, and the command exits non-zero ([test](tests/batch-operations.unit.test.ts))
- Given a single session ID, when any subcommand is invoked with one ID, then behavior is identical to the current single-ID interface ([test](tests/batch-operations.unit.test.ts))

### Properties

- The number of successfully processed sessions plus the number of errors equals the number of IDs provided ([test](tests/batch-operations.unit.test.ts))
- Processing order matches argument order — IDs are processed left-to-right ([test](tests/batch-operations.unit.test.ts))

### Compliance

- ALWAYS: process all provided IDs — never stop at the first error ([review])
- ALWAYS: report per-ID results so the caller knows which succeeded and which failed ([review])
- ALWAYS: exit non-zero when any ID fails — partial success is still a failure exit code ([review])
- NEVER: silently drop IDs beyond the first — all arguments are processed ([review])
