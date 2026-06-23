# Property Runner Harness

The property-test harness exposes `assertProperty(arbitrary, predicate, classification)`: it builds a fast-check property over a single `arbitrary` and a synchronous or asynchronous `predicate`, then runs it through `fc.check` under execution policy the harness owns — the run count from `classification.size` (a `standard` tier and a reduced `small` tier), the per-run timeout from `classification.level` (which fast-check enforces for asynchronous predicates and cannot apply to a synchronous one), and the seed from the `SPX_PROPERTY_SEED` environment variable when it parses as an integer, or a freshly drawn seed otherwise. The harness runs the property under the resolved seed and, when a run fails, throws a structured failure error carrying that seed and the shrunk counterexample so the caller reproduces the exact run by exporting `SPX_PROPERTY_SEED`. Seed resolution, run-count resolution, and timeout resolution are pure functions of their inputs; generation, shrinking, and counterexample production belong to fast-check.

## Rationale

A fixed default seed pins every run to one pseudo-random sample, so a property exercises the same cases forever and a counterexample outside that sample never surfaces. Drawing a fresh seed each run widens exploration across local and CI runs at no authoring cost, and recording the seed on failure restores the one thing a fixed seed offered — deterministic reproduction — because the caller re-runs under `SPX_PROPERTY_SEED=<reported>`. Owning the run count and timeout in the harness keeps execution policy out of test files, where it otherwise reappears as the top-level uppercase constants the test-owned-constant rule rejects. Resolving the seed, run count, and timeout through pure functions — rather than reading the environment or drawing randomness inside the runner — lets each verify at level 1 against supplied inputs without intercepting fast-check or the process environment. The harness runs through `fc.check` rather than `fc.assert` so it can read the run details and throw a `PropertyFailureError` carrying the seed and counterexample, in place of fast-check's built-in assertion error. The harness forwards the resolved timeout to fast-check uniformly, but fast-check interrupts only asynchronous predicates, so the per-run timeout governs async runs and a synchronous predicate runs to completion.

The per-run timeout is a fast-check per-case guard for asynchronous predicates; the Vitest test-level timeout bounds the whole run, so an async `l2` or `l3` property whose per-case timeout approaches or exceeds that envelope requires the caller to raise the Vitest `{ timeout }` for that test, otherwise Vitest aborts the run before the per-case guard applies.

Rejected: a fixed default seed (one sample forever — the exploration breadth a property test exists for is lost); reading the seed inside `fc.assert` without surfacing it on failure (a random run that fails cannot be replayed); per-test run counts and timeouts (the test-owned execution constants this harness exists to remove).

## Invariants

- Seed resolution is a total, deterministic function of the environment value and the drawn seed.
- Run-count resolution and timeout resolution are pure functions of the classification.
- The seed passed to a run is the seed reported when that run fails.

## Verification

### Testing

- ALWAYS: seed resolution yields the parsed `SPX_PROPERTY_SEED` when the variable holds a valid integer, and the drawn seed otherwise ([property])
- ALWAYS: classification size maps to the harness-owned run count, one tier per size, and classification level maps to the harness-owned per-run timeout ([mapping])
- ALWAYS: a failing run throws a structured failure error carrying the seed the run used and the shrunk counterexample ([scenario])
- NEVER: an unset `SPX_PROPERTY_SEED` resolves to a fixed constant ([compliance])
- ALWAYS: a predicate dispatched to the synchronous path that returns a thenable fails with a diagnostic directing the caller to declare it `async`, rather than running un-awaited ([scenario])

### Audit

- ALWAYS: `assertProperty` accepts the arbitrary, predicate, and classification as parameters, and the environment lookup and random draw enter through parameterized or injected seams, so seed and run-count resolution verify without intercepting the environment ([audit])
- ALWAYS: seed resolution, run-count resolution, and timeout resolution are pure functions that take their inputs as arguments and read no global state ([audit])
- ALWAYS: the harness composes on fast-check's property runner and `property`/`asyncProperty` for generation, shrinking, and counterexample production ([audit])
- NEVER: the harness reimplements case generation or shrinking ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, or any module mock substitutes for the environment or fast-check — the seams are parameterized or injected ([audit])
- NEVER: a property test that uses the harness declares its own run count, seed, or timeout ([audit])
