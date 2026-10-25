# Issues — Property Test Harness

## The release-data property does not pass the whole-run envelope as its test timeout

**Reference:** `testing/harnesses/property/property.ts` exports `propertyTestEnvelopeTimeoutMs`, which maps a classification to its whole-run envelope. `spx/26-release.enabler/21-release-data.enabler/tests/release-data.property.l1.test.ts` calls `assertProperty` without passing that value as its Vitest test timeout.

**Issue:** The release-data property materializes a git repository with several commits and a tag and computes release data twice per case, roughly fifteen git spawns per run. It completes in about ten seconds on an idle host and exceeds the 30 s Vitest default under host load, failing as a Vitest timeout rather than as a harness-reported property failure with seed and replay path. The property-harness spec's `[audit]` rule forbids the test from declaring its own timeout, so the harness-owned envelope is the only sanctioned bound.

**Resolution condition:** The release-data property passes `propertyTestEnvelopeTimeoutMs` for its classification as its Vitest test timeout.

## FOLLOW-UP [consistency]: migrating existing property tests onto the harness shifts run-count budgets

**Reference:** `testing/harnesses/property/property.ts` defines `PROPERTY_RUN_COUNTS` as `standard: 100`, `small: 25`. Pre-existing property tests pass test-owned run counts through `fc.assert` — `testing/generators/literal/literal.ts` declares `LITERAL_PROPERTY_RUN_COUNT = 32` and `LITERAL_SMALL_PROPERTY_RUN_COUNT = 5`, consumed across `spx/41-test.enabler/**` and `spx/41-validation.enabler/**` property tests.

**Issue:** Those callers already violate `spx/no-test-owned-domain-constants` and should migrate to `assertProperty`. On migration they adopt the harness tiers (100 / 25) in place of their current counts (32 / 5), changing each test's run-count budget. The migration is not scoped or tracked anywhere.

**Resolution condition:** When migrating a node's property tests onto `assertProperty`, confirm the harness `standard`/`small` tiers are acceptable for that node's runtime budget, or extend the classification with a tier the node needs, and remove the node's test-owned run-count constants. Track each migration with the owning node's `/apply` run; this harness node only provides the runner.
