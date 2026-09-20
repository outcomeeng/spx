# Issues

## Four compliance assertions settle on generated inputs instead of violating fixtures

The containment, prompt, faithfulness, and promotion assertions of [release-notes.md](release-notes.md) link [tests/release-notes.compliance.l1.test.ts](tests/release-notes.compliance.l1.test.ts), and the cases there for those four assertions run on generated scenarios and controlled collaborators. The Compliance strategy the test-evidence standards require settles each of them on a whole-payload violating fixture that crosses the governed production boundary.

**Evidence:** the test-evidence audit of release candidate `b47377e9835717e1f563fa4ceb06f74b114eb279` returned `REJECTED` with three `assertion-type-strategy` findings against this file; the commit-type case that audit also named is settled, since the branch removed commit-type exclusion as a product rule and the remaining case asserts every commit stays available.

**Impact:** the deterministic tests pass while the evidence for those four assertions does not carry the strategy their assertion type declares.

**Settlement condition:** each of the four assertions — containment, prompt, faithfulness, promotion — links evidence that drives a whole-payload violating fixture through the production boundary, passes this node's deterministic tests, and receives an approved test-evidence audit.
