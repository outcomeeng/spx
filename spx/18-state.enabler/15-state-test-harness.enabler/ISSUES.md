# Issues: State Test Harness

## The nested-layout scenario restates the generator's minimum level count

**Evidence**

- `spx/18-state.enabler/15-state-test-harness.enabler/tests/nested-product-layout.scenario.l1.test.ts` asserts that the count of levels with a placed `spx.config.*` and product spec is greater than or equal to the literal `2`.
- `MIN_LEVELS_WITH_DISTINCT_ENDS` is declared, unexported, as `2` in `testing/generators/state/nested-product-layout.ts`. The generator passes it as the minimum level count of the layout whose invocation level and repository root both place those files.

**Impact**

A change to the generator's minimum leaves the scenario's guard stale: the literal in the test no longer matches the generator's bound, and the guard either rejects valid layouts or admits layouts below the bound.

**Settlement condition**

The generator exports `MIN_LEVELS_WITH_DISTINCT_ENDS`, and the scenario imports it in place of the literal `2`.
