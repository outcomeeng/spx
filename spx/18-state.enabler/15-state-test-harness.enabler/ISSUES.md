# Issues: State Test Harness

## The nested-layout scenario restates the generator's minimum level count

**Evidence**

- `spx/18-state.enabler/15-state-test-harness.enabler/tests/nested-product-layout.scenario.l1.test.ts` asserts that the count of levels with a placed `spx.config.*` and product spec is greater than or equal to the literal `2`.
- `MIN_LEVELS_WITH_DISTINCT_ENDS` is declared, unexported, as `2` in `testing/generators/state/nested-product-layout.ts`. The generator passes it as the minimum level count of the layout whose invocation level and repository root both place those files.

**Impact**

A change to the generator's minimum leaves the scenario's guard stale: the literal in the test no longer matches the generator's bound, and the guard either rejects valid layouts or admits layouts below the bound.

**Settlement condition**

The generator exports `MIN_LEVELS_WITH_DISTINCT_ENDS`, and the scenario imports it in place of the literal `2`.

## The nested-layout property uses "local product root" ahead of the decision that defines it `spx/18-state.enabler/15-state-test-harness.enabler/state-test-harness.md` `the property "For every generated nested-product layout, its declared local product root is the invocation directory when the layout lies outside any repository, and otherwise the nearest level holding a placed spx.config.* ..."` `consistency against spx/18-state.enabler/21-product-root.enabler/product-root.md and` [`spx/15-worktree-management.pdr.md`](spx/15-worktree-management.pdr.md)

**Evidence**

- `spx/18-state.enabler/15-state-test-harness.enabler/state-test-harness.md` line 19 declares the local product root of a generated nested-product layout as the invocation directory outside any repository, and otherwise the nearest level holding a placed `spx.config.*` from the invocation directory up to the repository root.
- `spx/18-state.enabler/21-product-root.enabler/product-root.md` line 12 defines the local product root as `git rev-parse --show-toplevel`, with the working directory as the fallback outside a git repository.
- [`spx/15-worktree-management.pdr.md`](spx/15-worktree-management.pdr.md) gives the term the same meaning: its state-class table (lines 12-13) resolves `.spx/worktree/` and tracked `spx/` to the local worktree root via `git rev-parse --show-toplevel`, and its Audit rule (line 52) resolves tracked `spx/` files to the local worktree root via `git rev-parse --show-toplevel`.

**Impact**

The two specs give one term two meanings until the decision changes.

**Deferred because**

The fix is the root-resolution decision amendment, a separate larger concern owned by https://github.com/outcomeeng/changes/issues/341. It changes the resolver contract that every state node reads, across five ADRs and the product document.

**Settlement condition**

The amendment of [`spx/15-worktree-management.pdr.md`](spx/15-worktree-management.pdr.md) and `spx/18-state.enabler/21-product-root.enabler/product-root.md` from https://github.com/outcomeeng/changes/issues/341 lands with "local product root" as the nested-config walk, or the property's term changes to match the decision then in force.
