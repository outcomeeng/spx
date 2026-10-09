# Issues

## Four compliance assertions settle on generated inputs instead of violating fixtures

The containment, prompt, faithfulness, and promotion assertions of [release-notes.md](release-notes.md) link [tests/release-notes.compliance.l1.test.ts](tests/release-notes.compliance.l1.test.ts), and the cases there for those four assertions run on generated scenarios and controlled collaborators. The Compliance strategy the test-evidence standards require settles each of them on a whole-payload violating fixture that crosses the governed production boundary.

**Evidence:** the test-evidence audit of release candidate `b47377e9835717e1f563fa4ceb06f74b114eb279` returned `REJECTED` with three `assertion-type-strategy` findings against this file; the commit-type case that audit also named is settled, since the branch removed commit-type exclusion as a product rule and the remaining case asserts every commit stays available.

**Impact:** the deterministic tests pass while the evidence for those four assertions does not carry the strategy their assertion type declares.

**Settlement condition:** each of the four assertions — containment, prompt, faithfulness, promotion — links evidence that drives a whole-payload violating fixture through the production boundary, passes this node's deterministic tests, and receives an approved test-evidence audit.

## Release-notes evidence derives expectations and fixtures by hand where a generator or harness already supplies them

Six places in the release-notes evidence fix an expectation, a fixture, or a collaborator result by hand where the generator or harness that owns the case could derive it, or make an assertion that holds by construction.

- `containedCases` in [tests/release-notes.compliance.l1.test.ts](tests/release-notes.compliance.l1.test.ts) is a hand-chosen table of expected outcomes; the expectation belongs to the generator that builds each boundary case.
- `arbitraryReleaseContextScenario` in `testing/generators/release/product-context.ts` fixes `existingNotes` to the constant `CHANGELOG_TITLE`, with the same body for every commit, one changed path, and three context documents, so the property clause that the producer's staged artifact is seeded from existing changelog content is checked over a single value.
- `InMemoryReleaseNotesAgentRunner` in `testing/harnesses/release/release-notes-compliance.ts` pushes the prompt's output path into `canonicalOutputPaths`, and its `canonicalizePath` returns its input, so `expect(stagedPromptPath).toBe(stagedCanonicalPath)` holds by construction.
- The cases "reads product truth even when every changed declaration has a spec commit label", "permits a product without a spec tree", and "rejects selected nodes whose specification cannot be read" in [tests/release-notes.compliance.l1.test.ts](tests/release-notes.compliance.l1.test.ts) repeat inline commit, `rev-parse HEAD`, and release-data setup that `readReleaseEndpointContext` in `testing/harnesses/release/product-context.ts` already performs; the no-spec-tree case asserts only an empty context and never drives generation.
- `arbitraryReleaseEndpointSourceScenario` in `testing/generators/release/product-context.ts` varies slugs inside six fixed topologies.
- The calendar boundary bags in `testing/generators/release/changelog.ts` are hand-labelled.

**Evidence:** two test-evidence audit rounds of the 0.9.0 release candidate returned the first four items as findings against code the candidate did not change (round one: the `containedCases` table; round two: the constant `existingNotes`, the by-construction path assertion, and the inline setup with the no-spec-tree assertion) and the last two as warnings.

**Impact:** the deterministic tests pass while the cases listed above exercise one generated value, repeat setup the harness owns, or assert an identity the harness guarantees, so they carry less evidence than their assertions declare.

**Settlement condition:** each listed expectation is produced by the generator or harness that builds its case, the seeded-changelog clause is checked over generated existing notes of varying body, commit count, changed paths, and context documents, the path-binding assertion observes a canonicalization that can differ from its input, and the inline setup in the three compliance cases is replaced by the shared harness; the node's deterministic tests pass and the test-evidence audit approves the node.
