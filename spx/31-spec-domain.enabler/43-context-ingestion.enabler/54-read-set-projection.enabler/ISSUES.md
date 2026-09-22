# Open Issues

## Decisions are exercised at two of the three declared discovery depths

The same targetless assertion says decisions directly contained at depths 0 through 2 render in Digest. The rich fixture materializes decisions at the product root and under the two top-level directories and none inside the depth-2 target node, so the depth-2 half of that clause has no case.

**Evidence:** the test-evidence audit of this node at head `9d1d2f16f` returned `REJECTED` with finding `f-001`, rule `scope`, remediation target `harness`. Restricting the discovery decision collection in `selectSpecContextDocuments` to depths below `DISCOVERY_DEPTH` leaves every linked test green.

**Impact:** a projection that dropped the deepest decisions from targetless discovery would satisfy the evidence while the assertion is unfulfilled, and those decisions are the governing context an agent reads before choosing a target.

**Settlement condition:** the rich fixture materializes a decision inside the depth-2 target node and the targetless case asserts its Digest, so the depth-2 half of the clause fails when the collection narrows.

## Fixture payload and an unrecorded controlled-dependency exception sit at the assertion sites

Three non-blocking observations from the same audit, recorded together because they share an owner. The executed tests write the eval and probe fixture bodies inline although `withRichContextEnv` declares `targetEvalPath` and `targetProbePath` as part of the fixture contract (`f-002`); the ordering cases write their overlay and spec bodies inline while the paths and the divergent slug pair are owned correctly (`f-003`); and `trackedSpecContextGitDependencies` supplies a controlled git implementation through production's injection seam while naming no testing-methodology exception case, though the same harness exercises the real-git path at the same level (`f-004`).

**Impact:** fixture payload at the assertion site drifts from the fixture it belongs to, and an unrecorded exception leaves a reader unable to tell a deliberate controlled boundary from an accidental one.

**Settlement condition:** the rich-context harness materializes the eval, probe, overlay and ordering bodies with the rest of the fixture, and the tracked-paths double records the exception case it serves.
