# Open Issues

## The issue-note clause is witnessed at two of its three depths

The same targetless assertion says existing `ISSUES.md` files at depths 0 through 2 contribute path-only references. The rich fixture carries an issue note at the product root and at the target, and a `PLAN.md` but no issue note at depth 1, so the exact-equality reference set would still hold if discovery stopped referencing depth-1 issue notes.

**Evidence:** the test-evidence audit of this node at head `ca05dcd76` recorded it as `f-002`, rule `scope`, remediation target `harness`, alongside the depth-2 decisions gap above.

**Impact:** the same class as that gap, on the other half of the clause: a projection that dropped depth-1 issue notes would satisfy the evidence.

**Settlement condition:** the rich fixture materializes an issue note at depth 1 and the targetless case's reference set includes it, so the clause fails when discovery narrows.

## The implicit-container clause has no sibling witness

The compliance assertion says an explicitly targeted node contributes its outcome record and knowledge index while implicit ancestors, siblings, and children contribute neither. The evidence witnesses an ancestor and an immediate child; no sibling of the target carries either artifact in the rich fixture, so the sibling third of the clause has no case.

**Evidence:** the test-evidence audit of this node at head `a44c06000` recorded it as `f-002`, rule `scope`, remediation target `harness`, in an otherwise approved verdict. Production gates all three through the one explicit-target predicate in `explicitArtifacts`, so the shared path is exercised and the gap is witness breadth.

**Impact:** a projection that contributed a sibling's outcome record would satisfy the evidence while the assertion is unfulfilled.

**Settlement condition:** the rich fixture gives a sibling of the target an outcome record and a knowledge index, and the compliance case asserts neither reaches the projection.

## Fixture payload and an unrecorded controlled-dependency exception sit at the assertion sites

Three non-blocking observations from the same audit, recorded together because they share an owner. The executed tests write the eval and probe fixture bodies inline although `withRichContextEnv` declares `targetEvalPath` and `targetProbePath` as part of the fixture contract (`f-002`); the ordering cases write their overlay and spec bodies inline while the paths and the divergent slug pair are owned correctly (`f-003`); and `trackedSpecContextGitDependencies` supplies a controlled git implementation through production's injection seam while naming no testing-methodology exception case, though the same harness exercises the real-git path at the same level (`f-004`).

**Impact:** fixture payload at the assertion site drifts from the fixture it belongs to, and an unrecorded exception leaves a reader unable to tell a deliberate controlled boundary from an accidental one.

**Settlement condition:** the rich-context harness materializes the eval, probe, overlay and ordering bodies with the rest of the fixture, and the tracked-paths double records the exception case it serves.
