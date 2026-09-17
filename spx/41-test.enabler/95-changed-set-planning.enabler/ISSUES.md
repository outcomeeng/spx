# Issues: Changed-set planning

## Path-consumed test infrastructure has no related-test reachability

`spx test --changed --base origin/main` reports these live changed paths as
unresolved even though linked test evidence consumes them:

- `testing/fixtures/release/release-notes/commit-scope.json`
- `testing/fixtures/release/release-notes/escaping-path.json`
- `testing/fixtures/release/release-notes/partial-write.json`
- `testing/fixtures/release/release-notes/release-context-endpoints.json`
- `testing/fixtures/spec-tree/public-surface-consumer.ts`
- `testing/fixtures/spec-tree/public-surface-contract.ts`
- `testing/harnesses/release/git-runner.ts`

The related-test resolver follows the registered language capability but does
not recover every evidence edge expressed through runtime path reads or through
test-infrastructure import chains. A changeset that edits only one of these
paths can therefore complete with no owning linked test selected.

**Evidence:** the passing changed-set run on Change #70 selected 410 test files
and passed 2,466 tests, then emitted `No related-test capability resolved these
changed source files` followed by the seven paths above.

**Impact:** changed-set verification can omit the evidence that consumes an
isolated fixture or indirectly imported harness, weakening the command's claim
that its selected tests cover the changed source set.

**Resolution:** related-test planning resolves runtime path-consumption and
test-infrastructure import edges for these artifact classes, with property and
scenario evidence proving that an isolated change to each class selects its
linked tests and leaves no unresolved changed-source report.
