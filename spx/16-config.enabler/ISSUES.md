# Open Issues

## Command/domain boundary assigns config behavior to the command layer

`src/commands/config/` owns config output composition, validation success text, and config-file read sequencing. `src/domains/config/` owns Commander registration, dependency construction, stream writes, and process exit. The naming suggests the inverse boundary: command modules should stay close to CLI invocation, while domain modules should own reusable config behavior.

This mismatch makes config harder to compare with other domains and makes future domain logic easy to place in `src/commands/config/` by default. It also affects the validation domain, where some command modules contain the bulk of the validation pipeline behavior.

**Resolution:** Add or revise the command/domain architecture decision before moving code. The decision should define the CLI adapter boundary, the domain behavior boundary, dependency injection ownership, and the expected test level for each side. Then refactor config first as the pilot domain and apply the same rule to validation once the pilot passes `spx validation all`.

**Skills:** `spec-tree:align`, `typescript:architect-typescript`, `typescript:audit-typescript-architecture`, `typescript:test-typescript`, `typescript:code-typescript`, `typescript:audit-typescript`.

## Spec assertions use legacy or competing verification mechanisms

[`spx/16-config.enabler/config.md`](config.md) uses legacy `[review]` evidence at lines 16, 30-31, 33-34, and 36. Lines 30-31 also attach `[test]` and `[review]` to one assertion, so one declaration names competing verification mechanisms instead of the single mechanism selected by the testing router.

**Resolution:** use `/test` to select the verification mechanism for each affected assertion, then use `/author` to rewrite the declarations and `/align` to verify the node against its decisions and evidence.

**Revisit condition:** before the next `/author`, `/align`, `/test`, or implementation slice touching `spx/16-config.enabler`.

## Executed tests delegate their assertions to config test infrastructure

The `work/verification-tag-alignment` changeset moves the **assertion flow** from two executed config tests into `testing/harnesses/config/resolution.ts`. The resulting test files only call exported `assert*` functions, while the imported test-infrastructure module owns `expect` calls and the behavioral predicates.

**Affected evidence:**

- `spx/16-config.enabler/tests/format-api.mapping.l1.test.ts` delegates its complete predicate to `assertEveryConfigFormatSupportsReadParseSerialize`.
- `spx/16-config.enabler/tests/resolution-scope.compliance.l1.test.ts` delegates its complete predicate to `assertResolutionUsesOnlyCanonicalProductConfig`.

This shape violates the assertion ownership defined by [`spx/12-test-infrastructure.adr.md`](../12-test-infrastructure.adr.md) and [`spx/local/typescript-tests.md`](../local/typescript-tests.md): executed test files own assertion flow and every `expect`; test infrastructure owns reusable resource lifecycle, controlled boundaries, execution policy, cleanup, and diagnostics.

**Resolution:** return setup and observed results from config test infrastructure, then place each behavioral predicate and `expect` in its executed test file. Move variable input domains or construction-derived expected values into config generators, and expose any required production vocabulary through its production owner.

**Skills:** `spec-tree:apply`, `spec-tree:test`, `spec-tree:audit-tests`.

**Revisit condition:** before publishing or merging the `work/verification-tag-alignment` changeset.
