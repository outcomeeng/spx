# Plan: Spec-tree fixture harness

## Purpose

Build `withSpecTreeEnv` as the spec-tree-shaped harness on top of the existing callback-scoped test environment. The harness owns representative current-spec-tree fixtures, materializes them into real temp product directories, and exposes equivalent in-memory source records so tests can prove the same behavior against both source shapes without hand-written directory trees.

## First tranche

- [x] Define the public `withSpecTreeEnv(config, callback)` surface in `testing/harnesses/spec-tree/` with callback cleanup inherited from `withTestEnv`.
- [x] Rename the environment vocabulary to `productDir` across the test-environment surface, specs, ADR text, and tests.
- [x] Replace the old environment field name in one coherent pass; no compatibility alias remains after the rename.
- [x] Add a representative fixture builder with product, root node, child node, peer node, ADR/PDR records, and evidence records.
- [x] Add materializers that write the representative fixture into a real temp product directory under `spx/`.
- [x] Add in-memory source helpers that emit the same entries as the filesystem materializer.
- [x] Add snapshot helpers that return `readSpecTree` and `projectSpecTree` results for both materialized and in-memory fixtures.
- [x] Prove cleanup, isolation, safety, and generator validity still hold after the `productDir` rename.

## API sketch

```ts
await withSpecTreeEnv(config, async (env) => {
  env.productDir;
  env.fixture.entries;
  await env.materialize(env.fixture);
  await env.readFilesystemSnapshot();
  await env.readMemorySnapshot();
});
```

The API sketch is illustrative. The implementation pass owns the exact type names after reading the current `withTestEnv` code and routing every assertion through the testing skill.

## Evidence matrix

| Need                                                     | Evidence                                          | Target file                                          |
| -------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------- |
| Callback cleanup remains guaranteed on return and throw  | Scenario/property tests against `withSpecTreeEnv` | `tests/spec-tree-env-lifecycle.scenario.l1.test.ts`  |
| `productDir` is the public repository-root name          | Lifecycle scenario plus spec/ADR review           | `tests/spec-tree-env-lifecycle.scenario.l1.test.ts`  |
| Representative fixtures are accepted by `readSpecTree`   | Mapping test from generated entries to snapshot   | `tests/spec-tree-fixtures.mapping.l1.test.ts`        |
| Filesystem and memory fixtures describe the same tree    | Mapping test comparing projections                | `tests/spec-tree-fixture-sources.mapping.l1.test.ts` |
| Fixture values come from injected registry vocabulary    | Compliance test using a test-scoped registry      | `tests/spec-tree-fixtures.mapping.l1.test.ts`        |
| Generated paths cannot escape the temp product directory | Safety test through materializer helpers          | `tests/spec-tree-env-safety.compliance.l1.test.ts`   |

## Remaining work

- [ ] Replace direct `withTestEnv` usage in spec-tree and spec-domain tests when the assertion needs a current spec-tree shape.
- [ ] Keep direct `withTestEnv` usage for primitive config/file tests that do not need a spec-tree fixture.
- [ ] Move any reusable node-local fixture constants into top-level test infrastructure.
- [x] Remove deprecated fixture directories after current target tests no longer read them.
- [x] Re-run the test-environment tests, `spx validation all`, and the full package test gate after the harness rename.

## Tracked Deferrals

- [ ] Resolve the 5 warning-level `spx/no-test-owned-domain-constants` findings reported by `pnpm run validate` on May 12, 2026:
  - `spx/22-test-environment.enabler/tests/generators.unit.test.ts`
  - `spx/22-test-environment.enabler/tests/helpers.unit.test.ts`

## Acceptance

- [ ] No spec-tree test hand-writes a representative product/root/child/peer directory tree when `withSpecTreeEnv` can provide it.
- [x] No public test-environment API, spec assertion, or ADR prose uses legacy repository-root vocabulary.
- [ ] Filesystem and in-memory fixture paths are generated from the same fixture model.
- [x] Every materialized fixture is accepted by `readSpecTree`.
- [x] Every helper that writes files remains constrained to the temp product directory.

## Implementation Ownership

T1 may edit `testing/harnesses/spec-tree/assertions.ts`, `testing/harnesses/spec-tree/generators.ts`, `testing/harnesses/spec-tree/spec-tree.ts`, and `testing/generators/spec-tree/spec-tree.ts`. Migrate only tests in this node's directory. If a consumer test in a sibling node needs updating, record the file path in this PLAN's Open Coordination and let the owning packet migrate it.

## Open Coordination

- Record sibling consumer tests here when T1 discovers they need fixture-harness migration owned by another packet.

## Agent Pickup Prompt

```text
Before branching, follow the common packet rules in `spx/16-config.enabler/PLAN.md`, including the branch-existence guard and settled-prerequisite checks.

Start from fresh origin/main on work/spec-tree-fixture-migration after C2 (`spx/16-config.enabler/65-product-directory-api.enabler/`) merges. Invoke spec-tree:understanding if needed, then spec-tree:contextualizing for spx/22-test-environment.enabler/32-spec-tree-fixtures.enabler/. Read this PLAN and the governing specs it names. Invoke spec-tree:applying, spec-tree:testing, typescript:testing-typescript, and typescript:coding-typescript before edits.

Before branching, verify `git cat-file -e origin/main:spx/16-config.enabler/65-product-directory-api.enabler/product-directory-api.md` succeeds for the C2 product-directory API artifacts. Replace direct withTestEnv usage only where the assertion needs a current spec-tree shape. Keep withTestEnv for primitive config and file tests that only need a temp productDir. Follow the Implementation Ownership section above for shared-helper edit boundaries. Prove filesystem and in-memory fixture paths come from the same fixture model. Open one PR and ask reviewers to audit fixture ownership, real-file coverage, and productDir vocabulary.
```
