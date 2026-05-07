# Completion Record: Validation CLI Dispatch Test Cleanup

## Status

Completed.

## Goal

Clean the validation CLI dispatch tests so they contain no test-owned constants,
literal text, or numbers. Test input data comes from generators. Fixtures remain
inert storage and do not supply expected values.

## Scope

Owning node:

- `spx/41-validation.enabler/21-validation-cli.enabler`

Cleaned test files:

- `tests/dispatch.scenario.l2.test.ts`
- `tests/dispatch.property.l2.test.ts`

Supporting files added:

- `testing/generators/validation/validation.ts`
- `testing/harnesses/validation/cli.ts`

## Changes Made

- Moved validation CLI subprocess timeouts, property budgets, command argv
  fragments, invalid inputs, Unicode inputs, control-character inputs, temp
  prefixes, Commander parse inputs, and packaged CLI path parts into the
  validation generator.
- Added a validation CLI harness that composes subprocess and in-process
  Commander runs from source-owned command definitions and generator-supplied
  values.
- Rewrote dispatch scenario evidence so expected diagnostics, flags, command
  names, and exit codes come from source modules.
- Rewrote dispatch property evidence so unknown subcommand candidates come from
  the generator and the dispatch verdict comes from source-owned diagnostics.

## Verification

Focused tests pass:

```bash
TEST_NODE=spx/41-validation.enabler/21-validation-cli.enabler
pnpm exec vitest run \
  "$TEST_NODE/tests/dispatch.scenario.l2.test.ts" \
  "$TEST_NODE/tests/dispatch.property.l2.test.ts"
```

Scoped lint passes:

```bash
pnpm exec tsx src/cli.ts validation lint \
  --files testing/generators/validation/validation.ts \
  testing/harnesses/validation/cli.ts \
  spx/41-validation.enabler/21-validation-cli.enabler \
  --quiet
```

Scoped TypeScript validation passes:

```bash
TEST_NODE=spx/41-validation.enabler/21-validation-cli.enabler
pnpm exec tsx src/cli.ts validation typescript \
  --files testing/generators/validation/validation.ts \
  testing/harnesses/validation/cli.ts \
  "$TEST_NODE/tests/dispatch.scenario.l2.test.ts" \
  "$TEST_NODE/tests/dispatch.property.l2.test.ts"
```

Scoped literal validation is clean:

```bash
pnpm exec tsx src/cli.ts validation literal | \
  rg "^\\[(reuse|dupe)\\].*spx/41-validation\\.enabler/21-validation-cli\\.enabler"
```

The final command prints no lines.

## Completion Notes

This node no longer appears in `spx validation literal --files-with-problems`.
The follow-on validation-tree literal cleanup has also been completed for the
remaining `spx/41-validation.enabler` files in this branch.
