# Plan: Current Spec Tree Refactor

## Purpose

Keep the product spec tree on the current node model and remove the deprecated task-driven model from specs, source, tests, fixtures, validation policy, and coordination files.

## Completed

- Current `spx spec status` and `spx spec next` read the `spx/` tree through the public spec-tree surface.
- Current spec-tree source, entry recognition, assembly, traversal, state derivation, and projection evidence lives under `spx/23-spec-tree.enabler/`.
- Current spec-domain command, rendering, and CLI contract evidence lives under `spx/31-spec-domain.enabler/`.
- Current spec-tree fixtures use `withSpecTreeEnv` under `testing/harnesses/spec-tree/`.
- Deprecated root spec subtrees and deleted compatibility source paths are not product truth.

## Current Tranche

- Delete deprecated node directories and deleted-source fixtures rather than migrating them in place.
- Remove the deprecated suffix debt manifest and make deprecated node suffixes fail lint policy directly.
- Rename validation rules so they enforce current spec-tree node kinds and node states.
- Remove stale migration notes, excludes, fixtures, and issue entries that preserve the deprecated model.
- Verify `spx validation all` and the full package test gate after the deletion pass.

## Remaining Work

- Remove any remaining generic fixture names that still read like deprecated node vocabulary when they are not required for a negative validation assertion.
- Remove `spx/EXCLUDE` entries whose target nodes now have current evidence and implementation.
- Continue splitting `src/lib/spec-tree/index.ts` internally only after the public import surface stays stable.
- Keep command modules consuming the public spec-tree surface; command modules must not parse suffixes or assemble hierarchy themselves.
- Continue reducing test-owned constant debt until `eslint.test-owned-constant-debt-nodes.json` is empty.

## Acceptance

- No product spec-tree directory uses a deprecated node suffix.
- No source, test, fixture, or coordination file imports from deleted compatibility source paths.
- No validation rule, test helper, or public identifier uses deprecated task-model names.
- Deprecated node suffixes are rejected by lint policy without a debt manifest.
- `spx validation all` passes.
- The full package test gate passes.
