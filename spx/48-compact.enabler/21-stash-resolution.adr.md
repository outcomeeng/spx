# Compact Stash Resolution

The `compact` domain resolves its per-runtime stash directory `.spx/sessions/<id>/` by composing `detectGitCommonDirProductRoot` with the `DEFAULT_CONFIG` sessions path component, never through the session domain's `resolveSessionConfig`. The stash shares the one shared `.spx/` root every worktree sees per [`spx/15-worktree-resolution.pdr.md`](../15-worktree-resolution.pdr.md) while staying decoupled from the session-handoff domain.

## Rationale

The compaction stash is per-runtime continuity state that happens to live under `.spx/sessions/<id>/`; it is not a handoff-queue session. `resolveSessionConfig` couples its caller to the session domain through the `SessionDirectoryConfig` type and the `--sessions-dir` precedence, neither of which the stash needs. Composing the shared-root resolver `detectGitCommonDirProductRoot` with the `DEFAULT_CONFIG` sessions path keeps `compact` independent of the session domain while landing in the same shared `.spx/` location, so the same `<id>` directory resolves identically from a root worktree and from a linked worktree of a bare-repository pool. Reusing `resolveSessionConfig` would invert the intended decoupling and inherit queue options the compact commands do not expose.

## Verification

### Testing

- NEVER: a module under `src/domains/compact/` or `src/commands/compact/` imports `resolveSessionConfig` or `SessionDirectoryConfig` from the session domain ([compliance])
- NEVER: the compact commands expose a `--sessions-dir` or any other session-queue option — they accept only the runtime `--session-id` and, for `stash`, `--transcript` ([compliance])

### Audit

- ALWAYS: the `compact` domain resolves `.spx/sessions/<id>/` by composing `detectGitCommonDirProductRoot` with the `DEFAULT_CONFIG` sessions path component ([audit])
- ALWAYS: every `.spx/sessions/` path component the compact commands use derives from `DEFAULT_CONFIG` rather than a hardcoded string, per [`spx/36-session.enabler/21-directory-structure.adr.md`](../36-session.enabler/21-directory-structure.adr.md) ([audit])
