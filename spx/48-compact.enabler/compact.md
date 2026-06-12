# Compact

PROVIDES the `spx compact stash` and `spx compact resume` commands — `stash` extracts the active spec-tree node and foundation state from a conversation transcript into a numbered, append-only per-runtime stash under `.spx/sessions/<id>/`, and `resume` returns the most recent stash as JSON
SO THAT the spec-tree PreCompact and PostCompact hooks
CAN re-anchor an agent on its active node after context compaction without re-deriving it from the compaction summary

## Assertions

### Scenarios

- Given a transcript containing a `SPEC_TREE_FOUNDATION` marker and one or more `SPEC_TREE_CONTEXT target="spx/..."` markers, when `spx compact stash --session-id <id> --transcript <path>` runs, then `.spx/sessions/<id>/compact-stash-1.json` is written carrying the path from the last `SPEC_TREE_CONTEXT` marker as `active_node` and `has_foundation` true ([test](tests/compact.scenario.l2.test.ts))
- Given a transcript whose markers are JSON-string-escaped as `target=\"spx/...\"`, when `spx compact stash` runs, then the escaped quote is tolerated and `active_node` is the extracted `spx/...` path ([test](tests/compact.scenario.l1.test.ts))
- Given a transcript carrying a `SPEC_TREE_FOUNDATION` marker but no `SPEC_TREE_CONTEXT target=` marker, when `spx compact stash` runs, then a stash record is written with `active_node` empty and `has_foundation` true ([test](tests/compact.scenario.l1.test.ts))
- Given a transcript with no `SPEC_TREE_FOUNDATION` marker, when `spx compact stash` runs, then no file is written under `.spx/sessions/<id>/` and the process exits 0 ([test](tests/compact.scenario.l2.test.ts))
- Given `.spx/sessions/<id>/` already holds `compact-stash-1.json` through `compact-stash-K.json`, when `spx compact stash` runs with a foundation-bearing transcript, then `compact-stash-(K+1).json` is written and every existing record is left unchanged ([test](tests/compact.scenario.l2.test.ts))
- Given `.spx/sessions/<id>/` holds one or more `compact-stash-*.json` records, when `spx compact resume --session-id <id>` runs, then the JSON of the highest-numbered record is printed to stdout and the process exits 0 ([test](tests/compact.scenario.l2.test.ts))
- Given `.spx/sessions/<id>/` holds no `compact-stash-*.json` record, when `spx compact resume --session-id <id>` runs, then nothing is printed to stdout and the process exits non-zero ([test](tests/compact.scenario.l2.test.ts))
- Given `spx compact stash` runs from a directory outside any git repository, when it resolves the stash directory, then it falls back to that directory and surfaces the non-git-repo fallback warning per [`spx/15-worktree-resolution.pdr.md`](../15-worktree-resolution.pdr.md) ([test](tests/compact.scenario.l2.test.ts))

### Properties

- For any transcript, the extracted `active_node` equals the path of the last `SPEC_TREE_CONTEXT target=` occurrence regardless of how many precede it ([test](tests/compact.property.l1.test.ts))
- For any sequence of N foundation-bearing `stash` invocations against one `.spx/sessions/<id>/`, the records are numbered `1` through `N` with no gaps and no overwrite ([test](tests/compact.property.l1.test.ts))

### Compliance

- ALWAYS: `spx compact stash` and `spx compact resume` resolve `.spx/sessions/<id>/` to the same shared Git common-dir location from a root worktree and from a linked worktree of a bare-repository pool per [`spx/15-worktree-resolution.pdr.md`](../15-worktree-resolution.pdr.md) ([test](tests/compact.compliance.l2.test.ts))
- ALWAYS: a written stash record is a JSON object carrying exactly `active_node` and `has_foundation` ([test](tests/compact.scenario.l1.test.ts))
- NEVER: `spx compact stash` overwrites or rewrites an existing `compact-stash-*.json` record — each invocation appends a new numbered record ([test](tests/compact.scenario.l2.test.ts))
- NEVER: the compact commands read or write the session-queue directories `todo/`, `doing/`, or `archive/` — the stash is per-runtime continuity state, not a handoff-queue session ([test](tests/compact.compliance.l2.test.ts))
- NEVER: the compact commands expose a `--sessions-dir` or any other session-queue option — they accept only `--session-id` and, for `stash`, `--transcript`, per [`spx/48-compact.enabler/21-stash-resolution.adr.md`](21-stash-resolution.adr.md) ([test](tests/compact.compliance.l2.test.ts))
- NEVER: a module under `src/domains/compact/` or `src/commands/compact/` imports `resolveSessionConfig` or `SessionDirectoryConfig` from the session domain, per [`spx/48-compact.enabler/21-stash-resolution.adr.md`](21-stash-resolution.adr.md) ([test](tests/compact.compliance.l1.test.ts))
- NEVER: the compact commands resolve a `--session-id` containing a path separator or a `.`/`..` segment — a traversal id is rejected before any filesystem access so the stash cannot escape `.spx/sessions/` ([test](tests/compact.compliance.l2.test.ts))
