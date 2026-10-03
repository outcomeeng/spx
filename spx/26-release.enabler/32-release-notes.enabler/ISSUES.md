# Issues

## Four compliance assertions settle on generated inputs instead of violating fixtures

The containment, prompt, faithfulness, and promotion assertions of [release-notes.md](release-notes.md) link [tests/release-notes.compliance.l1.test.ts](tests/release-notes.compliance.l1.test.ts), and the cases there for those four assertions run on generated scenarios and controlled collaborators. The Compliance strategy the test-evidence standards require settles each of them on a whole-payload violating fixture that crosses the governed production boundary.

**Evidence:** the test-evidence audit of release candidate `b47377e9835717e1f563fa4ceb06f74b114eb279` returned `REJECTED` with three `assertion-type-strategy` findings against this file; the commit-type case that audit also named is settled, since the branch removed commit-type exclusion as a product rule and the remaining case asserts every commit stays available.

**Impact:** the deterministic tests pass while the evidence for those four assertions does not carry the strategy their assertion type declares.

**Settlement condition:** each of the four assertions — containment, prompt, faithfulness, promotion — links evidence that drives a whole-payload violating fixture through the production boundary, passes this node's deterministic tests, and receives an approved test-evidence audit.

## The ownership generator redeclares the assertion-marker syntax the release domain parses

`testing/generators/release/product-context.ts` writes the spec-tree assertion markers its generated trees must carry — the audit tag, the test-link form, and the backtick-quoted path the audit-declaration scan matches — as its own literals, while importing every surrounding grammar token from its owner. The production owners are `AUDIT_TAG`, `TEST_LINK_PATTERN`, and `INLINE_CODE_PATTERN` in `src/domains/release/product-context.ts`, and all three are private to that module.

**Evidence:** the test-evidence audit of this node at head `8dfc41d194d374736d2b734da98d278e3fe83a64` returned `REJECTED` with finding `f-001`, rule `source-ownership`, against `testing/generators/release/product-context.ts:53`. Neither `src/lib/spec-tree/config.ts`, the `src/lib/spec-tree/index.ts` public surface, nor `src/domains/release/product-context.ts`'s exports publish the marker syntax.

**Impact:** the AUDIT_DECLARATION, ROOT_DECISION, CROSS_ENDPOINT, MULTIPLE_CANDIDATES and DELETED cases are recognized only because two independent copies of the marker syntax agree. A change to either copy alone silently reclassifies every generated tree instead of failing as an intentional contract change.

**Settlement condition:** `src/domains/release/product-context.ts` exports the audit tag, the test-link form, and the inline-code form, and the generator imports all three instead of spelling them.
