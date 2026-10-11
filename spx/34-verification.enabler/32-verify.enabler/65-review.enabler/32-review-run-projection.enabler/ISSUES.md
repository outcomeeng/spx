# Issues: review run projection

## Linked tests assert through harness-owned predicates

**Evidence:** four executed tests linked from `review-run-projection.md` delegate their predicate to
an `assert*` function in `testing/harnesses/verify/harness.ts`, so the predicate sits in
infrastructure and the test file owns nothing:

- `tests/review-scope.scenario.l1.test.ts` (line 6) calls
  `assertReviewScopeProjectionIncludesCleanReviewedUnit` (harness line 2149).
- `tests/review-comment.mapping.l1.test.ts` (line 16, the anchored case) calls
  `assertReviewCommentProjectionIncludesFindingPayload` (harness line 2714).
- `tests/review-envelope.mapping.l1.test.ts` (line 19) calls
  `assertFinishStatusAndRenderProjectTerminalMetadata` (harness line 4126).
- `tests/review-envelope.mapping.l1.test.ts` (line 23) calls
  `assertReviewTerminalMetadataStateMapsTerminalStatus` (harness line 2924).

The test-evidence audit of this node (verdict APPROVED at
`bb5e342aca57c02ebf435cc29e7f45a9cd74da49`) filed these as findings under rule `assertion-seam`,
predicate-ownership. The unanchored case of `tests/review-comment.mapping.l1.test.ts` and the
remaining cases of `tests/review-envelope.mapping.l1.test.ts` keep their predicates in the test
callbacks.

The class is recorded product-wide in `spx/ISSUES.md` ("Test assertion flow lives in harnesses
instead of executed test files") and for the verification subtree in
`spx/34-verification.enabler/32-verify.enabler/ISSUES.md` ("Shared verification harness owns test
predicates and unclassified Git doubles"); this entry records the four instances in this node.

**Impact:** the node's `tests/` files do not carry the evidence for the scope, comment, and
terminal-metadata projection assertions they link; the expected values and comparisons sit one
indirection away in the shared harness, where a change to the harness alters what the linked
assertions prove without a change to the tests.

**Settlement condition:** each of the four tests holds its behavioral predicate and expected values
in its own callback, the four `assert*` functions leave `testing/harnesses/verify/harness.ts` or
reduce to observation and resource APIs that return values, and the node's test-evidence audit
returns no `assertion-seam` finding for these tests.
