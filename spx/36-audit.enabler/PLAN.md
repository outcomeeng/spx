# Plan: Config-Backed Branch Audit

## Purpose

Move audit from verify-only artifact checking toward config-backed, branch-scoped audit execution and persisted audit state under `.spx/branch/{branch-slug}/audit/`.

## Governing Decisions

- `spx/36-audit.enabler/11-audit-scope.pdr.md` owns audit domain scope.
- `spx/36-audit.enabler/15-audit-directory.adr.md` owns branch-scoped audit storage.
- `spx/16-config.enabler/21-descriptor-registration.adr.md` owns the audit descriptor registration mechanism.
- `spx/15-worktree-management.pdr.md` owns main-repository-root resolution for gitignored `.spx/` state.

## Current Tranche

1. Settled on `origin/main`: audit config descriptor.
   - `spx/36-audit.enabler/43-audit-config.enabler/` owns storage defaults, auditor selection, base ref, target filters, and storage policy.

2. Settled on `origin/main`: branch slugging and branch-scoped run state.
   - `spx/36-audit.enabler/54-branch-run-state.enabler/` consumes state-store branch slugging and run-file creation, binds the appendable journal store to append and seal the run, and folds the `AuditRunState` projection for latest-run lookup.

3. Expose reporting through `spx/36-audit.enabler/87-audit-status.enabler/`.
   - Surface run journals without a terminal-completion event as incomplete/interrupted rather than silently dropping them.

4. Execute configured auditors.
   - Work in `spx/36-audit.enabler/65-auditor-execution.enabler/`.
   - Resolve auditors, targets, and base ref before launch.
   - Keep auditor execution hermetically separated from the invoking agent.

## Evidence Required

- Audit descriptor tests cover defaults, base ref, auditors, target filters, and descriptor isolation.
- Branch slug mapping tests cover slashes, punctuation, collisions, and detached heads.
- Branch slug mapping tests cover the 120-byte limit and prove the SHA-256 suffix is preserved after truncation.
- Run-journal tests cover the `AuditRunState` fields folded from the completed event: branch name, branch slug, head commit SHA, resolved base ref, audit config digest, auditor identifiers, target paths, run start timestamp, run completion timestamp, optional output path, and terminal status.
- Run-journal tests prove a run folds to a terminal `AuditRunState` only when its journal is sealed and holds a completed event, and that a duplicate terminal write is rejected once the journal is sealed.
- Run-journal tests prove malformed or unsealed run journals fold to `MISSING_STATE` and appear as incomplete in list and status output, never satisfying latest terminal audit status when a terminal run exists.
- Run-journal tests prove latest terminal lookup orders by completion timestamp, then start timestamp, then run-file name.
- Storage tests prove run file creation retries `EEXIST` collisions up to ten times and fails on non-collision creation errors.
- Status tests prove persisted lowercase status tokens render through the explicit persisted-status-to-display mapping.
- Audit config digest tests prove the digest is computed from config-owned canonical descriptor JSON for the resolved audit config descriptor section after defaults are applied.
- Audit base-ref tests prove the state file records `main` when no config override exists and records the configured value when `audit.baseRef` is set.
- Storage tests prove audit state resolves through the Git common-dir product root, not the worktree root.

## Open Coordination

- Retention behavior belongs in this node after branch-scoped storage passes.

## Gate Dependencies

The central packet table in `spx/16-config.enabler/PLAN.md` is authoritative; this section is a local reminder only.

- `spx/36-audit.enabler/65-auditor-execution.enabler/` consumes settled `spx/33-agent-environment.enabler/32-runtime-config.enabler/` runtime config reconciliation.
