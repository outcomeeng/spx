# Core Session Operations

WE BELIEVE THAT providing `spx session list`, `show`, `handoff`, `delete`, and `todo` commands
WILL cause agents to use deterministic CLI operations instead of manual file manipulation for session management
CONTRIBUTING TO consistent session state and reduced context-loss errors

## Assertions

### Scenarios

- Given an empty sessions directory, when an agent pipes content to `spx session handoff`, then a session file is created in `todo/` with a timestamp ID and the `<HANDOFF_ID>` tag is emitted ([test](tests/handoff.unit.test.ts))
- Given sessions exist in doing and todo directories, when `spx session list` is invoked without `--status`, then only doing and todo sessions are shown, grouped by status and sorted by priority then timestamp ([test](tests/list-command.unit.test.ts))
- Given sessions exist in all directories, when `spx session list --status archive` is invoked, then only archived sessions are shown ([test](tests/list-command.unit.test.ts))
- Given sessions exist in todo, when `spx session todo` is invoked, then only todo sessions are shown sorted by priority then timestamp ([test](tests/list-command.integration.test.ts))
- Given a session exists, when `spx session show <id>` is invoked, then the full session content is printed with metadata header ([test](tests/show.unit.test.ts))
- Given a session exists in any status directory, when `spx session delete <id>` is invoked, then the session file is removed ([test](tests/delete.unit.test.ts))

### Properties

- Timestamp generation produces lexicographically sortable IDs matching `YYYY-MM-DD_HH-mm-ss` ([test](tests/timestamp.unit.test.ts))
- Session content without YAML front matter receives default front matter with medium priority ([test](tests/metadata.unit.test.ts))
- `SessionStatus` type and all status string references derive from `SESSION_STATUSES` constant — no hardcoded union types ([test](tests/list-command.unit.test.ts))

### Compliance

- ALWAYS: resolve session paths relative to the main repository root per PDR-15 ([review](../../15-worktree-resolution.pdr.md))
- ALWAYS: derive all path components from `DEFAULT_CONFIG` per ADR `21-directory-structure` ([review](../21-directory-structure.adr.md))
- NEVER: hardcode status strings (`"todo"`, `"doing"`, `"archive"`) outside of `SESSION_STATUSES` and `DEFAULT_CONFIG` — causes drift per ADR `21-directory-structure` ([review](../21-directory-structure.adr.md))
