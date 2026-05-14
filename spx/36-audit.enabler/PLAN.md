# Plan: Config-Backed Branch Audit

## Purpose

Move audit from verify-only artifact checking toward config-backed, branch-scoped audit execution and persisted audit state under `.spx/audit/{branch-slug}`.

## Governing Decisions

- `spx/36-audit.enabler/11-audit-scope.pdr.md` owns audit domain scope.
- `spx/36-audit.enabler/15-audit-directory.adr.md` owns branch-scoped audit storage.
- `spx/16-config.enabler/21-descriptor-registration.adr.md` owns the audit descriptor registration mechanism.
- `spx/15-worktree-resolution.pdr.md` owns main-repository-root resolution for gitignored `.spx/` state.

## Current Tranche

1. Add an audit config descriptor.
   - Defaults include `.spx`, `audit`, `runs`, verdict filenames, and state filenames.
   - Descriptor owns auditor selection, base ref, target filters, and storage policy.
   - Default `audit.baseRef` to `main` when no config override is present.
   - Path filters use the shared config primitive when target selection needs include/exclude semantics.

2. Implement branch slugging.
   - Branch names map to filesystem-safe slugs with no path separators.
   - Branch slugs always append the first eight lowercase hex characters of the SHA-256 digest of the original branch identity.
   - SHA-256 uses Node.js `node:crypto`; do not add a third-party crypto dependency.
   - Detached HEAD state uses `detached-{short-sha}` as the branch identity and is test-covered.

3. Move storage from node-first to branch-first.
   - Keep `spx audit verify <file>` accepting arbitrary file paths.
   - Keep explicit-file verification working for existing `.spx/nodes/` verdict artifacts.
   - New audit runs write under `.spx/audit/{branch-slug}/runs/{timestamp}/`.
   - Write `state.json` once per run after the terminal status is known.
   - Surface run directories without `state.json` as incomplete/interrupted rather than silently dropping them.
   - Existing verify-only code remains the artifact consistency check inside the broader audit lifecycle.

## Evidence Required

- Audit descriptor tests cover defaults, valid storage overrides, invalid storage values, target filters, and descriptor isolation.
- Branch slug mapping tests cover slashes, punctuation, collisions, and detached heads.
- Audit state tests cover required `state.json` fields: branch name, branch slug, head commit SHA, resolved audit descriptor base ref, audit config digest, auditor identifiers, target paths, run start timestamp, run completion timestamp, optional verdict path, and terminal status.
- Audit state tests prove `state.json` is absent for in-progress runs and written exactly once for `approved`, `rejected`, `failed`, or `interrupted` runs.
- Audit state tests prove run directories missing `state.json` appear as incomplete/interrupted in list and status output and do not satisfy latest terminal audit status when a terminal run exists.
- Audit state tests prove persisted status casing is lowercase and CLI verdict rendering remains a display concern.
- Audit config digest tests prove the digest is computed from config-owned canonical descriptor JSON for the resolved audit config descriptor section after defaults are applied.
- Audit base-ref tests prove the state file records `main` when no config override exists and records the configured value when `audit.baseRef` is set.
- Storage tests prove audit state resolves through main repository root, not the worktree root.
- Verify tests prove existing explicit-file verification still works for files outside `.spx/audit/`, including old `.spx/nodes/` artifacts.

## Open Coordination

- The existing audit implementation and tests still refer to `.spx/nodes/`; before adding branch-scoped storage evidence, update or delete tests that assert `.spx/nodes/` as the default storage path while preserving explicit-file verification for old `.spx/nodes/` verdict artifacts.
- Future retention behavior belongs in this node after branch-scoped storage passes.
