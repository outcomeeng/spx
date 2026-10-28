# Issues — Spec-Tree Fixtures

## The spec-tree fixture mapping evidence rests on single draws and leaves assertions unfulfilled

**Evidence:** [`32-spec-tree-fixtures.enabler/tests/spec-tree-fixtures.mapping.l1.test.ts`](spx/22-test-environment.enabler/32-spec-tree-fixtures.enabler/tests/spec-tree-fixtures.mapping.l1.test.ts) and [`32-spec-tree-fixtures.enabler/tests/spec-tree-fixture-sources.mapping.l1.test.ts`](spx/22-test-environment.enabler/32-spec-tree-fixtures.enabler/tests/spec-tree-fixture-sources.mapping.l1.test.ts) each evidence a mapping assertion of [`32-spec-tree-fixtures.enabler/spec-tree-fixtures.md`](spx/22-test-environment.enabler/32-spec-tree-fixtures.enabler/spec-tree-fixtures.md) with one pinned-seed draw and no `it.each` or generated domain, so the mapping quantifier is uncovered.

- `generates representative entries accepted by readSpecTree` draws one fixture through `buildRepresentativeFixture` and checks only that `allNodes` contains `fixture.root.id`. Acceptance of the child node, peer node, decision, and evidence entries by `readSpecTree` is unchecked.
- The assertion that shared spec-tree fixture values live in top-level test infrastructure, not in node-local support files reused across test files, is linked to this mapping file. The file never inspects where fixture values live and exercises no violating node-local support file.
- `receives kind vocabulary through the injected registry` passes only the production `KIND_REGISTRY` and checks membership. It passes when the generator ignores the injected registry, because no differing registry is injected.
- `maps materialized filesystem fixtures to the same structure as the in-memory source` checks one default fixture, and evidence nodes are not compared.

**Impact:** both files can pass while the `readSpecTree` mapping, the shared-values compliance, and the injected-registry compliance assertions are unfulfilled, and each mapping assertion is evidenced by a single sampled case.

**Settlement condition:** each mapping assertion is evidenced across its finite domain of entry kinds, including evidence nodes in the materialized comparison; the shared-values and injected-registry compliance assertions are evidenced by files whose cases include a violating fixture and a differing injected registry; no pinned-seed single draw stands as the evidence of a mapping or compliance assertion.

## The spec-tree path-safety compliance case is author-chosen and its error message is copied

**Evidence:** [`32-spec-tree-fixtures.enabler/tests/spec-tree-env-safety.compliance.l1.test.ts`](spx/22-test-environment.enabler/32-spec-tree-fixtures.enabler/tests/spec-tree-env-safety.compliance.l1.test.ts) evidences the rule that materialized fixture paths remain constrained to the temp product directory.

- The violating slug `"../../../escape"` is a literal chosen in the test file, and the local function `withRootSlug` builds the violating fixture there instead of a generator or an inert whole-payload fixture. One violating case and no conforming case is exercised.
- `rejects.toThrow("Path escapes product directory")` copies the error message that `resolvePath` in `testing/harnesses/spec-tree/spec-tree.ts` owns, instead of importing it from its owner. The harness export list and `src/` hold no other owner of the string, and no declared schema covers it.

**Impact:** the violating case data is test-owned rather than generated, the compliance rule lacks a conforming case, and a change to the harness message breaks the test through a duplicated literal.

**Settlement condition:** the violating and conforming path cases come from a generator or an inert whole-payload fixture, and the expected error message is imported from the harness module that owns it.

## The spec-tree environment lifecycle evidence checks helper presence only

**Evidence:** [`32-spec-tree-fixtures.enabler/tests/spec-tree-env-lifecycle.scenario.l1.test.ts`](spx/22-test-environment.enabler/32-spec-tree-fixtures.enabler/tests/spec-tree-env-lifecycle.scenario.l1.test.ts) evidences the assertion that `withSpecTreeEnv`, given a Config and a callback, passes the callback `productDir`, a representative fixture, source helpers, snapshot helpers, and materialization helpers.

- `expect(env.memorySource()).toBeDefined()`, `expect(env.materialize).toBeDefined()`, and the other `toBeDefined` checks on helper members establish that a member exists. No check calls a helper or inspects what it returns.
- The fixture entries are checked with `toBeDefined` as well, so a helper replaced by a non-functional function and a fixture whose entries hold no content both pass.

**Impact:** the lifecycle scenario passes while any helper is non-functional, so the assertion that the callback receives working source, snapshot, and materialization helpers is unfulfilled.

**Settlement condition:** the lifecycle scenario calls each helper the callback receives and checks the result it returns, including the fixture entries, so replacing a helper with a non-functional function fails it.
