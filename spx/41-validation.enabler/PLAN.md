# Plan: Validation

## Harness governance (in progress)

Govern the still-ungoverned validation test harnesses and generators per the **Remaining harness governance program** in `spx/PLAN.md` (uniform approach, audit gates, and literal-collision lessons).

**Governance model — builders, not drivers (refined while governing `eslint.ts`).** Govern only the reusable-builder surfaces — factories, recording objects, case-run constructors, env harnesses, generator factories — each with a `[test]` that adds net-new statement coverage of the harness and `[audit]` discipline compliance. A **scenario-driver** harness — one whose single export runs a domain node's own scenarios and embeds their assertions (`runMarkdownValidationScenario`, `runValidationLintPolicyScenario`, `runValidationPipelineScenario`) — gets **no** governance node: its behaviour is the domain node's behaviour, already governed by that node's own assertions, so a governance `[test]` would be vacuous (zero net-new coverage). A module may also split by evidence level: `eslint.ts`'s `RuleTester` builders are governed l1, while its lint-text helpers (`createValidationEslint`, `lintValidationText`, `messagesForRule`) are l2 and stay exercised by the existing `32-ast-enforcement.enabler/tests/eslint-rules.scenario.l2.test.ts` consumer.

Module disposition (builder → governing node; driver → owning domain node):

- `testing/harnesses/validation/eslint.ts` (rule-tester builders) → **done**: `spx/41-validation.enabler/32-typescript-validation.enabler/32-ast-enforcement.enabler/43-eslint-test-harness.enabler` (governs the `RuleTester` factories, runners, builtin resolution, and `severityOf`). Its ast-enforcement generator provider — `testing/generators/validation/ast-enforcement.ts` (`validationEslintRuleTesterLanguageOptions`, the case-run factories) — is the remaining builder under `32-ast-enforcement.enabler`, indexed below the harness at `32`.
- `testing/harnesses/validation/cli.ts` (builders: `runValidationSubprocess`, `runValidationInProcess`, `withEmptyValidationProject`, `expectValidationSubprocessResult`, …) → `spx/41-validation.enabler/21-validation-cli.enabler`.
- `testing/harnesses/validation/lint-policy.ts` (driver `runValidationLintPolicyScenario`) → no node; governed by `spx/41-validation.enabler/32-typescript-validation.enabler/32-lint.enabler`'s own tests.
- `testing/harnesses/validation/markdown.ts` (driver `runMarkdownValidationScenario`) → no node; governed by `spx/41-validation.enabler/65-markdown-validation.enabler`'s own tests. Its generator `testing/generators/validation/markdown.ts` (`markdownDirectoryTarget`/`markdownFileTarget` builders + scenario catalogs) is the governable surface there.
- `testing/harnesses/validation/pipeline.ts` — split: the `expectValidationStructuralMapping` assertion helper is a builder to govern; `runValidationPipelineScenario` is a driver governed by the validation domain tests.
- `testing/harnesses/validation/subprocess.ts` (builder) → shared with the CLI batch — reconcile, do not duplicate; its process-lifecycle concern points governance at the CLI batch (`spx/13-cli.enabler`).
- `testing/harnesses/with-validation-env.ts` (builder `withValidationEnv`) → `spx/41-validation.enabler` (cross-cutting).
- `testing/generators/validation/{lint-policy,markdown,validation}.ts` (builder factories) → the owning sub-enablers.

Route per builder node: `/understand` → `/contextualize <owning-node>` → `/author` the `…-test-harness`/`…-generators` enabler → `/apply` audit gates (spec-auditor + test-evidence-auditor, including the coverage gate) → `/merge`.
