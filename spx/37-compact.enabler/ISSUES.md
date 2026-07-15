# Known Issues

## One assertion links two test files

[`spx/37-compact.enabler/compact.md`](compact.md) links both `tests/compact-cli.scenario.l2.test.ts` and `tests/compact-cli-io.scenario.l1.test.ts` from the assertion covering retrieval of the latest compact record. The spec audit requires one verification mechanism per assertion and surfaced this link shape while loading the node as constraining context.

**Resolution:** use `/test` to decide whether one test file owns the assertion or whether the declaration splits into independently quantified assertions, then use `/author` to align the spec and `/audit-tests` to verify the resulting evidence map.

**Revisit condition:** before the next `/author`, `/align`, `/test`, or implementation slice touching `spx/37-compact.enabler`.

## Executed compact tests delegate their assertions to compact test infrastructure

The `work/verification-tag-alignment` changeset moves the complete compact **assertion flow** into `testing/harnesses/compact/cli.ts` and `testing/harnesses/compact/compact.ts`. All three executed test files under this node call exported `assert*` functions, while the imported test-infrastructure modules own the behavioral predicates and every `expect`.

**Affected evidence:**

- `spx/37-compact.enabler/tests/compact-cli.scenario.l2.test.ts`
- `spx/37-compact.enabler/tests/compact-cli-io.scenario.l1.test.ts`
- `spx/37-compact.enabler/tests/compact.scenario.l1.test.ts`

This shape violates the assertion ownership defined by [`spx/12-test-infrastructure.adr.md`](../12-test-infrastructure.adr.md) and [`spx/local/typescript-tests.md`](../local/typescript-tests.md): executed test files own assertion flow and every `expect`; test infrastructure owns reusable resource lifecycle, controlled boundaries, execution policy, cleanup, and diagnostics.

**Resolution:** replace exported `assert*` functions with setup and execution functions that return typed observations. Place each behavioral predicate and `expect` in its linked executed test, and keep generated transcript, session, and path domains in compact generators.

**Skills:** `spec-tree:apply`, `spec-tree:test`, `spec-tree:audit-tests`.

**Revisit condition:** before publishing or merging the `work/verification-tag-alignment` changeset.
