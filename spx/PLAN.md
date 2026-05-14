# Plan: Current Spec Tree Refactor

## Purpose

Keep the product spec tree on the current node model and remove the deprecated task-driven model from specs, source, tests, fixtures, validation policy, and coordination files.

## Completed

- Current `spx spec status` and `spx spec next` read the `spx/` tree through the public spec-tree surface.
- Current spec-tree source, entry recognition, assembly, traversal, state derivation, and projection evidence lives under `spx/23-spec-tree.enabler/`.
- Current spec-domain command, rendering, and CLI contract evidence lives under `spx/31-spec-domain.enabler/`.
- Current spec-tree fixtures use `withSpecTreeEnv` under `testing/harnesses/spec-tree/`.
- Deprecated root spec subtrees and deleted compatibility source paths are not product truth.
- Deprecated task-model directories, stale suffix excludes, and frozen legacy specs are removed from the product tree.

## Current Tranche

- Move deterministic execution scope onto `spx.config.{toml,json,yaml}` through the shared config descriptor system.
- Add shared config primitives for repeated descriptor shapes, starting with path include/exclude filters.
- Migrate testing passing scope away from `spx/EXCLUDE` semantics and onto a testing config descriptor.
- Align file inclusion with reusable path-scope mechanics rather than domain policy.
- Align auditing with config-backed branch-scoped state under `.spx/audit/{branch-slug}`.
- Create the reviewing node through `spec-tree:decomposing` before implementing local hermetic review execution.

## Remaining Work

- Remove any remaining generic fixture names that still read like deprecated node vocabulary when they are not required for a negative validation assertion.
- Remove the ignore-source implementation and `spx/EXCLUDE` reader after testing passing scope consumes config.
- Continue splitting `src/lib/spec-tree/index.ts` internally only after the public import surface stays stable.
- Keep command modules consuming the public spec-tree surface; command modules must not parse suffixes or assemble hierarchy themselves.
- Continue reducing test-owned constant debt until `eslint.test-owned-constant-debt-nodes.json` is empty.
- Rename remaining root-directory APIs and tests from `projectRoot` / `projectDir` to `productDir` in coherent owning tranches.

## Acceptance

- No product spec-tree directory uses a deprecated node suffix.
- No source, test, fixture, or coordination file imports from deleted compatibility source paths.
- No validation rule, test helper, or public identifier uses deprecated task-model names.
- Deprecated node suffixes are rejected by lint policy without a debt manifest.
- Testing passing-scope policy is read from the testing config descriptor.
- Validation, testing, auditing, and reviewing consume shared config primitives where their descriptor shapes repeat.
- Audit state is branch-scoped under `.spx/audit/{branch-slug}`.
- Review execution has a current spec-tree node before implementation begins.
- `spx validation all` passes.
- The full package test gate passes.
