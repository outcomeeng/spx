# Known Issues: 21-detection.enabler

## Reuse-finding source locations are emitted in file-traversal order

`buildIndex` (`src/validation/literal/detector.ts`) accumulates each literal's
source locations in the order occurrences arrive, and the production detection
entry (`src/validation/literal/index.ts`) feeds `srcOccurrences` in
`candidateFiles` traversal order without an ordinal sort. When two source files
share a literal, a reuse finding's `src` array — and a duplicate finding's
`otherTests` array — therefore reflect traversal order, so the same tree can
emit the citation list in different orders across machines and filesystems.

**Impact:** finding identity (which literal, which test location, which set of
source locations) is stable, but the citation array order is not reproducible.
The order-independence property test normalizes these inner arrays before
comparing, so it verifies the finding set rather than the array order. This is
the same non-ordinal-ordering class tracked product-wide in
[`spx/ISSUES.md`](../../../../ISSUES.md).

**Resolution:** sort each literal's location array ordinally (code-unit
comparison over file then line) in `buildIndex`, and sort `allTestLocs`
ordinally in `detectReuse`, so production emits reproducible citation order
regardless of traversal. Then the property test's inner-array normalization
becomes redundant. Owned by this node; belongs to a dedicated detector-
determinism change, not the validation-CLI-dispatch scope.
