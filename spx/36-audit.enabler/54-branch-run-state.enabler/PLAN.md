# Plan: Branch Run State

## Purpose

Implement branch-scoped audit storage and terminal run-state lookup.

## Governing Specs

- `spx/36-audit.enabler/15-audit-directory.adr.md`
- `spx/36-audit.enabler/43-audit-config.enabler/audit-config.md`
- `spx/15-worktree-resolution.pdr.md`

## Implementation Notes

- Implement branch slugging as a pure function with SHA-256 suffix and detached HEAD behavior.
- Create run directories with exclusive create and bounded retry on `EEXIST`.
- Write `state.json` exactly once at terminal completion through same-directory temp file and atomic rename.
- Select latest terminal run by `completedAt`, then `startedAt`, then run directory name.
- Keep `.spx/nodes/` explicit-file verification working without indexing it for branch status.

## Evidence Required

- Slug tests cover slashes, punctuation, collisions, empty normalized prefix, byte limit, truncation, and detached HEAD.
- Storage tests cover run id generation, bounded retries, non-collision errors, and same-directory atomic write.
- State tests cover approved, rejected, failed, interrupted, missing state, partial state, parse-invalid state, and latest-run ordering.
- Migration tests cover node-first `.spx/nodes/` explicit verification and exclusion from branch list/status.

## Parallelization

This depends on audit config defaults. Auditor execution can integrate after the state writer API exists.
