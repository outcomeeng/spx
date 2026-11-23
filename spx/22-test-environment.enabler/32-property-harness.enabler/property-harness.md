---
id: 01a2034e-dbcc-7098-ad39-1afa421f0787
---

# Property Test Harness

PROVIDES a fast-check property runner that takes an arbitrary, a property callback, and a classification, owning the run count, seed selection, the per-run timeout that fast-check enforces for asynchronous predicates, and the whole-run envelope a caller passes as the test-level timeout
SO THAT property tests across the spec tree
CAN assert invariants over generated inputs without declaring test-owned run counts, seeds, or timeouts, and can replay a failing run deterministically

## Test.Scenario: property runs

- [sync-property-holds](tests/property-harness.scenario.l1.test.ts):
  - Given an arbitrary and a synchronous property callback
  - When the harness runs with a classification
  - Then the callback is exercised across generated cases, and the harness returns once every case holds
- [async-property-holds](tests/property-harness.scenario.l1.test.ts):
  - Given an asynchronous property callback
  - When the harness runs
  - Then it awaits each case and resolves once every case holds
- [async-case-timeout](tests/property-harness.scenario.l1.test.ts):
  - Given an asynchronous property callback that does not resolve within the classification's per-run timeout
  - When the harness runs
  - Then fast-check terminates the case, and the harness throws a structured property failure
- [counterexample-and-seed](tests/property-harness.scenario.l1.test.ts):
  - Given a property that fails for some input
  - When the harness runs
  - Then it throws carrying the shrunk counterexample and the seed of the run
- [seed-from-environment](tests/property-harness.scenario.l1.test.ts):
  - Given `SPX_PROPERTY_SEED` holds an integer
  - When the harness runs
  - Then the run uses that seed, so the same failing run reproduces
- [promise-predicate-rejected](tests/property-harness.scenario.l1.test.ts):
  - Given a Promise-returning predicate that is not an async function
  - When the harness runs
  - Then it fails with a diagnostic directing the caller to declare the predicate `async`, and runs no case un-awaited

## Test.Mapping: [run-count](tests/property-harness.mapping.l1.test.ts)

A classification's size selects one positive integer run count, which does not vary with the classification's execution level; an omitted size selects the standard run count.

| Case     | Size       | Run count                                           |
| -------- | ---------- | --------------------------------------------------- |
| standard | `standard` | the standard run count                              |
| small    | `small`    | the reduced run count, below the standard run count |
| omitted  | none       | the standard run count                              |

## Test.Mapping: [per-run-timeout](tests/property-harness.mapping.l1.test.ts)

A classification's execution level selects its own positive per-run timeout, which the harness owns, which does not vary with the classification's size, and which no other level shares.

| Case | Level | Per-run timeout          |
| ---- | ----- | ------------------------ |
| l1   | `l1`  | the `l1` per-run timeout |
| l2   | `l2`  | the `l2` per-run timeout |
| l3   | `l3`  | the `l3` per-run timeout |

## Test.Mapping: [run-envelope](tests/property-harness.mapping.l1.test.ts)

A classification's whole-run envelope, which the harness exports for a caller to pass as the test-level timeout, is its run count times its per-run timeout, plus the harness-owned margin; an omitted size selects the envelope of the standard size.

| Case         | Classification      | Whole-run envelope                                                        |
| ------------ | ------------------- | ------------------------------------------------------------------------- |
| sized        | a size and a level  | that size's run count times that level's per-run timeout, plus the margin |
| omitted-size | a level and no size | the envelope of the standard size at that level                           |

## Test.Property: seeds

- [seed-resolution-total](tests/property-harness.property.l1.test.ts): seed resolution is total: for any environment, the resolved seed is the parsed `SPX_PROPERTY_SEED` when it holds a valid integer, and a freshly drawn seed otherwise
- [fixed-seed-sequence](tests/property-harness.property.l1.test.ts): for a fixed seed, the generated case sequence is identical across runs

## Test.Conformance: single-draw sampler

- [sampler-reproduces](tests/sampler.conformance.l1.test.ts): the shared single-draw sampler returns the case fast-check produces for the same arbitrary under the sampler's source-owned pinned parameters, so repeated draws reproduce

## Audit: harness ownership

- no-test-owned-policy: NEVER: a property test that uses the harness declares its own run count, seed, or timeout — the harness owns them
- composes-on-fast-check: NEVER: the harness reimplements case generation or shrinking — it composes on fast-check
- generators-own-domains: ALWAYS: the property-harness evidence generators own seed, invalid-environment, shrinking, and sampler-probe input domains, leaving linked assertion files to own only predicates and observations
