# Plan: Config-Backed Branch Audit

## Purpose

Move audit from verify-only artifact checking toward config-backed, branch-scoped audit execution and persisted audit state under `.spx/audit/{branch-slug}`.

## Governing Decisions

- `spx/36-audit.enabler/11-audit-scope.pdr.md` owns audit domain scope.
- `spx/36-audit.enabler/15-audit-directory.adr.md` owns branch-scoped audit storage.
- `spx/16-config.enabler/21-descriptor-registration.adr.md` owns the audit descriptor registration mechanism.
- `spx/15-worktree-resolution.pdr.md` owns main-repository-root resolution for gitignored `.spx/` state.

## Current Tranche

1. Settled on `origin/main`: audit config descriptor.
   - `spx/36-audit.enabler/43-audit-config.enabler/` owns storage defaults, auditor selection, base ref, target filters, and storage policy.

2. Settled on `origin/main`: branch slugging and branch-scoped run state.
   - `spx/36-audit.enabler/54-branch-run-state.enabler/` owns branch slugging, exclusive run-directory creation, terminal state writes, and latest-run lookup.

3. Expose reporting through `spx/36-audit.enabler/87-audit-status.enabler/`.
   - Keep `spx audit verify <file>` accepting arbitrary file paths.
   - Keep explicit-file verification working for node-first `.spx/nodes/` verdict artifacts.
   - Surface run directories without `state.json` as incomplete/interrupted rather than silently dropping them.
   - Verify-only code remains the artifact consistency check inside the broader audit lifecycle.

4. Execute configured auditors.
   - Work in `spx/36-audit.enabler/65-auditor-execution.enabler/`.
   - Resolve auditors, targets, base ref, and storage before launch.
   - Keep auditor execution hermetically separated from the invoking agent.

## Evidence Required

- Audit descriptor tests cover defaults, valid storage overrides, invalid storage values, target filters, and descriptor isolation.
- Branch slug mapping tests cover slashes, punctuation, collisions, and detached heads.
- Branch slug mapping tests cover the 120-byte limit and prove the SHA-256 suffix is preserved after truncation.
- Audit state tests cover required `state.json` fields: branch name, branch slug, head commit SHA, resolved audit descriptor base ref, audit config digest, auditor identifiers, target paths, run start timestamp, run completion timestamp, optional verdict path, and terminal status.
- Audit state tests prove `state.json` is absent for in-progress runs and written exactly once for `approved`, `rejected`, `failed`, or `interrupted` runs.
- Audit state tests prove terminal `state.json` writes use a same-directory temporary file followed by atomic rename to the final path and that only the exclusive-created run directory owner writes the state file.
- Audit state tests prove run directories with missing, partial, or parse-invalid `state.json` appear as incomplete/interrupted in list and status output and do not satisfy latest terminal audit status when a terminal run exists.
- Audit state tests prove `status: "interrupted"` represents graceful terminal cancellation, while missing, partial, or parse-invalid `state.json` represents non-terminal incomplete evidence.
- Audit state tests prove latest terminal lookup uses `state.json` timestamps before directory-name tie-breakers.
- Storage tests prove run directory creation retries `EEXIST` collisions up to ten times and fails on non-collision creation errors.
- Audit state tests prove persisted status casing is lowercase and CLI status rendering follows the explicit persisted-status-to-display mapping.
- Audit config digest tests prove the digest is computed from config-owned canonical descriptor JSON for the resolved audit config descriptor section after defaults are applied.
- Audit base-ref tests prove the state file records `main` when no config override exists and records the configured value when `audit.baseRef` is set.
- Compatibility tests prove node-first `.spx/nodes/` verdict artifacts remain valid explicit-file verification inputs but are not indexed by branch-scoped audit list/status views.
- Storage tests prove audit state resolves through the Git common-dir product root, not the worktree root.
- Verify tests prove explicit-file verification still works for files outside `.spx/audit/`, including node-first `.spx/nodes/` artifacts.

## Open Coordination

- Audit implementation and tests still refer to `.spx/nodes/`; before adding branch-scoped storage evidence, update or delete tests that assert `.spx/nodes/` as the default storage path while preserving explicit-file verification for node-first `.spx/nodes/` verdict artifacts.
- Retention behavior belongs in this node after branch-scoped storage passes.

## Gate Dependencies

The central packet table in `spx/16-config.enabler/PLAN.md` is authoritative; this section is a local reminder only.

- `spx/36-audit.enabler/65-auditor-execution.enabler/` consumes settled `spx/33-agent-environment.enabler/32-runtime-config.enabler/` runtime config reconciliation.
