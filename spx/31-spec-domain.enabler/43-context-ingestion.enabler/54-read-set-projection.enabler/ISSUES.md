# Open Issues

## The targetless depth bound is exercised only from below

The Scenarios assertion `Targetless show renders the product spec in Full, node specs at depths 1 and 2 in Digest, decisions directly contained at depths 0 through 2 in Digest, and existing ISSUES.md files at those depths as path-only references` is evidenced by asserting that depth-1 and depth-2 node specs are present. The rich fixture materializes a depth-3 node, and no case asserts its absence, so the bound is proven only in the lowering direction.

**Evidence:** the test-evidence audit of this node at head `8dfc41d194d374736d2b734da98d278e3fe83a64` returned `REJECTED` with finding `f-002`, rule `scope`. Mutating `DISCOVERY_DEPTH` in `src/lib/spec-tree/context-projection.ts` from 2 to 3 admits depth-3 specs into targetless discovery and every linked test still passes; mutating it to 1 is caught.

**Impact:** a projection that widened targetless discovery beyond the declared depth would satisfy the linked evidence while the assertion is unfulfilled, and targetless discovery is the payload an agent loads before it can choose a target.

**Settlement condition:** the targetless case asserts that the fixture's depth-3 node spec is absent from the projection alongside the depth-1 and depth-2 presences.
