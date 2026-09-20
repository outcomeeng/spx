# Issues: review run projection

## The identity properties do not vary the anchor components in isolation

**Evidence:** `tests/review-run-set-identity.property.l1.test.ts` proves the finding identity
and the reviewed-unit scope key through generated pairs from
`testing/generators/verify/verify.ts`. `arbitraryReviewFindingIdentityDivergentPair` draws two
independent findings whose summaries differ, and `arbitraryReviewScopeUnitKeyDivergentPair` draws
two independent units whose paths differ, so no generated pair holds the summary and one anchor
component fixed while varying the other. A `reviewAnchorSubject` returning a constant, or a
`reviewScopeUnitKey` keyed on the path alone, passes both properties. The validated-payload
branch of the adapter totality property takes its expectation from `reviewFindingIdentityFields`
of the module under test, so it proves adapter and extractor agreement while the anchor
composition stays unpinned.

**Impact:** the "composes the anchor side and path" clause of the finding-identity assertion
and the "composes the anchor side" clause of the scope-key assertion survive the mutations that
break them; the tests hold the invariance clauses only.

**Settlement condition:** the pair generators vary exactly one of anchor side, path, or summary
per divergent pair with the others held equal, the properties fail under each of the two
mutations above, and the validated-payload totality expectation derives from an oracle
independent of `reviewFindingIdentityFields`.
