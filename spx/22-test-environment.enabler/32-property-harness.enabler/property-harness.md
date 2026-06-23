# Property Test Harness

PROVIDES a fast-check property runner that takes an arbitrary, a property callback, and a classification, owning the run count, seed selection, and the per-run timeout that fast-check enforces for asynchronous predicates
SO THAT property tests across the spec tree
CAN assert invariants over generated inputs without declaring test-owned run counts, seeds, or timeouts, and can replay a failing run deterministically

## Assertions

### Scenarios

- Given an arbitrary and a synchronous property callback, when the harness runs with a classification, then the callback is exercised across generated cases and the harness returns once every case holds ([test](tests/property-harness.scenario.l1.test.ts))
- Given an asynchronous property callback, when the harness runs, then it awaits each case and resolves once every case holds ([test](tests/property-harness.scenario.l1.test.ts))
- Given a property that fails for some input, when the harness runs, then it throws carrying the shrunk counterexample and the seed of the run ([test](tests/property-harness.scenario.l1.test.ts))
- Given `SPX_PROPERTY_SEED` holds an integer, when the harness runs, then the run uses that seed, so a previously reported failure reproduces ([test](tests/property-harness.scenario.l1.test.ts))
- Given a Promise-returning predicate that is not an async function, when the harness runs, then it fails with a diagnostic directing the caller to declare the predicate `async`, rather than running the case un-awaited ([test](tests/property-harness.scenario.l1.test.ts))

### Mappings

- Classification size maps to run count: `standard` to the standard run count and `small` to the reduced run count ([test](tests/property-harness.mapping.l1.test.ts))
- Classification level maps to the harness-owned per-run timeout, one timeout per execution level, which fast-check enforces for asynchronous predicates ([test](tests/property-harness.mapping.l1.test.ts))

### Properties

- Seed resolution is total: for any environment, the resolved seed is the parsed `SPX_PROPERTY_SEED` when it holds a valid integer and a freshly drawn seed otherwise ([test](tests/property-harness.property.l1.test.ts))
- For a fixed seed, the generated case sequence is identical across runs ([test](tests/property-harness.property.l1.test.ts))

### Compliance

- ALWAYS: an unset `SPX_PROPERTY_SEED` resolves to a freshly drawn seed rather than a fixed constant, so successive runs explore different cases ([test](tests/property-harness.compliance.l1.test.ts))
- ALWAYS: a failing run reports the seed it used so the run replays under `SPX_PROPERTY_SEED` ([test](tests/property-harness.scenario.l1.test.ts))
- NEVER: a property test that uses the harness declares its own run count, seed, or timeout — the harness owns them ([audit])
- NEVER: the harness reimplements case generation or shrinking — it composes on fast-check ([audit])
