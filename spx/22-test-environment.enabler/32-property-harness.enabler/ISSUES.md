# Issues — Property Test Harness

## The harness owns the per-run timeout but no whole-run test envelope

**Reference:** `testing/harnesses/property/property.ts` applies `PROPERTY_TIMEOUTS_MS` per run (`l1`: 5 s) and runs `PROPERTY_RUN_COUNTS` cases (`small`: 25), so a small `l1` property may legitimately take up to 125 s, while the Vitest test-level envelope stays at its 30 s default. The only exported envelope, `PROPERTY_L1_TEST_ENVELOPE_TIMEOUT_MS`, sizes a single-run timeout scenario, not a full run.

**Issue:** A property whose predicate drives a real system — `spx/26-release.enabler/21-release-data.enabler/tests/release-data.property.l1.test.ts` materializes a git repository with several commits and a tag and computes release data twice per case, roughly fifteen git spawns per run — completes in about ten seconds on an idle host and exceeds the 30 s Vitest envelope under host load, failing as a Vitest timeout rather than as a harness-reported property failure with seed and replay path. The spec's `[audit]` rule forbids the test from declaring its own timeout, so the caller has no sanctioned way to size the envelope.

**Resolution condition:** The harness exposes the whole-run envelope it already implies — run count × per-run timeout for the classification, plus its margin — as a harness-owned value a caller passes as the Vitest test timeout, declared by an assertion in `spx/22-test-environment.enabler/32-property-harness.enabler/property-harness.md` and covered by this node's mapping evidence; real-system property tests such as the release-data determinism property then adopt it. Until then, a load-induced timeout in that test is re-run after the load gate, and passes in isolation.

## FOLLOW-UP [consistency]: migrating existing property tests onto the harness shifts run-count budgets

**Reference:** `testing/harnesses/property/property.ts` defines `PROPERTY_RUN_COUNTS` as `standard: 100`, `small: 25`. Pre-existing property tests pass test-owned run counts through `fc.assert` — `testing/generators/literal/literal.ts` declares `LITERAL_PROPERTY_RUN_COUNT = 32` and `LITERAL_SMALL_PROPERTY_RUN_COUNT = 5`, consumed across `spx/41-test.enabler/**` and `spx/41-validation.enabler/**` property tests.

**Issue:** Those callers already violate `spx/no-test-owned-domain-constants` and should migrate to `assertProperty`. On migration they adopt the harness tiers (100 / 25) in place of their current counts (32 / 5), changing each test's run-count budget. The migration is not scoped or tracked anywhere.

**Resolution condition:** When migrating a node's property tests onto `assertProperty`, confirm the harness `standard`/`small` tiers are acceptable for that node's runtime budget, or extend the classification with a tier the node needs, and remove the node's test-owned run-count constants. Track each migration with the owning node's `/apply` run; this harness node only provides the runner.
