# Completion Record: AST Enforcement Test Cleanup

## Status

Completed.

## Scope

Owning node:

- `spx/41-validation.enabler/32-typescript-validation.enabler/32-ast-enforcement.enabler`

Cleaned test files:

- `tests/ast-enforcement.mapping.l1.test.ts`
- `tests/eslint-rules.scenario.l2.test.ts`
- `tests/no-async-spawn-outside-lifecycle.mapping.l1.test.ts`
- `tests/no-hardcoded-statuses.mapping.l1.test.ts`
- `tests/no-hardcoded-work-item-kinds.mapping.l1.test.ts`
- `tests/no-registry-position-access.mapping.l1.test.ts`
- `tests/no-test-owned-domain-constants.mapping.l1.test.ts`

Supporting files:

- `testing/generators/validation/ast-enforcement.ts`
- `testing/harnesses/validation/eslint.ts`

## Changes Made

- Exported source-owned ESLint rule names, full rule IDs, and message IDs from
  rule modules that tests previously named with raw literals.
- Rewrote RuleTester evidence so snippets, filenames, parser settings, message
  IDs, expected counts, and case names come from the validation generator.
- Added an ESLint harness for RuleTester setup, built-in rule lookup, real
  ESLint config checks, lint-text execution, severity extraction, and
  rule-message filtering.
- Rewrote real ESLint integration evidence around generated registration,
  severity, and lint scenarios.
- Kept test files as execution-only wrappers containing imports and test titles.

## Verification

Focused AST tests pass:

```bash
pnpm exec vitest run \
  spx/41-validation.enabler/32-typescript-validation.enabler/32-ast-enforcement.enabler/tests
```

Scoped TypeScript validation passes for the AST slice and supporting modules:

```bash
pnpm exec tsx src/cli.ts validation typescript --files $(rg --files -g '*.ts' \
  eslint-rules \
  testing/generators/validation \
  testing/harnesses/validation \
  spx/41-validation.enabler/32-typescript-validation.enabler/32-ast-enforcement.enabler)
```

Scoped lint passes for the AST slice and supporting modules:

```bash
pnpm exec tsx src/cli.ts validation lint \
  --files eslint-rules \
  testing/generators/validation \
  testing/harnesses/validation \
  spx/41-validation.enabler/32-typescript-validation.enabler/32-ast-enforcement.enabler \
  --quiet
```

Scoped literal validation is clean:

```bash
pnpm exec tsx src/cli.ts validation literal | \
  rg "^\\[(reuse|dupe)\\].*spx/41-validation\\.enabler/32-typescript-validation\\.enabler/32-ast-enforcement\\.enabler"
```

The final command prints no lines.
