# Issues — Property Test Harness

## The release-data property does not pass the whole-run envelope as its test timeout

**Reference:** `testing/harnesses/property/property.ts` exports `propertyTestEnvelopeTimeoutMs`, which maps a classification to its whole-run envelope. `spx/26-release.enabler/21-release-data.enabler/tests/release-data.property.l1.test.ts` calls `assertProperty` without passing that value as its Vitest test timeout.

**Issue:** The release-data property materializes a git repository with several commits and a tag and computes release data twice per case, roughly fifteen git spawns per run. It completes in about ten seconds on an idle host and exceeds the 30 s Vitest default under host load, failing as a Vitest timeout rather than as a harness-reported property failure with seed and replay path. The property-harness spec's `[audit]` rule forbids the test from declaring its own timeout, so the harness-owned envelope is the only sanctioned bound.

**Resolution condition:** The release-data property passes `propertyTestEnvelopeTimeoutMs` for its classification as its Vitest test timeout.

## FOLLOW-UP [consistency]: migrating existing property tests onto the harness shifts run-count budgets

**Reference:** `testing/harnesses/property/property.ts` defines `PROPERTY_RUN_COUNTS` as `standard: 100`, `small: 25`. Pre-existing property tests pass test-owned run counts through `fc.assert` — `testing/generators/literal/literal.ts` declares `LITERAL_PROPERTY_RUN_COUNT = 32` and `LITERAL_SMALL_PROPERTY_RUN_COUNT = 5`, consumed across `spx/41-test.enabler/**` and `spx/41-validation.enabler/**` property tests.

**Issue:** Those callers already violate `spx/no-test-owned-domain-constants` and should migrate to `assertProperty`. On migration they adopt the harness tiers (100 / 25) in place of their current counts (32 / 5), changing each test's run-count budget. The migration is not scoped or tracked anywhere.

**Resolution condition:** When migrating a node's property tests onto `assertProperty`, confirm the harness `standard`/`small` tiers are acceptable for that node's runtime budget, or extend the classification with a tier the node needs, and remove the node's test-owned run-count constants. Track each migration with the owning node's `/apply` run; this harness node only provides the runner.

## A property failure message names the seed and omits the shrunk counterexample

`PropertyFailureError` in `testing/harnesses/property/property.ts` stores the shrunk counterexample on its `counterexample` field and builds its message from the run count and the seed alone: "Property failed after N runs (seed S). Replay the failing case with SPX_PROPERTY_SEED=S." A test runner prints a thrown error's message and its cause, and prints none of its custom fields. The runner output of a failing property therefore names the seed and the assertion that failed on the shrunk input, and never the input itself. The scenario "throws carrying the shrunk counterexample and the seed of the run" in [`spx/22-test-environment.enabler/32-property-harness.enabler/property-harness.md`](property-harness.md) holds, because the field is set; the field is not part of what a reader of the runner output sees.

The failing run of `tests/verifier.compliance.l1.test.ts` under `spx/60-surfaces.enabler/21-cli-surface.enabler/21-verification.enabler/21-record-run.enabler` shows the gap. Its recorded output reads "Property failed after 17 runs (seed 728871692). Replay the failing case with SPX_PROPERTY_SEED=728871692." followed by "expected [] to strictly equal [ 1 ]", with no generated value. Finding the failing input took a separate `fc.sample` of the same arbitrary shape at that seed, whose 17th draw was `{"kind":"-C","id":"I9HE7"}`.

**Impact:** a failure reproduced from a seed shows the failed expectation without the input that broke it, so each diagnosis repeats the replay and the sampling by hand, and a failure recorded in a verification run journal carries the seed alone.

**Settlement condition:** the message of a thrown `PropertyFailureError` names the shrunk counterexample in a bounded, escaped form beside the seed, and a scenario in `tests/property-harness.scenario.l1.test.ts` proves that the message of a failing property contains the counterexample the failure carries.

**Evidence:** `testing/harnesses/property/property.ts` `PropertyFailureError` and `failureFrom`; `spx/22-test-environment.enabler/32-property-harness.enabler/tests/property-harness.scenario.l1.test.ts`; the recorded failure of seed 728871692 in verification run `run-2026-10-25_18-26-30-799-aef9d27204a3.jsonl`.
