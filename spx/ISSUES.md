# Open Issues

## Capability subtrees use pre-methodology suffixes and misdeclared node types

Three top-level subtrees use non-methodology directory suffixes (`.capability`, `.feature`, `.story`) and likely carry the same misapplied-outcome disease that `36-session.outcome` exhibits (see `36-session.outcome/ISSUES.md`). Affected:

- `21-core-cli.capability/` — 8 features, 27 stories, all using pre-methodology suffixes
- `26-scoped-cli.capability/` — 1 feature, 2 stories
- `31-spec-domain.capability/` — index collision with `31-spec-domain.enabler/` AND pre-methodology suffixes inside

**Resolution:** Defer to a future structural normalization initiative. The migration plan is explicit: structural cleanup of these subtrees is OUT OF SCOPE for the test consolidation work. Each subtree needs its own audit for (1) whether children are real outcomes or should be enablers, (2) whether junk-drawer names like "core-cli" describe real concerns, (3) what should be renamed vs dissolved vs merged.

## Spec domain under-specified

`31-spec-domain.enabler` covers the most important domain in spx — deterministic CLI operations on the spec tree (declare → spec → apply) — but has no child enablers. The CLI implements `spx spec status` and `spx spec next` in code without matching specs in the tree. The previous child `21-apply.enabler` (with `21-apply-exclude.enabler`) was deleted because its purpose (writing to project tool configuration) was rejected by the new quality-gate design where `spx test passing` and `spx validation all passing` filter at invocation time.

**Resolution:** Author specs for the existing `status` and `next` commands. Re-examine whether an `apply` CLI command belongs here (as "run the declare → spec → apply methodology step") or elsewhere. Scope: follow-up work, not part of the EXCLUDE-aware quality-gate restructure.

## PDR-11 scope does not cover testing

`spx/41-validation.enabler/11-tool-based-validation.pdr.md` governs aggregate-vs-leaf tool naming under the validation subtree. The same principle applies to `41-testing.enabler/` (aggregate tool-agnostic, leaves name tools — pytest, vitest), but the PDR's explicit scope excludes testing.

**Resolution:** Either move the PDR to product root with broader scope ("every spec under `41-validation.enabler/` and `41-testing.enabler/`"), or author a sibling PDR for testing. Scope: follow-up work.
