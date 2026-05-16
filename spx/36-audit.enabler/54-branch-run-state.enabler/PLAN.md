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

## Follow-Up Notes

- Decide whether `writeTerminalAuditRunState` should remove same-directory temporary state files if the final rename fails, or document orphaned temp files as accepted interrupted-run debris.
- Add explicit evidence for `STATE_ALREADY_EXISTS` double-write prevention when the terminal state writer is next expanded.
- Add explicit evidence for non-`ENOENT` `readdir` failure propagation in `readAuditBranchRuns` when branch listing behavior is next expanded.
- Revisit `AUDIT_RUN_STATE_TEST_GENERATOR.timestampDate()` before Q4 2026 so the generator's max date remains useful for future audit-run timestamps.

## Parallelization

This depends on audit config defaults. Auditor execution can integrate after the state writer API exists.

The C1 canonical descriptor digest dependency is a hard prerequisite for branch-run-state implementation; do not branch A2 until `spx/16-config.enabler/54-canonical-descriptor-digest.enabler/canonical-descriptor-digest.md` exists on `origin/main`.

## Agent Pickup Prompt

```text
Before branching, follow the common packet rules in `spx/16-config.enabler/PLAN.md`, including the branch-existence guard and settled-prerequisite checks.

Start from fresh origin/main on work/audit-branch-run-state after the audit descriptor shape is available. Invoke spec-tree:understanding if needed, then spec-tree:contextualizing for spx/36-audit.enabler/54-branch-run-state.enabler/. Read this PLAN and the governing specs it names. Invoke spec-tree:applying, spec-tree:testing, typescript:testing-typescript, and typescript:coding-typescript before edits.

Before branching, verify `git cat-file -e origin/main:spx/36-audit.enabler/43-audit-config.enabler/audit-config.md` and `git cat-file -e origin/main:spx/16-config.enabler/54-canonical-descriptor-digest.enabler/canonical-descriptor-digest.md` succeed for the A1 and C1 artifacts. Implement branch slugging, exclusive run-directory creation, terminal `state.json` writing through same-directory temp file plus atomic rename, and latest terminal run lookup. Preserve explicit-file verification for node-first `.spx/nodes/` artifacts without indexing them for branch status. Prove slug byte limits, SHA-256 suffix preservation, detached HEAD identity, collision retry, terminal statuses, incomplete evidence, parse-invalid state, and latest-run ordering. Open one PR and ask reviewers to audit filesystem safety and terminal-state semantics.
```
