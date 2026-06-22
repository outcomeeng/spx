# Test-Run-State Generator

PROVIDES a fast-check generator for `TestRunState` values and their fields — branch names, head SHAs, digests, run identifiers, run file names, statuses, timestamps, runner outcomes, product-input digests, test-path lists, disjoint test-path pairs, content entries, and staleness inputs
SO THAT the last-run-evidence tests
CAN drive round-trip, staleness, and coverage-gating assertions over generated `TestRunState` values without hand-written fixtures

## Assertions

### Properties

- Every generated `TestRunState` carries a status drawn from the source-owned `TEST_RUN_STATE_STATUS` set ([test](tests/test-state-generator.property.l1.test.ts))
- A generated disjoint test-paths pair is two non-empty path lists that share no path, so a run covering the second list provably executes none of the first ([test](tests/test-state-generator.property.l1.test.ts))
