# Literal Reuse Detection Test Harness

PROVIDES literal-collection fixtures over the production collector — `indexSources` building a literal index from `[filename, source]` pairs, `testOccurrences` building a per-file occurrence map, `collectFromSource` collecting one source's occurrences, detection-fixture execution in natural and reverse file order, and canonical detection-result normalization — all through the production literal detector
SO THAT the detection enabler's L1 reuse and duplication scenarios
CAN assemble the source and test indexes `detectReuse` consumes without re-specifying the collector options the detector under test uses

## Assertions

### Scenarios

- Given a source snippet declaring a domain literal, when `collectFromSource` runs, then the returned occurrences include that literal as a string occurrence ([test](tests/test-harness.scenario.l1.test.ts))
- Given a source snippet and a test snippet that share a domain literal, when `indexSources` and `testOccurrences` feed `detectReuse`, then a src↔test reuse finding for that literal is produced ([test](tests/test-harness.scenario.l1.test.ts))

### Compliance

- ALWAYS: literals are collected through the production `collectLiterals` under the production default collect options, detection fixtures execute through production `buildIndex` and `detectReuse`, and result normalization changes only finding order ([audit])
- ALWAYS: the helpers return raw observations and perform no assertion, test registration, filesystem, subprocess, or network I/O ([audit])
