# Test-Run-State Generator

PROVIDES a fast-check generator for `TestRunState` values and their fields — branch names, head SHAs, digests, run identifiers, run file names, statuses, timestamps, runner outcomes with per-path verdicts, product-input digests, test-path lists, disjoint test-path pairs, content entries, staleness inputs, and the run-state scenario construction — terminal states whose runner outcomes cover given test paths and the run files that persist them
SO THAT the last-run-evidence tests
CAN drive round-trip, staleness, and coverage-gating assertions over generated `TestRunState` values without hand-written fixtures

## Assertions

### Properties

- Every generated `TestRunState` carries a status drawn from the source-owned `TEST_RUN_STATE_STATUS` set ([test](tests/test-state-generator.property.l1.test.ts))
- A generated disjoint test-paths pair is two non-empty path lists that share no path, so a run covering the second list provably executes none of the first ([test](tests/test-state-generator.property.l1.test.ts))
- ALWAYS: the generator supplies the run-state scenario construction the last-run-evidence run-state scenarios repeat — a terminal state whose runner outcomes cover exactly the given test paths, grouped into one outcome or split across several, and the run files that persist such states — so those scenarios keep their own predicates and hold no copy of the construction ([test](tests/test-state-generator.property.l1.test.ts))
