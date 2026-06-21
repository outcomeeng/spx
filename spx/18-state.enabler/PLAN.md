# Plan: State

## Harness governance (queued)

Govern the still-ungoverned state and worktree-layout test harnesses and generators per the **Remaining harness governance program** in `spx/PLAN.md` (uniform approach, audit gates, and literal-collision lessons). This batch spans `spx/18-state.enabler` and `spx/38-worktree.enabler`; one PR.

Modules to govern (place each governing node beside its owning sub-enabler):

- `testing/harnesses/state/git-deps.ts`, `testing/harnesses/state/product-root-probe.ts`, `testing/harnesses/worktree-layout/worktree-layout.ts` → `spx/18-state.enabler/21-product-root.enabler` (some may already sit under `spx/18-state.enabler/15-state-test-harness.enabler` — **reconcile, do not duplicate**; if `15-state-test-harness.enabler` already governs them, only the ungoverned remainder needs nodes)
- `testing/harnesses/state/in-memory-file-system.ts` → `spx/18-state.enabler/71-appendable-journal-store.enabler` (also consumed by `spx/36-audit.enabler/54-branch-run-state.enabler`)
- `testing/harnesses/worktree/harness.ts`, `testing/harnesses/with-git-env.ts` → `spx/38-worktree.enabler/32-occupancy-store.enabler` (worktree harness) / `spx/21-infrastructure.enabler/43-precommit.enabler` (with-git-env — reconcile)
- `testing/generators/{state-store,worktree,main-checkout,git-worktree}/*.ts` → the same owning sub-enablers

Route: `/understand` → `/contextualize spx/18-state.enabler` (then `spx/38-worktree.enabler`) → `/author` per-module test-harness/generator enablers → `/apply` audit gates (spec-auditor + test-evidence-auditor, including the coverage gate) → `/merge`.
