# Open Issues

## Missing product spec

`spx/spx.product.md` does not exist. The `/spec-tree:contextualizing` workflow requires it. Skipped during migration Phase 0 to unblock test consolidation.

**Resolution:** Invoke `/spec-tree:authoring` to create `spx/spx.product.md` derived from `specs/work/spx-platform.prd.md`.

## Capability subtrees use pre-methodology suffixes and misdeclared node types

Three top-level subtrees use non-methodology directory suffixes (`.capability`, `.feature`, `.story`) and likely carry the same misapplied-outcome disease that `36-session.outcome` exhibits (see `36-session.outcome/ISSUES.md`). Affected:

- `21-core-cli.capability/` — 8 features, 27 stories, all using pre-methodology suffixes
- `26-scoped-cli.capability/` — 1 feature, 2 stories
- `31-spec-domain.capability/` — BSP collision with `31-spec-domain.outcome/` AND pre-methodology suffixes inside

**Resolution:** Defer to a future structural normalization initiative. The migration plan is explicit: structural cleanup of these subtrees is OUT OF SCOPE for the test consolidation work. Each subtree needs its own audit for (1) whether children are real outcomes or should be enablers, (2) whether junk-drawer names like "core-cli" describe real concerns, (3) what should be renamed vs dissolved vs merged.
