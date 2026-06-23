# Issues — Property Test Harness

## FOLLOW-UP [consistency]: migrating existing property tests onto the harness shifts run-count budgets

**Reference:** `testing/harnesses/property/property.ts` defines `PROPERTY_RUN_COUNTS` as `standard: 100`, `small: 25`. Pre-existing property tests pass test-owned run counts through `fc.assert` — `testing/generators/literal/literal.ts` declares `LITERAL_PROPERTY_RUN_COUNT = 32` and `LITERAL_SMALL_PROPERTY_RUN_COUNT = 5`, consumed across `spx/41-test.enabler/**` and `spx/41-validation.enabler/**` property tests.

**Issue:** Those callers already violate `spx/no-test-owned-domain-constants` and should migrate to `assertProperty`. On migration they adopt the harness tiers (100 / 25) in place of their current counts (32 / 5), changing each test's run-count budget. The migration is not scoped or tracked anywhere.

**Resolution condition:** When migrating a node's property tests onto `assertProperty`, confirm the harness `standard`/`small` tiers are acceptable for that node's runtime budget, or extend the classification with a tier the node needs, and remove the node's test-owned run-count constants. Track each migration with the owning node's `/apply` run; this harness node only provides the runner.
