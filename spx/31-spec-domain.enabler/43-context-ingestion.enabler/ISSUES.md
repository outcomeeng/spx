# Open Issues

## Rejection evidence leans on a harness verdict and hand-built violating configs

**Evidence:** `rejectedContextMessage` in `testing/harnesses/spec/context.ts` catches the product failure and throws when the command succeeds, so the rejection predicate behind the two ambiguity cases in `tests/context-ingestion.compliance.l1.test.ts` lives in the harness while the sibling `contextCommandFailure` already exposes the observation without a verdict. The same file hand-builds its violating methodology configs — an empty `source` and a `harnessEnvironment.methodology` section — although `testing/generators/config/descriptors.ts` owns `generatedInvalidMethodologyConfigs` and `generatedHarnessMethodologyConfig`. `tests/determinism.property.l1.test.ts` computes its own runner timeout from `PROPERTY_RUN_COUNTS` and `PROPERTY_TIMEOUTS_MS` although `testing/harnesses/property/property.ts` owns that envelope. A child directory name `21-metadata-only.enabler` is spelled by hand beside the imported `KIND_REGISTRY`, and `METHODOLOGY_FIXTURE_VERSION` in the context harness is a hand-picked version the compliance file reuses as expected output.

**Impact:** inverting the ambiguity assertion needs a harness change; the violating cases are author-chosen members rather than generator-selected; a registry suffix rename leaves the hand-spelled directory silently stale; a failing draw on the fixture version carries no generator provenance.

**Settlement condition:** the ambiguity cases consume `contextCommandFailure` and own their predicate; violating configs come from the descriptor generators; the determinism property passes its classification and lets the property harness own the envelope; the child directory derives from the registry through `specTreeFixtureNodeDirectoryName`; the fixture version is drawn from `arbitraryMethodologyVersion` or the accepted-form generator.

## The no-partial-output clause is guaranteed by structure only

**Evidence:** the in-process tests reach the failure branches of `resolveContextManifest` and prove rejection, but "emits no partial result" is a stdout-boundary property of the descriptor write in `src/interfaces/cli/spec.ts`, where the whole output is composed before any write, and no test in this node reaches that boundary.

**Impact:** a descriptor change that streams entries before resolution completes would pass every test here.

**Settlement condition:** a test drives the built executable with a failing target and asserts empty stdout beside the diagnostic.

## The `show` projection is declared ahead of its implementation

**Evidence:** the spec's `list`/`show` split, the targetless `show` product map, and the targeted Full/Digest `show` entries describe `<spx-document>` and `<spx-reference>` entries that no production path under `src/` emits and no test in this node exercises; the node declares `malleability: spec`, so the untagged assertions derive Declared.

**Impact:** the declaration leads the implementation; a consumer reading the spec as shipped behavior finds none.

**Settlement condition:** the `show` projection exists in production with co-located evidence for each of the three assertions.
