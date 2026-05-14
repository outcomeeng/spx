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
   - Descriptor owns auditor selection, target filters, and storage policy.
   - Path filters use the shared config primitive when target selection needs include/exclude semantics.

2. Implement branch slugging.
   - Branch names map to filesystem-safe slugs with no path separators.
   - Slug collisions append the first eight lowercase hex characters of the SHA-256 digest of the original branch name.
   - Detached-head behavior is explicit and test-covered.

3. Move storage from node-first to branch-first.
   - Keep `spx audit verify <file>` accepting arbitrary file paths.
   - New audit runs write under `.spx/audit/{branch-slug}/runs/{timestamp}/`.
   - Existing verify-only code remains the artifact consistency check inside the broader audit lifecycle.

## Evidence Required

- Audit descriptor tests cover defaults, valid storage overrides, invalid storage values, target filters, and descriptor isolation.
- Branch slug mapping tests cover slashes, punctuation, collisions, and detached heads.
- Audit state tests cover required `state.json` fields: branch name, branch slug, head commit SHA, base ref, audit config digest, auditor identifiers, target paths, run start timestamp, run completion timestamp, verdict path, and final status.
- Storage tests prove audit state resolves through main repository root, not the worktree root.
- Verify tests prove existing explicit-file verification still works for files outside `.spx/audit/`.

## Open Coordination

- The existing audit implementation and tests still refer to `.spx/nodes/`; migrate them in the audit implementation tranche after the descriptor exists.
- Future retention behavior belongs in this node after branch-scoped storage passes.
