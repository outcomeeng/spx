# Session CLI

PROVIDES Commander.js bindings for all session subcommands with variadic ID parsing, per-ID result reporting, non-zero exit on any failure, and parseable `<HANDOFF_ID>`/`<PICKUP_ID>` tag emission
SO THAT agents and automation tools
CAN invoke session operations from the command line with predictable output and exit codes

## Assertions

### Scenarios

- Given three sessions in todo, when `spx session archive <id1> <id2> <id3>` is invoked, then all three sessions move to the archive directory ([test](tests/session-cli.unit.test.ts))
- Given three session IDs, when `spx session delete <id1> <id2> <id3>` is invoked, then all three session files are removed ([test](tests/session-cli.unit.test.ts))
- Given two session IDs, when `spx session show <id1> <id2>` is invoked, then both session contents are printed with separators ([test](tests/session-cli.unit.test.ts))
- Given two sessions claimed in doing, when `spx session release <id1> <id2>` is invoked, then both sessions move back to the todo directory ([test](tests/session-cli.unit.test.ts))
- Given one valid session ID in doing and one invalid session ID, when `spx session release <valid> <invalid>` is invoked, then the valid session moves to todo, the invalid one reports an error, and the command exits non-zero ([test](tests/session-cli.unit.test.ts))
- Given one valid and one invalid session ID, when `spx session archive <valid> <invalid>` is invoked, then the valid session is archived, the invalid one reports an error, and the command exits non-zero ([test](tests/session-cli.unit.test.ts))
- Given a single session ID, when any subcommand is invoked with one ID, then behavior is identical to the single-ID interface ([test](tests/session-cli.unit.test.ts))

### Properties

- The number of successfully processed sessions plus the number of errors equals the number of IDs provided ([test](tests/session-cli.unit.test.ts))
- Processing order matches argument order — IDs are processed left-to-right ([test](tests/session-cli.unit.test.ts))

### Compliance

- ALWAYS: process all provided IDs — never stop at the first error ([review])
- ALWAYS: report per-ID results so the caller knows which succeeded and which failed ([review])
- ALWAYS: exit non-zero when any ID fails — partial success is still a failure exit code ([review])
- NEVER: silently drop IDs beyond the first — all arguments are processed ([review])
