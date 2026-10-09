# Known Issues

## Test-evidence audit findings on text older than the release-by-session-id changeset

The test-evidence audits of this node returned `REJECTED` twice: at `da83f3287273dd4ecedca24be1aad9641d9f974d` with eighteen findings, and at `296f5e2d2d6a376f8132131ece63f124efd7c83e` with seven. The release-by-session-id changeset touches this node's scenario test in the import block, in the removal of the local claim wrappers (now imported from the harness), and in the two release-by-session-id scenarios; no finding cites those lines. The findings fall into five classes.

**Test-owned doubles and wrappers.** The scenario file declares `createThrowingProbe`, `ReplacingStaleLockFileSystem`, and `FailingLockRemovalFileSystem`; the property file declares `PausingClaimWriteFileSystem`, `PausingClaimAcquisitionFileSystem`, and local `acquireClaim` and `removeClaim` wrappers that repeat the operation-identity policy now held in `testing/harnesses/worktree/harness.ts` (`acquireClaimAsOperation`, `removeClaimAsOperation`, `removeClaimBySessionIdAsOperation`); the mapping file declares `RecordingClaimFileSystem`, `SymbolThrowingClaimFileSystem`, `errorWithCode`, and `identicalClaimRecordWithDistinctRandomBytes`, and `RecordingClaimFileSystem` duplicates the `createRecordingOccupancyFileSystem` the harness exports. Findings: first audit `f-001`, `f-002`, `f-003`, `f-005`, `f-006`; final audit `f-002`, `f-004`, `f-006`.

**Properties that bypass the property harness.** `tests/occupancy-store.property.l1.test.ts` (four properties) and `tests/occupancy-store.compliance.l1.test.ts` (the never-ages-out property) call `fc.assert` directly, with a test-supplied `numRuns` or the fast-check default, so seed, run count, timeout, and replay reporting belong to the test file instead of `assertProperty`. Findings: first audit `f-007`, `f-008`, `f-009`, `f-010`; final audit `f-003`, `f-005`.

**Assertion predicates in test-file helpers.** `expectLinkAbsent` and `expectLinkRecord` in `tests/occupancy-store.scenario.l1.test.ts` call `expect()` outside the linked `it()` callbacks, so the marker-state predicates of roughly ten scenarios live in helpers. Finding: final audit `f-001`.

**Mapping evidence that samples.** `tests/occupancy-store.mapping.l1.test.ts` checks the classification mapping through seven separate `it` blocks with hand-written expected statuses, and checks claim-name validity with one seeded draw per class (one safe name, the empty name, one unsafe-marker name) although the assertion quantifies over every character outside the safe set. Findings: first audit `f-011`, `f-012`; final audit `f-007`.

**Falsifiability and coverage.** The probe-throw scenario (`tests/occupancy-store.scenario.l1.test.ts`, around line 958) follows its failed acquisition with a dead-holder probe, so a leaked marker owned by the next claimant reads as recoverable and the scenario still passes (first audit `f-004`). Warnings: `f-013` (the writer-unique temporary path test derives its expectation from the production `atomicWriteTempPath`), `f-014` (the claim-write scenario drives `writeClaim`, which skips the admission lock), `f-015` (a fixed sampling seed makes the dead marker owner and the next claimant the same record), `f-016` (the compliance test never exercises a caller that composes its own path), `f-017` (`formatOccupancyError` is reached only through the `writeClaim` mkdir failure), `f-018` (the generated values do not vary the lock-exclusion behavior the properties assert).

**Impact:** the node's suite lets a leaked admission marker, a shortcut on owner identity, an unseeded property failure, or a single unsafe-character gap pass, and a failing property run is not replayable.

**Settlement condition:** the doubles and wrappers live in the node's spec-governed harness (`21-test-harness.enabler`), the properties run through `assertProperty`, the marker-state predicates sit in the linked test callbacks, the mapping evidence enumerates its correspondence with `it.each`, the probe-throw scenario follows its failure with a probe that keeps the claimant alive, and a new test-evidence audit of the node raises none of these findings.

## New scenario construction repeats older release scenarios

SonarCloud's quality gate on the release-by-session-id changeset failed with 27.4% duplication on new code (required at most 3%). Of this node's 70 new lines, 24 are duplicated: the two release-by-session-id scenarios in `tests/occupancy-store.scenario.l1.test.ts` repeat the construction of each other and of the older release scenarios (a claim recorded with a live process, the removal call under the harness wrapper, the assertion on the remaining claim).

**Impact:** each further release scenario copies the same construction, so the duplication rate on new code stays above the gate.

**Settlement condition:** one harness function builds the claim-with-live-process construction the release scenarios share, the release scenarios call it, and the SonarCloud duplication condition holds for the scenario file.
