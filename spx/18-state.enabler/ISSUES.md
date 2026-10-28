# Issues: State

## DEBT — STATE_STORE_DOMAIN may retire entirely once compact and test adopt opaque-token scopes

The verification restructure removed the `audit` and `review` entries from
`STATE_STORE_DOMAIN` (`src/lib/state-store/index.ts`): the journal channel takes
its `<type>` scope segment as a caller-supplied opaque string validated only for
path-safety by `domainDir`, so it needs no enum entry. The enum still enumerates
`compact` and `test` because their consumers — `src/domains/compact/index.ts`
(COMPACT) and `src/test/run-state.ts` (TEST) — still pass a fixed domain
token.

Open question: should `STATE_STORE_DOMAIN` be retired entirely once the COMPACT
and TEST callers also adopt the caller-supplied opaque-token model, or retained
as a compact/test-specific enum? Retiring it spans the compact (`spx/37-compact.enabler`)
and testing (`spx/41-test.enabler`) domains — work outside the verification
restructure — so it is tracked here rather than folded into that changeset.

## FILED — Git utility conformance and property evidence keeps its predicates in the shared harness

Evidence: a test-evidence audit of `spx/18-state.enabler/43-git-utility.enabler`
filed finding f-001 (rule assertion-seam, property predicate-ownership) on
`testing/harnesses/git/changed-paths.ts`. The linked tests
`spx/18-state.enabler/43-git-utility.enabler/tests/git-utility.conformance.l1.test.ts`
and `spx/18-state.enabler/43-git-utility.enabler/tests/git-utility.property.l1.test.ts`
are each a three-line registration that only calls a register function. The
harness owns every `expect` call and the expected values:

- A committed range maps base and head to the product paths emitted by
  `git diff --name-status -z base..head`: `registerGitUtilityConformanceTests`
  calls `expect(changedPathsForCommittedRange(...))` inside the harness.
- Rename and copy name-status records include every product path the record
  names: `registerGitUtilityPropertyTests` calls
  `expect(pathsFromNameStatus(...)).toEqual(uniqueSorted(paths))` inside the
  harness.

Impact: the pass/fail predicate is not visible in the linked test, so the tests
fail predicate inversion. Severity FILED: it blocks nothing, and the finding sits
on text the originating Change does not change.

Settlement: the predicates and expected values live in the linked test
functions, and the harness returns observations only.
