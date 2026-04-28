# Open Issues

## Root outcome node remains after enabler-only direction

`spx/46-claude.outcome/` is still a root outcome node. The `21-core-cli.capability` migration plan now treats migrated content as enabler-only, but eliminating every outcome node in the tree requires a separate root-level `/spec-tree:refactoring` pass that audits whether the Claude integration content becomes an enabler, dissolves into existing enablers, or is deleted.

**Resolution:** Track separately from `spx/PLAN.md`. Revisit before declaring the whole spec tree enabler-only.

## Test run emits unresolved YAML tag warning

`pnpm test` passes, but the run emits `[TAG_RESOLVE_FAILED] YAMLWarning: Unresolved tag: !o at line 4, column 6`.

**Resolution:** Trace the generated YAML fixture or parser input that produces `!o`. Revisit before closing the validation warning cleanup batch.

## Capability subtrees use pre-methodology suffixes and misdeclared node types

Three top-level subtrees use non-methodology directory suffixes (`.capability`, `.feature`, `.story`) and likely carry the same misapplied-outcome disease that `36-session.enabler` records (see `36-session.enabler/ISSUES.md`). Affected:

- `21-core-cli.capability/` — 3 remaining `.feature` dirs + ~30 `.story` dirs (5 `.feature` dirs renamed to `.enabler` in `b335386`; see `spx/PLAN.md` for the current config-first migration plan)
- `26-scoped-cli.capability/` — 1 feature, 2 stories
- `31-spec-domain.capability/` — index collision with `31-spec-domain.enabler/` AND pre-methodology suffixes inside

**Resolution:** Follow the current migration plan for `21-core-cli.capability`. The remaining subtrees need their own audit for (1) whether each child remains a real enabler, (2) whether junk-drawer names describe real concerns, (3) what should be renamed, dissolved, merged, or deleted.

## Spec domain under-specified

`31-spec-domain.enabler` covers the most important domain in spx — deterministic CLI operations on the spec tree (declare → spec → apply) — but has no child enablers. The CLI implements `spx spec status` and `spx spec next` in code without matching specs in the tree. The previous child `21-apply.enabler` (with `21-apply-exclude.enabler`) was deleted because its purpose (writing to project tool configuration) was rejected by the new quality-gate design where `spx test passing` and `spx validation all passing` filter at invocation time.

**Resolution:** Author specs for the existing `status` and `next` commands. Re-examine whether an `apply` CLI command belongs here (as "run the declare → spec → apply methodology step") or elsewhere. Scope: follow-up work, not part of the EXCLUDE-aware quality-gate restructure.

## PDR-11 scope does not cover testing

`spx/41-validation.enabler/11-tool-based-validation.pdr.md` governs aggregate-vs-leaf tool naming under the validation subtree. The same principle applies to `41-testing.enabler/` (aggregate tool-agnostic, leaves name tools — pytest, vitest), but the PDR's explicit scope excludes testing.

**Resolution:** Either move the PDR to product root with broader scope ("every spec under `41-validation.enabler/` and `41-testing.enabler/`"), or author a sibling PDR for testing. Scope: follow-up work.
