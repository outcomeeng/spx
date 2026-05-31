# Session CLI

PROVIDES Commander.js bindings for all session subcommands with variadic ID parsing, per-ID result reporting, non-zero exit on any failure, and parseable `<HANDOFF_ID>`/`<PICKUP_ID>` tag emission
SO THAT agents and automation tools
CAN invoke session operations from the command line with predictable output and exit codes

Frontmatter-validation and handoff-input errors raised by the underlying commands (`SessionInvalidContentError`, `SessionInvalidGoalError`, `SessionInvalidNextStepError`, `SessionInvalidResultError`, `SessionLegacyFrontmatterInputError`, `SessionInvalidJsonHeaderError`) per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) propagate through the binding as non-zero exits with a diagnostic line on stderr.

## Assertions

### Scenarios

- Given three sessions in `todo` with valid `result` fields, when `spx session archive <id1> <id2> <id3>` is executed through `node bin/spx.js`, then all three sessions appear in `archive/` after the process exits and the process exit code is 0 ([test](tests/session-cli.scenario.l2.test.ts))
- Given a non-canonical session whose frontmatter does not parse into the canonical shape, when `spx session archive <id>` is executed through `node bin/spx.js`, then the session appears in `archive/` after the process exits, no `SessionInvalidResultError` is written to stderr, and the process exit code is 0 per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) ([test](tests/session-cli.scenario.l2.test.ts))
- Given three session IDs, when `spx session delete <id1> <id2> <id3>` is executed through `node bin/spx.js`, then no file with any of the three IDs is present in `todo/`, `doing/`, or `archive/` after the process exits ([test](tests/session-cli.scenario.l2.test.ts))
- Given two session IDs, when `spx session show <id1> <id2>` is executed through `node bin/spx.js`, then both session bodies appear in stdout separated by the canonical separator declared in `SESSION_SHOW_SEPARATOR_CHAR` ([test](tests/session-cli.scenario.l2.test.ts))
- Given two sessions claimed in `doing`, when `spx session release <id1> <id2>` is executed through `node bin/spx.js`, then both sessions appear in `todo/` after the process exits ([test](tests/session-cli.scenario.l2.test.ts))
- Given two sessions in `todo`, when `spx session pickup <id1> <id2>` is executed through `node bin/spx.js`, then both sessions appear in `doing/` after the process exits and a `<PICKUP_ID>` tag is emitted for each ([test](tests/session-cli.scenario.l2.test.ts))
- Given one session ID in `doing` and one invalid session ID, when `spx session release <valid> <invalid>` is executed through `node bin/spx.js`, then the valid session appears in `todo/`, an error line naming the invalid ID is written to stderr, and the process exits non-zero ([test](tests/session-cli.scenario.l2.test.ts))
- Given one valid session ID and one ID that fails its operation, when `spx session archive <valid> <failing>` is executed through `node bin/spx.js`, then the valid session is archived, an error line naming the failing ID is written to stderr, and the process exits non-zero ([test](tests/session-cli.scenario.l2.test.ts))
- Given a JSON header that omits `goal`, when `spx session handoff` is executed through `node bin/spx.js`, then no file is written, a diagnostic line naming `SessionInvalidGoalError` is written to stderr, and the process exits non-zero ([test](tests/session-cli.compliance.l2.test.ts))
- Given stdin opening with the YAML-frontmatter delimiter `---`, when `spx session handoff` is executed through `node bin/spx.js`, then no file is written, a diagnostic line naming `SessionLegacyFrontmatterInputError` is written to stderr, and the process exits non-zero per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) ([test](tests/session-cli.compliance.l2.test.ts))
- Given a malformed JSON header (opens with `{` but is not a valid JSON object), when `spx session handoff` is executed through `node bin/spx.js`, then no file is written, a diagnostic line naming `SessionInvalidJsonHeaderError` is written to stderr, and the process exits non-zero per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) ([test](tests/session-cli.compliance.l2.test.ts))
- Given a JSON header followed by body bytes with leading and trailing whitespace, when `spx session handoff` is executed through `node bin/spx.js`, then the written session file preserves those body bytes after the JSON-prefix separator per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) ([test](tests/session-cli.compliance.l2.test.ts))
- Given a canonical session whose `result` is empty, when `spx session archive <id>` is executed through `node bin/spx.js`, then no file is moved, a diagnostic line naming `SessionInvalidResultError` is written to stderr, and the process exits non-zero ([test](tests/session-cli.compliance.l2.test.ts))
- Given HEAD is detached, when `spx session handoff` is executed through `node bin/spx.js`, then no file is written, a diagnostic line naming `SessionDetachedHeadError` is written to stderr, and the process exits non-zero per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) ([test](tests/session-cli.compliance.l2.test.ts))
- Given a single session ID, when any subcommand (`archive`, `delete`, `show`, `pickup`, `release`) is invoked with that ID, then behavior matches the single-ID interface — one `<HANDOFF_ID>` or `<PICKUP_ID>` tag emitted as applicable, one operation performed ([test](tests/session-cli.scenario.l2.test.ts))

### Properties

- For every input list of session IDs `[id_1, ..., id_n]` produced by `arbitraryBatchInputs(n, validCount)` (with `n >= 1` and `0 <= validCount <= n`), running the variadic subcommand through `node bin/spx.js` produces exactly `validCount` success outputs and `n - validCount` error lines on stderr ([test](tests/session-cli.property.l2.test.ts))
- For every input list of session IDs `[id_1, ..., id_n]`, the order of per-ID result outputs in stdout and stderr matches the order of `id_1, ..., id_n` on the command line ([test](tests/session-cli.property.l2.test.ts))

### Compliance

- ALWAYS: every variadic subcommand processes all provided IDs even when an earlier ID fails — partial failures do not halt processing ([test](tests/session-cli.compliance.l2.test.ts))
- ALWAYS: per-ID success and failure outputs identify the ID so the caller can map results back to inputs ([review])
- ALWAYS: the process exits with a non-zero code when any ID fails — partial success is still a failure exit code ([test](tests/session-cli.compliance.l2.test.ts))
- ALWAYS: diagnostic lines for `SessionInvalidContentError`, `SessionInvalidGoalError`, `SessionInvalidNextStepError`, `SessionInvalidResultError`, `SessionDetachedHeadError`, `SessionLegacyFrontmatterInputError`, and `SessionInvalidJsonHeaderError` per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) include the error name and the offending session ID (when applicable) ([test](tests/session-cli.compliance.l2.test.ts))
- ALWAYS: `spx session archive` moves a non-canonical session to `archive/` without emitting `SessionInvalidResultError` — the binding propagates the non-canonical archive path per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) ([test](tests/session-cli.compliance.l2.test.ts))
- NEVER: a variadic subcommand silently drops IDs beyond the first — every argument is processed ([test](tests/session-cli.compliance.l2.test.ts))
